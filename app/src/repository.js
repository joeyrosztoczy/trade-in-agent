import { query, withTransaction } from './db.js';
import { computeChecklist, normalizeUnitType } from './checklists.js';
import { generateDemoValuation, isDemoValuationEnabled } from './demoValuation.js';
import { analyzeEvidenceMedia } from './visualInference.js';
import { computeRoutingDecision } from './routing.js';
import {
  buildGuidanceMessage,
  buildProcessingAcknowledgementMessage,
  buildReviewerBrief,
  describeChecklistSlots,
  evidenceRequestsForSlots,
  packetToMarkdown,
  reviewStatusLabel,
  routeLabel
} from './presentation.js';

const DEFAULT_ANALYSIS_JOB_TYPE = 'field_evidence_quality';
const READY_JOB_STATUSES = ['queued', 'failed_retryable'];

function toTradeCase(row, machine = null, evidenceItems = undefined) {
  return {
    id: row.id,
    caseNumber: formatCaseNumber(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    sourceConversationId: row.source_conversation_id,
    status: row.status,
    route: row.route,
    confidence: numberOrNull(row.confidence),
    assignedReviewer: row.assigned_reviewer,
    reviewStatus: row.review_status,
    reviewNotes: row.review_notes,
    reviewUpdatedAt: row.review_updated_at,
    routeReason: row.route_reason,
    riskFlags: row.risk_flags_json || [],
    routingDecision: row.routing_decision_json || {},
    archivedAt: row.archived_at,
    active: row.active,
    machine,
    evidenceItems
  };
}

function formatCaseNumber(id) {
  return `TIA-${String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function machinePayload(input = {}) {
  return {
    unitType: normalizeUnitType(input.unitType || input.unit_type || 'combine'),
    make: input.make || null,
    model: input.model || null,
    modelYear: input.modelYear || input.model_year || null,
    serialOrPin: input.serialOrPin || input.serial_or_pin || null,
    engineHours: input.engineHours ?? input.engine_hours ?? null,
    separatorHours: input.separatorHours ?? input.separator_hours ?? null,
    location: input.location || null,
    attachmentsOrOptions: input.attachmentsOrOptions || input.attachments_or_options || null
  };
}

export async function healthCheck() {
  const result = await query('SELECT NOW() AS now');
  let analysisQueue = null;
  try {
    analysisQueue = await summarizeAnalysisQueue();
  } catch (error) {
    analysisQueue = { available: false, error: error.message };
  }
  return { ok: true, databaseTime: result.rows[0].now, analysisQueue };
}

export async function createTradeCase(input = {}) {
  return withTransaction(async client => {
    const caseResult = await client.query(
      `INSERT INTO trade_cases (created_by, source_conversation_id, status, route, confidence, assigned_reviewer)
       VALUES ($1, $2, COALESCE($3, 'draft'), COALESCE($4, 'draft'), $5, $6)
       RETURNING *`,
      [
        input.createdBy || input.created_by || 'local-dev',
        input.sourceConversationId || input.source_conversation_id || null,
        input.status || null,
        input.route || null,
        input.confidence ?? null,
        input.assignedReviewer || input.assigned_reviewer || null
      ]
    );

    const machine = machinePayload(input.machine || {});
    const machineResult = await client.query(
      `INSERT INTO machines (
        trade_case_id, unit_type, make, model, model_year, serial_or_pin,
        engine_hours, separator_hours, location, attachments_or_options
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        caseResult.rows[0].id,
        machine.unitType,
        machine.make,
        machine.model,
        machine.modelYear,
        machine.serialOrPin,
        machine.engineHours,
        machine.separatorHours,
        machine.location,
        machine.attachmentsOrOptions
      ]
    );

    return toTradeCase(caseResult.rows[0], rowToMachine(machineResult.rows[0]), []);
  });
}

export async function listTradeCases({ includeArchived = false } = {}) {
  const result = await query(
    `SELECT tc.*, row_to_json(m.*) AS machine
     FROM trade_cases tc
     LEFT JOIN machines m ON m.trade_case_id = tc.id
     WHERE ($1::boolean OR tc.archived_at IS NULL)
     ORDER BY tc.created_at DESC`,
    [includeArchived]
  );

  return result.rows.map(row => {
    const machine = row.machine ? rowToMachine(row.machine) : null;
    return toTradeCase(row, machine);
  });
}

export async function listReviewCases({ includeArchived = false, limit = 100 } = {}) {
  const result = await query(
    `SELECT tc.*, row_to_json(m.*) AS machine
     FROM trade_cases tc
     LEFT JOIN machines m ON m.trade_case_id = tc.id
     WHERE ($1::boolean OR tc.archived_at IS NULL)
     ORDER BY tc.review_updated_at DESC NULLS LAST, tc.updated_at DESC, tc.created_at DESC
     LIMIT $2`,
    [includeArchived, Math.max(1, Math.min(Number(limit) || 100, 250))]
  );

  const items = [];
  for (const row of result.rows) {
    items.push(await buildReviewCase(row, { detail: false }));
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: buildReviewQueueSummary(items),
    items
  };
}

export async function getReviewCase(id) {
  const result = await query(
    `SELECT tc.*, row_to_json(m.*) AS machine
     FROM trade_cases tc
     LEFT JOIN machines m ON m.trade_case_id = tc.id
     WHERE tc.id = $1`,
    [id]
  );
  if (!result.rows.length) return null;
  return buildReviewCase(result.rows[0], { detail: true });
}

export async function recordReviewAction(id, input = {}) {
  const actionType = input.actionType || input.action_type || 'note';
  const reviewer = input.reviewer || input.reviewedBy || input.reviewed_by || 'local-reviewer';
  const note = input.note || input.notes || null;
  const nextReviewStatus = input.reviewStatus || input.review_status || reviewStatusForAction(actionType);
  const nextRoute = input.route || routeForAction(actionType);
  const packetId = input.packetId || input.packet_id || null;
  const payload = input.payload || input.metadata || {};

  const inserted = await withTransaction(async client => {
    const exists = await client.query('SELECT * FROM trade_cases WHERE id = $1', [id]);
    if (!exists.rows.length) return null;

    const action = await client.query(
      `INSERT INTO review_actions (
        trade_case_id, reviewer, action_type, note, review_status, route, packet_id, payload_json
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [id, reviewer, actionType, note, nextReviewStatus, nextRoute, packetId, payload]
    );

    await client.query(
      `UPDATE trade_cases
       SET review_status = COALESCE($2, review_status),
           route = COALESCE($3, route),
           review_notes = COALESCE($4, review_notes),
           assigned_reviewer = COALESCE($5, assigned_reviewer),
           review_updated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [id, nextReviewStatus, nextRoute, note, reviewer]
    );

    return action.rows[0];
  });

  if (!inserted) return null;
  return getReviewCase(id);
}

export async function getTradeCase(id) {
  const result = await query(
    `SELECT tc.*, row_to_json(m.*) AS machine
     FROM trade_cases tc
     LEFT JOIN machines m ON m.trade_case_id = tc.id
     WHERE tc.id = $1`,
    [id]
  );
  if (!result.rows.length) return null;

  const evidence = await listEvidence(id);
  const row = result.rows[0];
  return toTradeCase(row, row.machine ? rowToMachine(row.machine) : null, evidence);
}

export async function getActiveTradeCase(sourceConversationId) {
  if (!sourceConversationId) return null;
  const result = await query(
    `SELECT tc.*, row_to_json(m.*) AS machine
     FROM trade_cases tc
     LEFT JOIN machines m ON m.trade_case_id = tc.id
     WHERE tc.source_conversation_id = $1
       AND tc.archived_at IS NULL
       AND tc.active = TRUE
     ORDER BY tc.updated_at DESC
     LIMIT 1`,
    [sourceConversationId]
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return toTradeCase(row, row.machine ? rowToMachine(row.machine) : null, await listEvidence(row.id));
}

export async function updateTradeCase(id, input = {}) {
  return withTransaction(async client => {
    const existing = await client.query('SELECT * FROM trade_cases WHERE id = $1', [id]);
    if (!existing.rows.length) return null;

    const current = existing.rows[0];
    const caseResult = await client.query(
      `UPDATE trade_cases
       SET status = $2,
           route = $3,
           confidence = $4,
           assigned_reviewer = $5,
           source_conversation_id = $6,
           review_status = $7,
           review_notes = $8,
           route_reason = $9,
           risk_flags_json = $10::jsonb,
           routing_decision_json = $11::jsonb,
           review_updated_at = CASE
             WHEN $7 IS DISTINCT FROM review_status OR $8 IS DISTINCT FROM review_notes THEN NOW()
             ELSE review_updated_at
           END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.status ?? current.status,
        input.route ?? current.route,
        input.confidence ?? current.confidence,
        input.assignedReviewer ?? input.assigned_reviewer,
        input.sourceConversationId ?? input.source_conversation_id,
        input.reviewStatus ?? input.review_status ?? current.review_status,
        input.reviewNotes ?? input.review_notes ?? current.review_notes,
        input.routeReason ?? input.route_reason ?? current.route_reason,
        JSON.stringify(input.riskFlags ?? input.risk_flags_json ?? current.risk_flags_json ?? []),
        JSON.stringify(input.routingDecision ?? input.routing_decision_json ?? current.routing_decision_json ?? {})
      ]
    );

    let machine = null;
    if (input.machine) {
      const currentMachine = await client.query('SELECT * FROM machines WHERE trade_case_id = $1', [id]);
      const merged = {
        ...rowToMachine(currentMachine.rows[0] || {}),
        ...input.machine
      };
      const normalized = machinePayload(merged);
      const machineResult = await client.query(
        `INSERT INTO machines (
          trade_case_id, unit_type, make, model, model_year, serial_or_pin,
          engine_hours, separator_hours, location, attachments_or_options
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (trade_case_id) DO UPDATE SET
          unit_type = EXCLUDED.unit_type,
          make = EXCLUDED.make,
          model = EXCLUDED.model,
          model_year = EXCLUDED.model_year,
          serial_or_pin = EXCLUDED.serial_or_pin,
          engine_hours = EXCLUDED.engine_hours,
          separator_hours = EXCLUDED.separator_hours,
          location = EXCLUDED.location,
          attachments_or_options = EXCLUDED.attachments_or_options,
          updated_at = NOW()
        RETURNING *`,
        [
          id,
          normalized.unitType,
          normalized.make,
          normalized.model,
          normalized.modelYear,
          normalized.serialOrPin,
          normalized.engineHours,
          normalized.separatorHours,
          normalized.location,
          normalized.attachmentsOrOptions
        ]
      );
      machine = rowToMachine(machineResult.rows[0]);
    } else {
      const machineResult = await client.query('SELECT * FROM machines WHERE trade_case_id = $1', [id]);
      machine = machineResult.rows[0] ? rowToMachine(machineResult.rows[0]) : null;
    }

    return toTradeCase(caseResult.rows[0], machine, await listEvidence(id));
  });
}

export async function archiveTradeCase(id) {
  const result = await query(
    `UPDATE trade_cases
     SET status = 'archived', archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND archived_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

export async function addEvidence(id, input = {}) {
  const exists = await query('SELECT id FROM trade_cases WHERE id = $1', [id]);
  if (!exists.rows.length) return null;

  const sourceAttachmentId = input.sourceAttachmentId || input.source_attachment_id || null;
  if (sourceAttachmentId) {
    const existing = await query(
      `SELECT * FROM evidence_items
       WHERE trade_case_id = $1 AND source_attachment_id = $2
       ORDER BY uploaded_at DESC
       LIMIT 1`,
      [id, sourceAttachmentId]
    );
    if (existing.rows.length) return rowToEvidence(existing.rows[0]);
  }

  const result = await query(
    `INSERT INTO evidence_items (
      trade_case_id, uploaded_by, media_type, storage_uri,
      checklist_slot, quality_status, analysis_status, notes,
      original_file_name, content_type, source_message_id, source_attachment_id,
      metadata_json, checklist_slot_confidence
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      id,
      input.uploadedBy || input.uploaded_by || 'local-dev',
      input.mediaType || input.media_type || 'photo',
      input.storageUri || input.storage_uri || null,
      input.checklistSlot || input.checklist_slot || null,
      input.qualityStatus || input.quality_status || 'pending',
      input.analysisStatus || input.analysis_status || 'pending',
      input.notes || null,
      input.originalFileName || input.original_file_name || null,
      input.contentType || input.content_type || null,
      input.sourceMessageId || input.source_message_id || null,
      input.sourceAttachmentId || input.source_attachment_id || null,
      input.metadata || input.metadata_json || {},
      input.checklistSlotConfidence ?? input.checklist_slot_confidence ?? null
    ]
  );
  return rowToEvidence(result.rows[0]);
}

export async function addEvidenceBatch(id, input = {}) {
  const items = Array.isArray(input.items) ? input.items : Array.isArray(input.evidence) ? input.evidence : [];
  const processingMode = normalizeProcessingMode(input.processingMode || input.processing_mode || 'async');
  const shouldQueue = processingMode === 'async';
  const created = [];
  for (const item of items) {
    const evidence = await addEvidence(id, {
      ...item,
      analysisStatus: shouldQueue ? 'queued' : item.analysisStatus,
      analysis_status: shouldQueue ? 'queued' : item.analysis_status
    });
    if (!evidence) return null;
    created.push(evidence);
  }

  const queuedJobs = [];
  if (shouldQueue) {
    for (const [index, evidence] of created.entries()) {
      const sourceItem = items[index] || {};
      const job = await queueEvidenceAnalysisJob(id, evidence.id, {
        jobType: sourceItem.jobType || input.jobType || DEFAULT_ANALYSIS_JOB_TYPE,
        priority: sourceItem.priority ?? input.priority ?? defaultEvidencePriority(evidence),
        maxAttempts: sourceItem.maxAttempts ?? input.maxAttempts,
        payload: buildAnalysisJobPayload({ input, item: sourceItem, evidence })
      });
      queuedJobs.push(job);
    }
  }

  const processingSummary = await getProcessingSummary(id);
  const guidance = shouldQueue ? await generateGuidance(id) : null;
  const caseNumber = formatCaseNumber(id);
  const queuedSlots = new Set(created.map(evidence => evidence.checklistSlot).filter(Boolean));
  const nextEvidenceRequests = filterRequestsForQueuedSlots(guidance?.nextEvidenceRequests || [], queuedSlots);
  const acknowledgementChecklist = filterChecklistForQueuedSlots(guidance?.checklist || {}, queuedSlots);
  const activeQueuedCount = queuedJobs.filter(job => job.status !== 'succeeded').length;
  const message = shouldQueue
    ? buildProcessingAcknowledgementMessage({
        caseNumber,
        registeredCount: created.length,
        queuedCount: activeQueuedCount,
        nextEvidenceRequests,
        checklist: acknowledgementChecklist,
        unitType: acknowledgementChecklist.unitType
      })
    : undefined;

  return {
    tradeCaseId: id,
    caseNumber,
    items: created,
    registeredCount: created.length,
    queuedCount: activeQueuedCount,
    jobs: queuedJobs,
    processingSummary,
    nextEvidenceRequests,
    message
  };
}

export async function updateEvidence(tradeCaseId, evidenceId, input = {}) {
  const currentResult = await query(
    'SELECT * FROM evidence_items WHERE trade_case_id = $1 AND id = $2',
    [tradeCaseId, evidenceId]
  );
  if (!currentResult.rows.length) return null;
  const current = currentResult.rows[0];

  const result = await query(
    `UPDATE evidence_items
     SET uploaded_by = $3,
         media_type = $4,
         storage_uri = $5,
         checklist_slot = $6,
         quality_status = $7,
         analysis_status = $8,
         notes = $9,
         original_file_name = $10,
         content_type = $11,
         source_message_id = $12,
         source_attachment_id = $13,
         metadata_json = $14,
         checklist_slot_confidence = $15
     WHERE trade_case_id = $1 AND id = $2
     RETURNING *`,
    [
      tradeCaseId,
      evidenceId,
      input.uploadedBy ?? input.uploaded_by ?? current.uploaded_by,
      input.mediaType ?? input.media_type ?? current.media_type,
      input.storageUri ?? input.storage_uri ?? current.storage_uri,
      input.checklistSlot ?? input.checklist_slot ?? current.checklist_slot,
      input.qualityStatus ?? input.quality_status ?? current.quality_status,
      input.analysisStatus ?? input.analysis_status ?? current.analysis_status,
      input.notes ?? current.notes,
      input.originalFileName ?? input.original_file_name ?? current.original_file_name,
      input.contentType ?? input.content_type ?? current.content_type,
      input.sourceMessageId ?? input.source_message_id ?? current.source_message_id,
      input.sourceAttachmentId ?? input.source_attachment_id ?? current.source_attachment_id,
      input.metadata ?? input.metadata_json ?? current.metadata_json,
      input.checklistSlotConfidence ?? input.checklist_slot_confidence ?? current.checklist_slot_confidence
    ]
  );
  return rowToEvidence(result.rows[0]);
}

export async function listEvidence(id) {
  const result = await query(
    `SELECT * FROM evidence_items WHERE trade_case_id = $1 ORDER BY uploaded_at ASC, id ASC`,
    [id]
  );
  return result.rows.map(rowToEvidence);
}

export async function listFindings(id) {
  const result = await query(
    `SELECT * FROM analysis_findings
     WHERE trade_case_id = $1
     ORDER BY created_at ASC, id ASC`,
    [id]
  );
  return result.rows.map(rowToFinding);
}

async function persistRoutingDecision(id, routing) {
  await query(
    `UPDATE trade_cases
     SET route = $2,
         confidence = $3,
         review_status = $4,
         route_reason = $5,
         risk_flags_json = $6::jsonb,
         routing_decision_json = $7::jsonb,
         review_updated_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      routing.route,
      routing.confidence,
      routing.reviewStatus,
      routing.routeReason,
      JSON.stringify(routing.riskFlags),
      JSON.stringify(routing)
    ]
  );
}

export async function analyzeEvidence(tradeCaseId, evidenceId, input = {}) {
  if (shouldAnalyzeAsync(input, { defaultMode: 'async' })) {
    return queueEvidenceAnalysis(tradeCaseId, evidenceId, input);
  }

  return withTransaction(async client => {
    const tradeCaseResult = await client.query(
      `SELECT tc.*, row_to_json(m.*) AS machine
       FROM trade_cases tc
       LEFT JOIN machines m ON m.trade_case_id = tc.id
       WHERE tc.id = $1`,
      [tradeCaseId]
    );
    if (!tradeCaseResult.rows.length) return null;

    const evidenceResult = await client.query(
      'SELECT * FROM evidence_items WHERE trade_case_id = $1 AND id = $2',
      [tradeCaseId, evidenceId]
    );
    if (!evidenceResult.rows.length) return null;

    const tradeCase = toTradeCase(
      tradeCaseResult.rows[0],
      tradeCaseResult.rows[0].machine ? rowToMachine(tradeCaseResult.rows[0].machine) : null
    );
    const evidence = rowToEvidence(evidenceResult.rows[0]);
    const inference = await analyzeEvidenceMedia({ evidence, tradeCase, request: input });
    const normalized = inference.normalized;

    const updatedEvidenceResult = await client.query(
      `UPDATE evidence_items
       SET analysis_status = $3,
           quality_status = $4,
           checklist_slot = COALESCE($5, checklist_slot),
           checklist_slot_confidence = $6,
           metadata_json = metadata_json || $7::jsonb
       WHERE trade_case_id = $1 AND id = $2
       RETURNING *`,
      [
        tradeCaseId,
        evidenceId,
        normalized.analysisStatus || 'complete',
        normalized.qualityStatus || evidence.qualityStatus,
        normalized.checklistSlot || input.checklistSlot || input.checklist_slot || null,
        normalized.checklistSlotConfidence,
        { visualInference: { provider: inference.provider, model: inference.model, mode: inference.mode, promptVersion: inference.promptVersion } }
      ]
    );

    await client.query(
      `INSERT INTO visual_inference_results (
        evidence_item_id, trade_case_id, provider, model, mode, prompt_version,
        request_json, response_json, raw_response_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        evidenceId,
        tradeCaseId,
        inference.provider,
        inference.model,
        inference.mode,
        inference.promptVersion,
        input,
        normalized,
        inference.rawResponse
      ]
    );

    await client.query('DELETE FROM analysis_findings WHERE trade_case_id = $1 AND evidence_item_id = $2', [tradeCaseId, evidenceId]);
    for (const finding of normalized.visibleConditionFindings || []) {
      await insertFinding(client, tradeCaseId, evidenceId, {
        findingType: 'condition',
        section: finding.section,
        finding: finding.finding,
        severity: finding.severity,
        confidence: finding.confidence,
        needsFollowUp: finding.needsFollowUp,
        recommendation: finding.recommendation
      });
    }
    for (const finding of normalized.evidenceQualityFindings || []) {
      await insertFinding(client, tradeCaseId, evidenceId, {
        findingType: 'evidence_quality',
        section: normalized.checklistSlot || evidence.checklistSlot,
        finding: finding.issue,
        severity: normalized.qualityStatus === 'needs_retake' ? 'concern' : 'info',
        confidence: normalized.checklistSlotConfidence,
        needsFollowUp: Boolean(finding.recommendation),
        recommendation: finding.recommendation
      });
    }
    for (const uncertainty of normalized.uncertainty || []) {
      await insertFinding(client, tradeCaseId, evidenceId, {
        findingType: 'uncertainty',
        section: normalized.checklistSlot || evidence.checklistSlot,
        finding: uncertainty,
        severity: 'info',
        confidence: null,
        needsFollowUp: false,
        recommendation: null
      });
    }

    return {
      evidence: rowToEvidence(updatedEvidenceResult.rows[0]),
      analysis: normalized,
      provider: inference.provider,
      model: inference.model,
      mode: inference.mode
    };
  });
}

export async function queueEvidenceAnalysis(tradeCaseId, evidenceId, input = {}) {
  const tradeCase = await getTradeCase(tradeCaseId);
  if (!tradeCase) return null;
  const evidence = (tradeCase.evidenceItems || []).find(item => item.id === evidenceId);
  if (!evidence) return null;

  await updateEvidence(tradeCaseId, evidenceId, { analysisStatus: 'queued' });
  const job = await queueEvidenceAnalysisJob(tradeCaseId, evidenceId, {
    jobType: input.jobType || input.job_type || DEFAULT_ANALYSIS_JOB_TYPE,
    priority: input.priority ?? defaultEvidencePriority(evidence),
    maxAttempts: input.maxAttempts ?? input.max_attempts,
    payload: stripAsyncFlags({
      ...input,
      analysisMode: input.analysisMode || input.analysis_mode || DEFAULT_ANALYSIS_JOB_TYPE,
      checklistSlot: input.checklistSlot || input.checklist_slot || evidence.checklistSlot
    })
  });

  return {
    tradeCaseId,
    caseNumber: tradeCase.caseNumber,
    evidenceId,
    jobId: job.id,
    analysisStatus: job.status === 'succeeded' ? 'complete' : 'queued',
    job,
    processingSummary: await getProcessingSummary(tradeCaseId)
  };
}

export async function queueEvidenceAnalysisJob(tradeCaseId, evidenceId, input = {}) {
  const jobType = input.jobType || input.job_type || DEFAULT_ANALYSIS_JOB_TYPE;
  const result = await query(
    `INSERT INTO evidence_analysis_jobs (
      trade_case_id, evidence_item_id, job_type, status, priority, max_attempts, payload_json
    )
    VALUES ($1,$2,$3,'queued',$4,$5,$6)
    ON CONFLICT (evidence_item_id, job_type) WHERE status <> 'cancelled'
    DO UPDATE SET
      status = CASE
        WHEN evidence_analysis_jobs.status IN ('processing', 'succeeded') THEN evidence_analysis_jobs.status
        ELSE 'queued'
      END,
      priority = LEAST(evidence_analysis_jobs.priority, EXCLUDED.priority),
      max_attempts = GREATEST(evidence_analysis_jobs.max_attempts, EXCLUDED.max_attempts),
      payload_json = EXCLUDED.payload_json,
      error = CASE
        WHEN evidence_analysis_jobs.status IN ('processing', 'succeeded') THEN evidence_analysis_jobs.error
        ELSE NULL
      END,
      next_attempt_at = CASE
        WHEN evidence_analysis_jobs.status IN ('processing', 'succeeded') THEN evidence_analysis_jobs.next_attempt_at
        ELSE NOW()
      END,
      updated_at = NOW()
    RETURNING *`,
    [
      tradeCaseId,
      evidenceId,
      jobType,
      input.priority ?? 100,
      input.maxAttempts ?? input.max_attempts ?? 3,
      input.payload || {}
    ]
  );
  return rowToAnalysisJob(result.rows[0]);
}

export async function claimAnalysisJobs({ limit = 4, workerId = `worker-${process.pid}`, timeoutMs = 300000 } = {}) {
  const claimLimit = Math.max(1, Number(limit) || 1);
  return withTransaction(async client => {
    const result = await client.query(
      `WITH selected AS (
        SELECT id
        FROM evidence_analysis_jobs
        WHERE status = ANY($1::text[])
          AND next_attempt_at <= NOW()
        ORDER BY priority ASC, created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE evidence_analysis_jobs jobs
      SET status = 'processing',
          attempts = jobs.attempts + 1,
          locked_by = $3,
          locked_at = NOW(),
          started_at = COALESCE(jobs.started_at, NOW()),
          timeout_at = NOW() + ($4::text)::interval,
          updated_at = NOW()
      FROM selected
      WHERE jobs.id = selected.id
      RETURNING jobs.*`,
      [READY_JOB_STATUSES, claimLimit, workerId, `${Math.max(1000, timeoutMs)} milliseconds`]
    );

    const evidenceIds = result.rows.map(row => row.evidence_item_id);
    if (evidenceIds.length) {
      await client.query(
        `UPDATE evidence_items
         SET analysis_status = 'processing'
         WHERE id = ANY($1::uuid[])
           AND analysis_status NOT IN ('complete', 'unsupported')`,
        [evidenceIds]
      );
    }

    return result.rows.map(rowToAnalysisJob);
  });
}

export async function processEvidenceAnalysisJob(job) {
  const payload = stripAsyncFlags({
    ...(job.payload || {}),
    analysisMode: job.payload?.analysisMode || job.payload?.analysis_mode || job.jobType || DEFAULT_ANALYSIS_JOB_TYPE
  });
  return analyzeEvidence(job.tradeCaseId, job.evidenceItemId, {
    ...payload,
    processingMode: 'sync'
  });
}

export async function completeAnalysisJob(jobId, result = {}) {
  const update = await query(
    `UPDATE evidence_analysis_jobs
     SET status = 'succeeded',
         result_json = $2,
         error = NULL,
         locked_by = NULL,
         locked_at = NULL,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [jobId, result]
  );
  return update.rows[0] ? rowToAnalysisJob(update.rows[0]) : null;
}

export async function failAnalysisJob(job, error) {
  const message = error?.message || String(error);
  const terminal = Number(job.attempts || 0) >= Number(job.maxAttempts || 3);
  const backoffSeconds = Math.min(300, Math.pow(2, Math.max(0, Number(job.attempts || 1) - 1)) * 15);
  const update = await query(
    `UPDATE evidence_analysis_jobs
     SET status = $2,
         error = $3,
         locked_by = NULL,
         locked_at = NULL,
         completed_at = CASE WHEN $2 = 'failed_terminal' THEN NOW() ELSE completed_at END,
         next_attempt_at = CASE WHEN $2 = 'failed_retryable' THEN NOW() + ($4::text)::interval ELSE next_attempt_at END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      job.id,
      terminal ? 'failed_terminal' : 'failed_retryable',
      message,
      `${backoffSeconds} seconds`
    ]
  );

  await query(
    `UPDATE evidence_items
     SET analysis_status = $2,
         metadata_json = metadata_json || $3::jsonb
     WHERE trade_case_id = $1 AND id = $4`,
    [
      job.tradeCaseId,
      terminal ? 'failed' : 'queued',
      { analysisError: { message, terminal, jobId: job.id } },
      job.evidenceItemId
    ]
  );

  return update.rows[0] ? rowToAnalysisJob(update.rows[0]) : null;
}

export async function getProcessingStatus(id) {
  const tradeCase = await getTradeCase(id);
  if (!tradeCase) return null;
  const jobs = await listAnalysisJobs(id);
  const summary = buildProcessingSummary(tradeCase.evidenceItems || [], jobs);
  const latestGuidance = await generateGuidance(id);
  const jobsByEvidence = latestJobByEvidence(jobs);

  return {
    tradeCaseId: id,
    caseNumber: tradeCase.caseNumber,
    generatedAt: new Date().toISOString(),
    summary,
    evidence: (tradeCase.evidenceItems || []).map(evidence => ({
      ...evidence,
      job: jobsByEvidence.get(evidence.id) || null
    })),
    latestGuidance,
    message: buildProcessingStatusMessage({ caseNumber: tradeCase.caseNumber, summary, latestGuidance })
  };
}

export async function getProcessingSummary(id) {
  const tradeCase = await getTradeCase(id);
  if (!tradeCase) return emptyProcessingSummary();
  return buildProcessingSummary(tradeCase.evidenceItems || [], await listAnalysisJobs(id));
}

export function buildProcessingSummary(evidenceItems = [], jobs = []) {
  const jobsByEvidence = latestJobByEvidence(jobs);
  const summary = emptyProcessingSummary();
  summary.registered = evidenceItems.length;

  for (const evidence of evidenceItems) {
    const job = jobsByEvidence.get(evidence.id);
    const status = rollupEvidenceProcessingStatus(evidence, job);
    summary[status] += 1;
  }

  summary.incomplete = summary.pending + summary.queued + summary.processing;
  summary.done = summary.complete + summary.failed + summary.unsupported;
  return summary;
}

export async function getChecklistStatus(id) {
  const tradeCase = await getTradeCase(id);
  if (!tradeCase) return null;
  const checklist = computeChecklist(tradeCase.machine?.unitType || 'combine', tradeCase.evidenceItems.map(evidenceToDbShape));
  const findings = await listFindings(id);
  return {
    ...checklist,
    visibleConditionFindings: findings.filter(finding => finding.findingType === 'condition'),
    evidenceQualityFindings: findings.filter(finding => finding.findingType === 'evidence_quality'),
    uncertaintyFindings: findings.filter(finding => finding.findingType === 'uncertainty')
  };
}

export async function generateGuidance(id) {
  const tradeCase = await getTradeCase(id);
  if (!tradeCase) return null;
  const checklist = await getChecklistStatus(id);
  const routing = computeRoutingDecision({ tradeCase, checklist, findings: findingsFromChecklist(checklist) });
  await persistRoutingDecision(id, routing);
  const conditionFindings = checklist.visibleConditionFindings || [];
  const qualityFindings = checklist.evidenceQualityFindings || [];
  const unitType = checklist.unitType || tradeCase.machine?.unitType || 'combine';
  const accepted = checklist.acceptedSlots;
  const retake = checklist.retakeSlots.slice(0, 4);
  const missing = routing.nextEvidenceRequests.length
    ? routing.nextEvidenceRequests.map(request => request.slot)
    : checklist.nextRecommendedSlots.length
      ? checklist.nextRecommendedSlots
      : checklist.missingSlots.slice(0, 4);
  const missingWithoutRetake = missing.filter(slot => !retake.includes(slot));
  const visibleSummary = conditionFindings.slice(0, 3).map(finding => finding.finding);
  const limitationSummary = [
    ...qualityFindings.filter(finding => finding.needsFollowUp).slice(0, 2).map(finding => finding.recommendation || finding.finding),
    ...(checklist.uncertaintyFindings || []).slice(0, 2).map(finding => finding.finding)
  ].filter(Boolean);

  const caseNumber = formatCaseNumber(id);
  const suggestedNextMessage = buildGuidanceMessage({ caseNumber, accepted, retake, missing, visibleSummary, limitationSummary, checklist, routing });
  return {
    tradeCaseId: id,
    caseNumber,
    route: routing.route,
    routeCategory: routing.routeCategory,
    reviewStatus: routing.reviewStatus,
    confidence: routing.confidence,
    packetReady: routing.packetReady,
    routeReason: routing.routeReason,
    riskFlags: routing.riskFlags,
    acceptedEvidenceSlots: accepted,
    acceptedEvidenceSummary: describeChecklistSlots(unitType, accepted, checklist),
    visibleConditionSummary: visibleSummary,
    retakeRequestSlots: retake,
    retakeRequests: evidenceRequestsForSlots(unitType, retake, checklist),
    missingEvidenceRequestSlots: missingWithoutRetake,
    missingEvidenceRequests: evidenceRequestsForSlots(unitType, missingWithoutRetake, checklist),
    nextEvidenceRequests: routing.nextEvidenceRequests,
    targetedFollowUpQuestions: routing.targetedFollowUpQuestions,
    escalationReasons: routing.escalationReasons,
    uncertaintyAndLimitations: limitationSummary,
    suggestedNextMessage,
    checklist
  };
}

export async function getRoutingStatus(id) {
  const tradeCase = await getTradeCase(id);
  if (!tradeCase) return null;
  const checklist = await getChecklistStatus(id);
  const routing = computeRoutingDecision({ tradeCase, checklist, findings: findingsFromChecklist(checklist) });
  await persistRoutingDecision(id, routing);
  return {
    tradeCaseId: id,
    caseNumber: tradeCase.caseNumber,
    generatedAt: new Date().toISOString(),
    ...routing,
    checklist
  };
}

export async function generatePacket(id) {
  const tradeCase = await getTradeCase(id);
  if (!tradeCase) return null;

  const checklist = computeChecklist(
    tradeCase.machine?.unitType || 'combine',
    tradeCase.evidenceItems.map(evidenceToDbShape)
  );
  const findings = await listFindings(id);
  const conditionFindings = findings.filter(finding => finding.findingType === 'condition');
  const evidenceQualityFindings = findings.filter(finding => finding.findingType === 'evidence_quality');
  const uncertaintyFindings = findings.filter(finding => finding.findingType === 'uncertainty');
  const routing = computeRoutingDecision({ tradeCase, checklist, findings });
  await persistRoutingDecision(id, routing);
  const nextStep = routing.route === 'technician_inspection_required'
    ? 'Hold valuation approval and route to a licensed technician or equivalent mechanical reviewer before final trade approval.'
    : routing.packetReady
      ? 'Centralized used evaluation reviewer should review the draft packet.'
      : `Collect the next required evidence: ${routing.nextEvidenceRequests.map(request => request.description).join(', ') || checklist.missingSlots.join(', ')}.`;

  const packet = {
    tradeCaseId: tradeCase.id,
    caseNumber: tradeCase.caseNumber,
    generatedAt: new Date().toISOString(),
    route: routing.route,
    routeCategory: routing.routeCategory,
    routeReason: routing.routeReason,
    reviewStatus: routing.reviewStatus,
    confidence: routing.confidence,
    valuationReadiness: routing.packetReady && routing.route !== 'technician_inspection_required' ? 'ready_for_review' : 'hold_or_incomplete',
    machine: tradeCase.machine,
    evidenceCompleteness: checklist,
    evidenceCompletenessSummary: {
      accepted: describeChecklistSlots(checklist.unitType, checklist.acceptedSlots, checklist, { limit: 12 }),
      missing: describeChecklistSlots(checklist.unitType, checklist.missingSlots, checklist, { limit: 12 }),
      retake: describeChecklistSlots(checklist.unitType, checklist.retakeSlots, checklist, { limit: 12 }),
      weak: describeChecklistSlots(checklist.unitType, checklist.weakSlots, checklist, { limit: 12 })
    },
    visibleConditionFindings: conditionFindings,
    evidenceQualityFindings,
    uncertaintyFindings,
    riskFlags: routing.riskFlags,
    nextEvidenceRequests: routing.nextEvidenceRequests,
    targetedFollowUpQuestions: routing.targetedFollowUpQuestions,
    reconScenarios: [
      {
        scenarioType: 'light',
        assumptions: 'Use only when reviewer confirms no material visible or mechanical risk flags.',
        includedWork: [],
        excludedWork: ['Mechanical inspection', 'Detailed shop estimate'],
        riskNotes: routing.route === 'fast_path_candidate' ? 'Needs reviewer validation.' : 'Not the primary scenario for this route.'
      },
      {
        scenarioType: 'standard',
        assumptions: 'Use when average wear or incomplete confidence appears during reviewer analysis.',
        includedWork: [],
        excludedWork: ['Final approved work order'],
        riskNotes: routing.route === 'standard_review' ? routing.routeReason : 'Reviewer should validate against visible findings.'
      },
      {
        scenarioType: 'heavy',
        assumptions: 'Use when major wear, leaks, warning lights, structural damage, or weak evidence requires escalation.',
        includedWork: [],
        excludedWork: ['Licensed technician inspection details'],
        riskNotes: routing.escalationReasons.length ? routing.escalationReasons.join(' ') : 'May require full licensed-technician inspection.'
      }
    ],
    recommendation: {
      preliminaryTradeValue: null,
      reason: 'Numeric valuation is out of scope for Milestone Three; route, confidence, risk flags, and reviewer questions are now produced.',
      nextStep
    }
  };

  if (isDemoValuationEnabled()) {
    const demoValuation = await generateDemoValuation({ tradeCase, checklist, findings, routing });
    if (demoValuation) {
      packet.demoValuation = demoValuation;
      packet.recommendation = {
        ...packet.recommendation,
        preliminaryTradeValue: demoValuation.valuation?.estimatedTradeValueRange || null,
        demoReconBudget: demoValuation.reconBudget?.estimatedRange || null,
        reason: `${demoValuation.disclaimer} Reviewer should still validate against internal sales history, competitive listings, JDDO/Dynamics context, and approved recon pricing.`
      };
      await recordIntegrationJob(id, {
        jobType: 'demo_valuation_recon',
        targetSystem: 'trade_in_phase_five_demo',
        status: demoValuationSucceeded(demoValuation) ? 'completed' : 'failed',
        payload: {
          caseNumber: tradeCase.caseNumber,
          machine: tradeCase.machine,
          route: routing.route,
          confidence: routing.confidence,
          promptVersion: demoValuation.promptVersion
        },
        result: demoValuation,
        error: demoValuation.fallbackReason || demoValuation.error || null
      });
    }
  }
  packet.reviewerBrief = buildReviewerBrief(packet);

  const result = await query(
    `INSERT INTO packets (trade_case_id, packet_json, packet_markdown)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, packet, packetToMarkdown(packet)]
  );

  return {
    id: result.rows[0].id,
    tradeCaseId: id,
    caseNumber: tradeCase.caseNumber,
    packet,
    markdown: result.rows[0].packet_markdown,
    createdAt: result.rows[0].created_at
  };
}

async function buildReviewCase(row, { detail = false } = {}) {
  const machine = row.machine ? rowToMachine(row.machine) : null;
  const tradeCase = toTradeCase(row, machine, await listEvidence(row.id));
  const checklist = await getChecklistStatus(row.id);
  const findings = await listFindings(row.id);
  const processingSummary = await getProcessingSummary(row.id);
  const latestPacket = await getLatestPacket(row.id);
  const latestAction = detail ? null : await getLatestReviewAction(row.id);
  const source = inferReviewSource(tradeCase);
  const valuation = reviewValuation(latestPacket?.packet);
  const recon = reviewRecon(latestPacket?.packet);
  const risk = reviewRisk({ tradeCase, checklist, findings, processingSummary });
  const evidence = reviewEvidenceTiles({ tradeCase, checklist });
  const riskFactors = reviewRiskFactors({ tradeCase, checklist, findings, risk, valuation, recon });
  const reviewLines = reviewReadoutLines({ tradeCase, checklist, processingSummary, valuation, recon, latestPacket });

  return {
    id: tradeCase.id,
    caseNumber: tradeCase.caseNumber,
    createdAt: tradeCase.createdAt,
    updatedAt: tradeCase.updatedAt,
    unit: [machine?.make, machine?.model].filter(Boolean).join(' ') || 'Unknown combine',
    modelYear: machine?.modelYear || null,
    type: humanizeToken(machine?.unitType || 'combine'),
    serial: machine?.serialOrPin || 'Unconfirmed',
    hours: formatHours(machine),
    customer: source.dealer || source.label || tradeCase.createdBy,
    location: machine?.location || source.location || 'Location TBD',
    stage: reviewStatusLabel(tradeCase.reviewStatus || 'field_collection'),
    route: routeLabel(tradeCase.route || 'draft'),
    routeKey: tradeCase.route,
    age: ageLabel(tradeCase.createdAt),
    risk: risk.level,
    riskScore: risk.score,
    reviewStatus: tradeCase.reviewStatus,
    reviewStatusLabel: reviewStatusLabel(tradeCase.reviewStatus),
    confidence: confidenceLabel(tradeCase.confidence),
    proposedTrade: valuation.midpoint,
    lowValue: valuation.low,
    highValue: valuation.high,
    reconBudget: recon.midpoint,
    reconLow: recon.low,
    reconHigh: recon.high,
    specs: reviewSpecs(machine, latestPacket?.packet),
    riskFactors,
    evidence,
    reviewLines,
    summary: reviewSummary({ tradeCase, checklist, findings, latestPacket, valuation, recon }),
    source,
    sourceUrl: source.url,
    listingFacts: source.listingFacts || {},
    packet: latestPacket ? {
      id: latestPacket.id,
      createdAt: latestPacket.createdAt,
      preview: markdownPreview(latestPacket.markdown),
      markdown: detail ? latestPacket.markdown : undefined,
      recommendation: latestPacket.packet?.recommendation || null,
      demoValuation: latestPacket.packet?.demoValuation || null
    } : null,
    processingSummary,
    checklist,
    latestAction: latestAction ? rowToReviewAction(latestAction) : null,
    evidenceItems: detail ? tradeCase.evidenceItems : undefined,
    findings: detail ? findings : undefined,
    actions: detail ? await listReviewActions(row.id) : undefined
  };
}

async function getLatestPacket(tradeCaseId) {
  const result = await query(
    `SELECT *
     FROM packets
     WHERE trade_case_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [tradeCaseId]
  );
  return result.rows[0] ? rowToPacket(result.rows[0]) : null;
}

async function getLatestReviewAction(tradeCaseId) {
  const result = await query(
    `SELECT *
     FROM review_actions
     WHERE trade_case_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [tradeCaseId]
  );
  return result.rows[0] || null;
}

async function listReviewActions(tradeCaseId) {
  const result = await query(
    `SELECT *
     FROM review_actions
     WHERE trade_case_id = $1
     ORDER BY created_at DESC, id DESC`,
    [tradeCaseId]
  );
  return result.rows.map(rowToReviewAction);
}

function buildReviewQueueSummary(items = []) {
  const open = items.filter(item => !['approved', 'reviewed'].includes(item.reviewStatus)).length;
  const ready = items.filter(item => ['ready_for_fast_review', 'ready_for_standard_review'].includes(item.reviewStatus)).length;
  const collection = items.filter(item => item.reviewStatus === 'field_collection').length;
  const technician = items.filter(item => item.reviewStatus === 'technician_inspection_required').length;
  const avgRisk = items.length
    ? Math.round(items.reduce((sum, item) => sum + Number(item.riskScore || 0), 0) / items.length)
    : 0;
  const pipeline = items.reduce((sum, item) => sum + Number(item.proposedTrade || 0), 0);

  return {
    lastSync: new Date().toISOString(),
    locationsOnline: `${new Set(items.map(item => item.location).filter(Boolean)).size} sources`,
    slaBreaches: String(items.filter(item => ageInDays(item.createdAt) >= 5).length),
    kpis: [
      { label: 'Open Reviews', value: String(open), delta: `${ready} ready`, tone: ready ? 'good' : 'watch' },
      { label: 'Field Evidence', value: String(collection), delta: 'needs more', tone: collection ? 'watch' : 'good' },
      { label: 'Pipeline Value', value: formatCompactMoney(pipeline), delta: 'demo posture', tone: pipeline ? 'good' : 'watch' },
      { label: 'Avg Risk Score', value: String(avgRisk), suffix: '/100', delta: `${technician} tech holds`, tone: technician ? 'risk' : avgRisk >= 55 ? 'watch' : 'good' }
    ],
    openReviews: open,
    readyForReview: ready,
    fieldCollection: collection,
    technicianEscalations: technician,
    avgRiskScore: avgRisk,
    pipelineValue: pipeline
  };
}

function inferReviewSource(tradeCase) {
  const evidenceItems = tradeCase.evidenceItems || [];
  for (const evidence of evidenceItems) {
    const metadata = evidence.metadata || {};
    if (metadata.sourceUrl || metadata.listingUrl || metadata.dealer || metadata.sourceLabel) {
      return {
        url: metadata.sourceUrl || metadata.listingUrl || null,
        label: metadata.sourceLabel || metadata.sourceName || null,
        dealer: metadata.dealer || metadata.sourceDealer || null,
        location: metadata.sourceLocation || null,
        listingFacts: metadata.listingFacts || {}
      };
    }
  }
  return { url: null, label: null, dealer: null, location: null, listingFacts: {} };
}

function reviewValuation(packet = {}) {
  const range = packet?.demoValuation?.valuation?.estimatedTradeValueRange
    || packet?.recommendation?.preliminaryTradeValue
    || {};
  const low = numberOrNull(range.low);
  const high = numberOrNull(range.high);
  return {
    low,
    high,
    midpoint: midpoint(low, high)
  };
}

function reviewRecon(packet = {}) {
  const range = packet?.demoValuation?.reconBudget?.estimatedRange
    || packet?.recommendation?.demoReconBudget
    || {};
  const low = numberOrNull(range.low);
  const high = numberOrNull(range.high);
  return {
    low,
    high,
    midpoint: midpoint(low, high)
  };
}

function reviewRisk({ tradeCase, checklist = {}, findings = [], processingSummary = {} }) {
  const riskFlags = tradeCase.riskFlags || [];
  const severe = findings.filter(finding => finding.severity === 'severe').length + riskFlags.filter(flag => flag.severity === 'severe').length;
  const concern = findings.filter(finding => finding.severity === 'concern').length + riskFlags.filter(flag => flag.severity === 'concern').length;
  const missing = Number(checklist.missingCount || 0);
  const retake = Number(checklist.retakeCount || 0);
  const weak = Number(checklist.weakCount || 0);
  const incomplete = Number(processingSummary.incomplete || 0);
  const confidence = Number(tradeCase.confidence || 0);
  let score = 18 + missing * 5 + retake * 8 + weak * 5 + concern * 14 + severe * 28 + incomplete * 3;
  if (tradeCase.route === 'technician_inspection_required') score += 28;
  if (tradeCase.route === 'fast_path_candidate') score -= 12;
  if (confidence) score += Math.round((1 - confidence) * 18);
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    level: score >= 70 || severe || tradeCase.route === 'technician_inspection_required'
      ? 'high'
      : score >= 40 || concern || missing || retake || weak
        ? 'medium'
        : 'low'
  };
}

function reviewEvidenceTiles({ tradeCase, checklist = {} }) {
  const bySlot = new Map((tradeCase.evidenceItems || []).map(item => [item.checklistSlot, item]));
  const priority = [
    ...((checklist.items || []).filter(item => item.requiredForBaseline && item.status !== 'missing')),
    ...((checklist.items || []).filter(item => item.requiredForBaseline && item.status === 'missing'))
  ];

  return priority.slice(0, 8).map(item => {
    const evidence = bySlot.get(item.slot);
    return {
      label: describeReviewSlot(item.description || item.slot),
      status: normalizeReviewEvidenceStatus(item.status, evidence),
      meta: evidenceMetaLabel(item, evidence),
      checklistSlot: item.slot,
      evidenceItemId: evidence?.id || item.evidenceItemId || null
    };
  });
}

function reviewRiskFactors({ tradeCase, checklist = {}, findings = [], risk, valuation, recon }) {
  const acceptedRatio = Number(checklist.requiredCount || 0)
    ? Math.round((Number(checklist.acceptedCount || 0) / Number(checklist.requiredCount || 1)) * 100)
    : 0;
  const conditionScore = Math.min(100, findings.reduce((score, finding) => {
    if (finding.findingType !== 'condition') return score;
    if (finding.severity === 'severe') return score + 35;
    if (finding.severity === 'concern') return score + 22;
    if (finding.severity === 'watch') return score + 12;
    return score + 4;
  }, 0));
  const reconScore = recon.high ? Math.min(100, Math.round(Number(recon.high) / 1200)) : risk.score;
  const marketScore = valuation.low && valuation.high ? 35 : 68;

  return [
    ['Evidence gap', Math.max(0, 100 - acceptedRatio), toneForScore(100 - acceptedRatio)],
    ['Visible condition', conditionScore, toneForScore(conditionScore)],
    ['Recon uncertainty', reconScore, toneForScore(reconScore)],
    ['Market support', marketScore, toneForScore(marketScore)]
  ];
}

function reviewReadoutLines({ tradeCase, checklist = {}, processingSummary = {}, valuation, recon, latestPacket }) {
  return [
    {
      label: 'Field evidence',
      value: `${checklist.acceptedCount || 0} accepted / ${checklist.retakeCount || 0} retakes / ${checklist.missingCount || 0} missing`,
      tone: checklist.missingCount || checklist.retakeCount ? 'watch' : 'good'
    },
    {
      label: 'Async processing',
      value: `${processingSummary.done || 0} done / ${processingSummary.incomplete || 0} active`,
      tone: processingSummary.incomplete ? 'watch' : 'good'
    },
    {
      label: 'Recon posture',
      value: recon.low || recon.high ? `${formatMoneyRange(recon.low, recon.high)} demo` : 'No demo recon yet',
      tone: recon.high && recon.high >= 70000 ? 'risk' : recon.high ? 'watch' : 'info'
    },
    {
      label: 'Next decision',
      value: nextReviewDecision(tradeCase, latestPacket),
      tone: tradeCase.route === 'technician_inspection_required' ? 'risk' : tradeCase.route === 'needs_more_evidence' ? 'watch' : 'good'
    }
  ];
}

function reviewSpecs(machine = {}, packet = {}) {
  const specs = [
    ['Engine hours', machine?.engineHours == null ? 'Unconfirmed' : `${Number(machine.engineHours).toLocaleString()} hrs`],
    ['Separator hours', machine?.separatorHours == null ? 'Unconfirmed' : `${Number(machine.separatorHours).toLocaleString()} hrs`],
    ['Location', machine?.location || 'TBD'],
    ['Source', packet?.demoValuation?.researchMode || 'field evidence']
  ];
  if (machine?.attachmentsOrOptions) specs.push(['Options', machine.attachmentsOrOptions]);
  return specs.slice(0, 5);
}

function reviewSummary({ tradeCase, checklist = {}, findings = [], latestPacket, valuation, recon }) {
  const finding = findings.find(item => item.findingType === 'condition' && item.severity && item.severity !== 'info');
  const packetText = latestPacket?.packet?.reviewerBrief?.summary || latestPacket?.packet?.recommendation?.reason;
  const valueText = valuation.low || recon.low
    ? ` Demo posture: trade ${formatMoneyRange(valuation.low, valuation.high)}, recon ${formatMoneyRange(recon.low, recon.high)}.`
    : '';
  const evidenceText = checklist.complete
    ? 'Baseline evidence is complete for centralized review.'
    : `Baseline evidence still needs ${checklist.missingCount || 0} missing and ${checklist.retakeCount || 0} retake slot(s).`;
  const findingText = finding ? ` Highest visible concern: ${finding.finding}` : ' No major visible concern has been recorded by the current evidence analysis.';
  return `${packetText || evidenceText}${valueText}${findingText}`.trim();
}

function reviewStatusForAction(actionType) {
  const map = {
    approve_packet: 'approved',
    mark_reviewed: 'reviewed',
    request_more_evidence: 'field_collection',
    hold_for_technician: 'technician_inspection_required',
    assign_reviewer: null,
    note: null
  };
  return Object.prototype.hasOwnProperty.call(map, actionType) ? map[actionType] : null;
}

function routeForAction(actionType) {
  if (actionType === 'request_more_evidence') return 'needs_more_evidence';
  if (actionType === 'hold_for_technician') return 'technician_inspection_required';
  return null;
}

function formatHours(machine = {}) {
  const engine = numberOrNull(machine?.engineHours);
  const separator = numberOrNull(machine?.separatorHours);
  if (engine != null && separator != null) return `${Math.round(engine).toLocaleString()} eng / ${Math.round(separator).toLocaleString()} sep`;
  if (engine != null) return `${Math.round(engine).toLocaleString()} eng`;
  if (separator != null) return `${Math.round(separator).toLocaleString()} sep`;
  return 'Unconfirmed';
}

function ageLabel(dateLike) {
  const days = ageInDays(dateLike);
  if (days <= 0) return 'today';
  if (days === 1) return '1d';
  return `${days}d`;
}

function ageInDays(dateLike) {
  const timestamp = new Date(dateLike || Date.now()).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
}

function confidenceLabel(value) {
  const confidence = Number(value || 0);
  if (confidence >= 0.78) return 'High';
  if (confidence >= 0.55) return 'Medium';
  if (confidence > 0) return 'Low';
  return 'Pending';
}

function midpoint(low, high) {
  if (low == null && high == null) return null;
  if (low == null) return high;
  if (high == null) return low;
  return Math.round((Number(low) + Number(high)) / 2);
}

function describeReviewSlot(value) {
  return String(value || 'Evidence')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\bwith\b.*$/i, match => match.length > 24 ? '' : match)
    .trim()
    .slice(0, 36);
}

function normalizeReviewEvidenceStatus(status, evidence) {
  if (evidence?.qualityStatus === 'accepted' || evidence?.qualityStatus === 'usable') return 'accepted';
  if (evidence?.qualityStatus === 'needs_retake' || status === 'needs_retake') return 'retake';
  if (evidence?.qualityStatus === 'weak' || status === 'weak') return 'weak';
  if (evidence?.qualityStatus === 'rejected') return 'rejected';
  if (status === 'complete') return 'accepted';
  if (status === 'missing') return 'missing';
  return status || 'pending';
}

function evidenceMetaLabel(item = {}, evidence = null) {
  if (!evidence) return item.requiredForBaseline ? 'Needed' : 'Optional';
  if (evidence.analysisStatus === 'queued') return 'Queued';
  if (evidence.analysisStatus === 'processing') return 'Processing';
  if (evidence.qualityStatus === 'needs_retake') return 'Retake requested';
  if (evidence.qualityStatus === 'weak') return 'Weak evidence';
  if (evidence.qualityStatus === 'accepted' || evidence.qualityStatus === 'usable') return 'Accepted';
  return humanizeToken(evidence.qualityStatus || evidence.analysisStatus || item.status);
}

function toneForScore(score) {
  const number = Number(score || 0);
  if (number >= 70) return 'high';
  if (number >= 40) return 'medium';
  return 'low';
}

function formatMoneyRange(low, high) {
  if (low == null && high == null) return 'TBD';
  if (low != null && high != null && Number(low) !== Number(high)) return `${formatMoney(low)}-${formatMoney(high)}`;
  return formatMoney(low ?? high);
}

function formatMoney(value) {
  if (value == null) return 'TBD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(value));
}

function formatCompactMoney(value) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000000) return `$${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}M`;
  if (Math.abs(number) >= 1000) return `$${Math.round(number / 1000)}k`;
  return formatMoney(number);
}

function nextReviewDecision(tradeCase, latestPacket) {
  if (tradeCase.route === 'technician_inspection_required') return 'Escalate technician';
  if (tradeCase.route === 'needs_more_evidence') return 'Request field evidence';
  if (!latestPacket) return 'Generate packet';
  if (tradeCase.reviewStatus === 'approved') return 'Approved';
  return 'Reviewer approval';
}

function markdownPreview(markdown = '') {
  return String(markdown || '')
    .split('\n')
    .filter(line => line.trim())
    .slice(0, 10)
    .join('\n');
}

function humanizeToken(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function rowToMachine(row = {}) {
  if (!row) return null;
  return {
    unitType: row.unit_type,
    make: row.make,
    model: row.model,
    modelYear: row.model_year,
    serialOrPin: row.serial_or_pin,
    engineHours: numberOrNull(row.engine_hours),
    separatorHours: numberOrNull(row.separator_hours),
    location: row.location,
    attachmentsOrOptions: row.attachments_or_options
  };
}

function rowToPacket(row = {}) {
  return {
    id: row.id,
    tradeCaseId: row.trade_case_id,
    createdAt: row.created_at,
    packet: row.packet_json || {},
    markdown: row.packet_markdown || ''
  };
}

function rowToReviewAction(row = {}) {
  return {
    id: row.id,
    tradeCaseId: row.trade_case_id,
    createdAt: row.created_at,
    reviewer: row.reviewer,
    actionType: row.action_type,
    note: row.note,
    reviewStatus: row.review_status,
    route: row.route,
    packetId: row.packet_id,
    payload: row.payload_json || {}
  };
}

function rowToEvidence(row = {}) {
  return {
    id: row.id,
    tradeCaseId: row.trade_case_id,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    mediaType: row.media_type,
    storageUri: row.storage_uri,
    checklistSlot: row.checklist_slot,
    qualityStatus: row.quality_status,
    analysisStatus: row.analysis_status,
    originalFileName: row.original_file_name,
    contentType: row.content_type,
    sourceMessageId: row.source_message_id,
    sourceAttachmentId: row.source_attachment_id,
    metadata: row.metadata_json || {},
    checklistSlotConfidence: numberOrNull(row.checklist_slot_confidence),
    notes: row.notes
  };
}

function evidenceToDbShape(row = {}) {
  return {
    id: row.id,
    checklist_slot: row.checklistSlot,
    quality_status: row.qualityStatus,
    analysis_status: row.analysisStatus
  };
}

function rowToFinding(row = {}) {
  return {
    id: row.id,
    tradeCaseId: row.trade_case_id,
    evidenceItemId: row.evidence_item_id,
    createdAt: row.created_at,
    findingType: row.finding_type,
    section: row.section,
    finding: row.finding,
    severity: row.severity,
    confidence: numberOrNull(row.confidence),
    needsFollowUp: row.needs_follow_up,
    recommendation: row.recommendation
  };
}

function rowToAnalysisJob(row = {}) {
  return {
    id: row.id,
    tradeCaseId: row.trade_case_id,
    evidenceItemId: row.evidence_item_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobType: row.job_type,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    nextAttemptAt: row.next_attempt_at,
    timeoutAt: row.timeout_at,
    payload: row.payload_json || {},
    result: row.result_json || {},
    error: row.error
  };
}

function findingsFromChecklist(checklist = {}) {
  return [
    ...(checklist.visibleConditionFindings || []),
    ...(checklist.evidenceQualityFindings || []),
    ...(checklist.uncertaintyFindings || [])
  ];
}

function numberOrNull(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeProcessingMode(value) {
  return String(value || '').toLowerCase() === 'async' ? 'async' : 'sync';
}

function shouldAnalyzeAsync(input = {}, { defaultMode = 'sync' } = {}) {
  const explicitMode = input.processingMode || input.processing_mode;
  if (String(explicitMode || '').toLowerCase() === 'sync') return false;
  if (input.async === true || input.queue === true) return true;
  if (normalizeProcessingMode(explicitMode) === 'async') return true;
  return normalizeProcessingMode(defaultMode) === 'async';
}

function stripAsyncFlags(input = {}) {
  const {
    async: _async,
    queue: _queue,
    processingMode: _processingMode,
    processing_mode: _processing_mode,
    ...rest
  } = input;
  return rest;
}

function buildAnalysisJobPayload({ input = {}, item = {}, evidence = {} } = {}) {
  return stripAsyncFlags({
    analysisMode: item.analysisMode || item.analysis_mode || input.analysisMode || input.analysis_mode || DEFAULT_ANALYSIS_JOB_TYPE,
    checklistSlot: item.checklistSlot || item.checklist_slot || evidence.checklistSlot,
    sampledFrames: item.sampledFrames || item.sampled_frames || [],
    media: item.media || input.media || undefined,
    machineContext: item.machineContext || input.machineContext || undefined,
    sourceMessageId: evidence.sourceMessageId,
    sourceAttachmentId: evidence.sourceAttachmentId
  });
}

function filterRequestsForQueuedSlots(requests = [], queuedSlots = new Set()) {
  return requests.filter(request => !queuedSlots.has(request.slot));
}

function filterChecklistForQueuedSlots(checklist = {}, queuedSlots = new Set()) {
  return {
    ...checklist,
    nextRecommendedSlots: (checklist.nextRecommendedSlots || []).filter(slot => !queuedSlots.has(slot)),
    missingSlots: (checklist.missingSlots || []).filter(slot => !queuedSlots.has(slot))
  };
}

function defaultEvidencePriority(evidence = {}) {
  const slot = evidence.checklistSlot;
  if (['serial_plate', 'cab_display_hours', 'startup_video'].includes(slot)) return 10;
  if (['feeder_house', 'engine_compartment'].includes(slot)) return 25;
  if (String(evidence.notes || '').toLowerCase().includes('damage')) return 20;
  return 100;
}

async function listAnalysisJobs(tradeCaseId) {
  const result = await query(
    `SELECT * FROM evidence_analysis_jobs
     WHERE trade_case_id = $1
     ORDER BY created_at ASC, id ASC`,
    [tradeCaseId]
  );
  return result.rows.map(rowToAnalysisJob);
}

async function summarizeAnalysisQueue() {
  const result = await query(
    `SELECT status, COUNT(*)::int AS count
     FROM evidence_analysis_jobs
     GROUP BY status`
  );
  const summary = {};
  for (const row of result.rows) summary[row.status] = row.count;
  return {
    available: true,
    queued: summary.queued || 0,
    processing: summary.processing || 0,
    failedRetryable: summary.failed_retryable || 0,
    failedTerminal: summary.failed_terminal || 0,
    succeeded: summary.succeeded || 0,
    cancelled: summary.cancelled || 0
  };
}

function latestJobByEvidence(jobs = []) {
  const map = new Map();
  for (const job of jobs) {
    const current = map.get(job.evidenceItemId);
    if (!current || new Date(job.createdAt || 0) >= new Date(current.createdAt || 0)) {
      map.set(job.evidenceItemId, job);
    }
  }
  return map;
}

function emptyProcessingSummary() {
  return {
    registered: 0,
    pending: 0,
    queued: 0,
    processing: 0,
    complete: 0,
    failed: 0,
    unsupported: 0,
    incomplete: 0,
    done: 0
  };
}

function rollupEvidenceProcessingStatus(evidence = {}, job = null) {
  const evidenceStatus = evidence.analysisStatus || evidence.analysis_status || 'pending';
  if (evidenceStatus === 'complete') return 'complete';
  if (evidenceStatus === 'unsupported') return 'unsupported';
  if (evidenceStatus === 'failed') return 'failed';
  if (job?.status === 'succeeded') return 'complete';
  if (job?.status === 'processing') return 'processing';
  if (job?.status === 'failed_terminal') return 'failed';
  if (['queued', 'failed_retryable'].includes(job?.status)) return 'queued';
  if (evidenceStatus === 'processing') return 'processing';
  if (evidenceStatus === 'queued') return 'queued';
  return 'pending';
}

function buildProcessingStatusMessage({ caseNumber, summary, latestGuidance } = {}) {
  const lines = [];
  if (caseNumber) lines.push(`Trade case ${caseNumber} is processing.`);
  lines.push(`Complete: ${summary.complete}. Processing: ${summary.processing}. Queued: ${summary.queued}. Failed: ${summary.failed}.`);
  if (summary.incomplete > 0) {
    lines.push('You can keep sending photos or video while I work through the queue.');
  }
  const next = latestGuidance?.nextEvidenceRequests?.[0]?.description;
  if (next) lines.push(`Next: please send ${next}.`);
  return lines.join('\n');
}

async function insertFinding(client, tradeCaseId, evidenceId, finding) {
  await client.query(
    `INSERT INTO analysis_findings (
      trade_case_id, evidence_item_id, finding_type, section, finding,
      severity, confidence, needs_follow_up, recommendation
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      tradeCaseId,
      evidenceId,
      finding.findingType,
      finding.section || null,
      finding.finding,
      finding.severity || 'info',
      finding.confidence ?? null,
      Boolean(finding.needsFollowUp),
      finding.recommendation || null
    ]
  );
}

async function recordIntegrationJob(tradeCaseId, { jobType, targetSystem, status, payload, result, error }) {
  try {
    await query(
      `INSERT INTO integration_jobs (
        trade_case_id, job_type, target_system, status, payload_json, result_json, error
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        tradeCaseId,
        jobType,
        targetSystem,
        status || 'pending',
        payload || {},
        result || {},
        error || null
      ]
    );
  } catch (insertError) {
    console.warn(`Could not record integration job ${jobType}: ${insertError.message}`);
  }
}

export function demoValuationSucceeded(demoValuation = {}) {
  if (demoValuation.error) return false;
  if (demoValuation.fallbackReason && !demoValuation.valuation?.estimatedTradeValueRange) return false;
  return String(demoValuation.status || '').startsWith('generated') ||
    demoValuation.status === 'fallback_generated' ||
    Boolean(demoValuation.valuation?.estimatedTradeValueRange);
}
