import { randomUUID } from 'node:crypto';
import {
  claimAnalysisJobs,
  closeWorkerPool,
  completeAnalysisJob,
  failAnalysisJob,
  processEvidenceAnalysisJob
} from './workerRepository.js';

const DEFAULT_POLL_MS = Number(process.env.TRADE_IN_WORKER_POLL_MS || 3000);
const DEFAULT_CONCURRENCY = Number(process.env.TRADE_IN_ANALYSIS_CONCURRENCY || 4);
const DEFAULT_PER_CASE_CONCURRENCY = Number(process.env.TRADE_IN_ANALYSIS_PER_CASE_CONCURRENCY || 2);
const DEFAULT_CLAIM_LIMIT = Number(process.env.TRADE_IN_ANALYSIS_CLAIM_LIMIT || Math.max(DEFAULT_CONCURRENCY * 2, 4));
const DEFAULT_TIMEOUT_MS = Number(process.env.TRADE_IN_ANALYSIS_JOB_TIMEOUT_MS || 300000);

export async function runWorkerBatch({
  workerId = `trade-in-worker-${process.pid}-${randomUUID().slice(0, 8)}`,
  claimLimit = DEFAULT_CLAIM_LIMIT,
  concurrency = DEFAULT_CONCURRENCY,
  perCaseConcurrency = DEFAULT_PER_CASE_CONCURRENCY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  logger = console
} = {}) {
  const jobs = await claimAnalysisJobs({ limit: claimLimit, workerId, timeoutMs });
  if (!jobs.length) return { workerId, claimed: 0, completed: 0, failed: 0, jobs: [] };

  const results = await runWithConcurrency(jobs, {
    concurrency,
    perGroupLimit: perCaseConcurrency,
    groupKey: job => job.tradeCaseId
  }, async job => {
    try {
      const result = await processEvidenceAnalysisJob(job);
      await completeAnalysisJob(job.id, result || {});
      return { jobId: job.id, evidenceItemId: job.evidenceItemId, status: 'succeeded' };
    } catch (error) {
      await failAnalysisJob(job, error);
      logger.warn?.(`Evidence analysis job ${job.id} failed: ${error.message || error}`);
      return { jobId: job.id, evidenceItemId: job.evidenceItemId, status: 'failed', error: error.message || String(error) };
    }
  });

  return {
    workerId,
    claimed: jobs.length,
    completed: results.filter(result => result.status === 'succeeded').length,
    failed: results.filter(result => result.status === 'failed').length,
    jobs: results
  };
}

export async function runWorkerLoop(options = {}) {
  const pollMs = Number(options.pollMs ?? DEFAULT_POLL_MS);
  const logger = options.logger || console;
  let stopped = false;

  const stop = () => {
    stopped = true;
  };

  while (!stopped) {
    const result = await runWorkerBatch({ ...options, logger });
    if (result.claimed > 0) {
      logger.log?.(`trade-in worker processed batch: ${JSON.stringify({
        claimed: result.claimed,
        completed: result.completed,
        failed: result.failed
      })}`);
      continue;
    }
    await sleep(pollMs);
  }

  return { stopped: true, stop };
}

export async function runWithConcurrency(items, options, handler) {
  const concurrency = Math.max(1, Number(options?.concurrency || 1));
  const perGroupLimit = Math.max(1, Number(options?.perGroupLimit || concurrency));
  const groupKey = options?.groupKey || (() => 'default');
  const results = new Array(items.length);
  const activeGroups = new Map();
  const queue = items.map((item, index) => ({ item, index }));
  const active = new Set();

  return new Promise((resolve, reject) => {
    const launchNext = () => {
      if (!queue.length && active.size === 0) return resolve(results);

      let launched = false;
      for (let i = 0; i < queue.length && active.size < concurrency; i += 1) {
        const entry = queue[i];
        const key = String(groupKey(entry.item) || 'default');
        const activeForGroup = activeGroups.get(key) || 0;
        if (activeForGroup >= perGroupLimit) continue;

        queue.splice(i, 1);
        i -= 1;
        activeGroups.set(key, activeForGroup + 1);
        const task = Promise.resolve()
          .then(() => handler(entry.item, entry.index))
          .then(result => {
            results[entry.index] = result;
          })
          .catch(reject)
          .finally(() => {
            active.delete(task);
            const nextGroupCount = (activeGroups.get(key) || 1) - 1;
            if (nextGroupCount <= 0) activeGroups.delete(key);
            else activeGroups.set(key, nextGroupCount);
            launchNext();
          });
        active.add(task);
        launched = true;
      }

      if (!launched && active.size === 0 && queue.length > 0) {
        reject(new Error('Worker scheduler could not launch queued jobs'));
      }
    };

    launchNext();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const workerId = process.env.TRADE_IN_WORKER_ID || `trade-in-worker-${process.pid}`;
  let stopping = false;

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await closeWorkerPool();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(`trade-in-agent-worker starting as ${workerId}`);
  while (!stopping) {
    await runWorkerBatch({ workerId }).catch(error => {
      console.error(`trade-in-agent-worker batch failed: ${error.message || error}`);
    });
    await sleep(DEFAULT_POLL_MS);
  }
}
