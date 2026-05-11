import test from 'node:test';
import assert from 'node:assert/strict';
import { computeChecklist, getChecklist } from '../src/checklists.js';
import { buildLiveValuationRequest, generateDemoValuation } from '../src/demoValuation.js';
import { demoValuationSucceeded } from '../src/repository.js';
import { computeRoutingDecision } from '../src/routing.js';

test('demo valuation fixture creates a QA-only trade value and recon range', async t => {
  withDemoFixtureEnv(t);
  const checklist = computeChecklist('combine', completeEvidence('combine'));
  const tradeCase = combineCase();
  const routing = computeRoutingDecision({ tradeCase, checklist, findings: [] });

  const result = await generateDemoValuation({ tradeCase, checklist, findings: [], routing });

  assert.equal(result.demoOnly, true);
  assert.equal(result.provider, 'fixture');
  assert.equal(result.status, 'generated');
  assert.match(result.disclaimer, /controlled QA only/);
  assert.equal(result.valuation.currency, 'USD');
  assert.ok(result.valuation.comparableAskingRange.low > 0);
  assert.ok(result.valuation.estimatedTradeValueRange.low > 0);
  assert.ok(result.valuation.estimatedTradeValueRange.high >= result.valuation.estimatedTradeValueRange.low);
  assert.ok(result.reconBudget.estimatedRange.low > 0);
  assert.ok(result.comparableSales.length >= 3);
  assert.ok(result.comparableSales.every(comp => comp.currency === 'USD'));
});

test('demo valuation holds value posture when evidence is incomplete', async t => {
  withDemoFixtureEnv(t);
  const checklist = computeChecklist('combine', [
    evidence('front_45'),
    {
      ...evidence('startup_video'),
      quality_status: 'weak'
    }
  ]);
  const tradeCase = combineCase();
  const routing = computeRoutingDecision({
    tradeCase,
    checklist,
    findings: [
      {
        findingType: 'uncertainty',
        severity: 'info',
        finding: 'Startup video sampled frames do not verify audio or true cold-start behavior.'
      }
    ]
  });

  const result = await generateDemoValuation({ tradeCase, checklist, findings: [], routing });

  assert.equal(result.approvalStatus, 'hold_for_more_field_evidence');
  assert.equal(result.valuation.confidence, 'low');
  assert.ok(result.riskAdjustments.some(adjustment => adjustment.category === 'evidence_quality'));
  assert.ok(result.assumptions.some(assumption => assumption.includes('stay on hold')));
});

test('live demo valuation requires web search by default', () => {
  const context = {
    machine: combineCase().machine,
    checklist: computeChecklist('combine', completeEvidence('combine')),
    routing: { route: 'fast_path_candidate', packetReady: true },
    findings: [],
    fallbackComparableSales: []
  };
  const fallback = {
    valuation: {
      comparableAskingRange: { low: 250000, high: 400000 },
      estimatedTradeValueRange: { low: 190000, high: 330000 }
    },
    reconBudget: { estimatedRange: { low: 8000, high: 16000 }, lineItems: [] }
  };

  const request = buildLiveValuationRequest({ model: 'gpt-5.5', context, fallback });

  assert.equal(request.tools[0].type, 'web_search');
  assert.equal(request.tool_choice, 'required');
  assert.match(request.input[0].content[0].text, /Use web search before estimating value/);
  assert.match(request.input[0].content[0].text, /Do not limit yourself to the fallback examples/);
});

test('live demo valuation returns model comparables and web research metadata', async t => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  withDemoFixtureEnv(t);
  process.env.DEMO_VALUATION_MODE = 'live';
  process.env.OPENAI_API_KEY = 'test-key';
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        id: 'resp_test',
        output: [
          {
            type: 'web_search_call',
            id: 'ws_test',
            status: 'completed',
            action: { type: 'search', query: '2020 John Deere S770 combine for sale' }
          },
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify(liveValuationPayload()),
                annotations: [
                  {
                    type: 'url_citation',
                    url: 'https://example.com/s770',
                    title: 'Example S770 listing'
                  }
                ]
              }
            ]
          }
        ],
        usage: { input_tokens: 100, output_tokens: 200 }
      })
    };
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    restoreEnv('OPENAI_API_KEY', previousKey);
  });

  const checklist = computeChecklist('combine', completeEvidence('combine'));
  const tradeCase = {
    ...combineCase(),
    machine: {
      ...combineCase().machine,
      model: 'S770'
    }
  };
  const routing = computeRoutingDecision({ tradeCase, checklist, findings: [] });

  const result = await generateDemoValuation({ tradeCase, checklist, findings: [], routing });

  assert.equal(requestBody.tools[0].type, 'web_search');
  assert.equal(result.provider, 'openai');
  assert.equal(result.researchMode, 'web_search');
  assert.equal(result.comparableSales[0].model, 'S770');
  assert.equal(result.webResearch.usedWebSearch, true);
  assert.equal(result.webResearch.citedUrls[0].url, 'https://example.com/s770');
});

test('integration job status treats model-generated live demo status as success', () => {
  assert.equal(demoValuationSucceeded({
    status: 'generated_demo_research_completed',
    valuation: {
      estimatedTradeValueRange: { low: 200000, high: 300000 }
    }
  }), true);
  assert.equal(demoValuationSucceeded({
    status: 'failed',
    error: 'provider error'
  }), false);
});

function withDemoFixtureEnv(t) {
  const previousEnabled = process.env.DEMO_VALUATION_ENABLED;
  const previousMode = process.env.DEMO_VALUATION_MODE;
  process.env.DEMO_VALUATION_ENABLED = 'true';
  process.env.DEMO_VALUATION_MODE = 'fixture';
  t.after(() => {
    restoreEnv('DEMO_VALUATION_ENABLED', previousEnabled);
    restoreEnv('DEMO_VALUATION_MODE', previousMode);
  });
}

function restoreEnv(name, value) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

function combineCase() {
  return {
    id: 'case-id',
    caseNumber: 'TIA-DEMO0001',
    machine: {
      unitType: 'combine',
      make: 'John Deere',
      model: 'S780',
      modelYear: 2020,
      serialOrPin: 'COMBINE-PIN',
      engineHours: 1200,
      separatorHours: 850,
      location: 'Twin Falls, ID',
      attachmentsOrOptions: 'PRWD, duals, yield monitor.'
    }
  };
}

function completeEvidence(unitType) {
  return getChecklist(unitType)
    .filter(([, , required]) => required)
    .map(([slot]) => evidence(slot));
}

function evidence(slot) {
  return {
    id: `${slot}-evidence`,
    checklist_slot: slot,
    quality_status: 'accepted',
    analysis_status: 'complete'
  };
}

function liveValuationPayload() {
  return {
    enabled: true,
    demoOnly: true,
    status: 'generated',
    approvalStatus: 'demo_reviewable',
    valuation: {
      currency: 'USD',
      comparableAskingRange: { low: 285000, high: 390000 },
      estimatedTradeValueRange: { low: 220000, high: 330000 },
      approvalStatus: 'demo_reviewable',
      confidence: 'medium_low',
      methodology: 'Live web comparable asking prices minus demo trade spread, recon, and risk reserves.'
    },
    reconBudget: {
      currency: 'USD',
      estimatedRange: { low: 12000, high: 28000 },
      scenario: 'standard',
      lineItems: [
        {
          category: 'baseline_reconditioning_allowance',
          range: { low: 12000, high: 28000 },
          reason: 'Model-provided demo allowance.'
        }
      ]
    },
    comparableSales: [
      {
        source: 'Example Dealer',
        sourceUrl: 'https://example.com/s770',
        make: 'John Deere',
        model: 'S770',
        modelYear: 2020,
        unitType: 'combine',
        currency: 'USD',
        askingPrice: 320000,
        engineHours: 1300,
        separatorHours: 900,
        location: 'QA, US',
        capturedAt: '2026-05-08',
        summary: 'Mock live comparable.',
        similarityReason: 'Same model family and similar hours.'
      }
    ],
    assumptions: ['Demo-only live research estimate.'],
    riskAdjustments: [],
    reviewerQuestions: ['Validate live comps with internal used team judgment.'],
    sourceNotes: ['Used live public web research in test fixture.']
  };
}
