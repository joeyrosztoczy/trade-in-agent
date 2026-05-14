import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPT_VERSION = 'demo-valuation-recon-v1';
const DISCLAIMER = 'Demo estimate for controlled QA only. This is not an approved trade offer, sale price, or final reconditioning quote.';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoCompData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/demo-comps.json'), 'utf8'));
const SEARCH_DOMAINS_ENV = 'DEMO_VALUATION_SEARCH_DOMAINS';

export function isDemoValuationEnabled() {
  return ['true', '1', 'yes', 'on'].includes(String(process.env.DEMO_VALUATION_ENABLED || '').toLowerCase());
}

export async function generateDemoValuation({ tradeCase = {}, checklist = {}, findings = [], routing = {} } = {}) {
  if (!isDemoValuationEnabled()) return null;

  const context = buildValuationContext({ tradeCase, checklist, findings, routing });
  const fallback = buildFixtureValuation(context);
  const mode = String(process.env.DEMO_VALUATION_MODE || (process.env.OPENAI_API_KEY ? 'live' : 'fixture')).toLowerCase();
  if (mode === 'off') return null;
  if (mode === 'fixture') return fallback;

  try {
    return await generateLiveValuation(context, fallback);
  } catch (error) {
    return {
      ...fallback,
      status: 'fallback_generated',
      provider: 'fixture',
      mode: 'fixture',
      model: 'fixture-demo-valuation',
      fallbackReason: error.message || String(error)
    };
  }
}

function buildValuationContext({ tradeCase, checklist, findings, routing }) {
  const machine = tradeCase.machine || {};
  const comparableSales = mergeComparableSets([
    comparableFromEvidenceSource(tradeCase, machine),
    ...selectComparableSet(machine)
  ]);
  return {
    tradeCaseId: tradeCase.id || null,
    caseNumber: tradeCase.caseNumber || null,
    machine,
    checklist,
    findings: (findings || []).map(finding => ({
      findingType: finding.findingType,
      section: finding.section,
      finding: finding.finding,
      severity: finding.severity,
      recommendation: finding.recommendation
    })),
    routing,
    comparableSales,
    fallbackComparableSales: comparableSales,
    comparableBasis: demoCompData
  };
}

function comparableFromEvidenceSource(tradeCase = {}, machine = {}) {
  for (const evidence of tradeCase.evidenceItems || []) {
    const metadata = evidence.metadata || {};
    const facts = metadata.listingFacts || {};
    const sourceUrl = metadata.sourceUrl || metadata.listingUrl;
    const sourcePrice = numberOrNull(facts.askingPriceUsd ?? facts.askingPrice);
    if (!sourceUrl || sourcePrice == null) continue;
    return {
      id: metadata.exampleId || metadata.listingId || sourceUrl,
      source: metadata.sourceName || metadata.sourceLabel || 'Field source listing',
      sourceUrl,
      dealer: metadata.dealer || metadata.sourceDealer || null,
      location: machine.location || metadata.sourceLocation || null,
      make: machine.make,
      model: machine.model,
      modelYear: machine.modelYear,
      unitType: machine.unitType || 'combine',
      currency: facts.askingPriceUsd ? 'USD' : facts.currency || 'USD',
      askingPrice: sourcePrice,
      engineHours: machine.engineHours,
      separatorHours: machine.separatorHours,
      status: facts.status || null,
      capturedAt: metadata.capturedAt || null,
      summary: metadata.caption || metadata.notes || 'Comparable derived from the source listing used for this QA trade case.'
    };
  }
  return null;
}

function mergeComparableSets(items = []) {
  const seen = new Set();
  return items.filter(Boolean).filter(item => {
    const key = item.sourceUrl || item.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function selectComparableSet(machine = {}) {
  const make = normalize(machine.make || 'John Deere');
  const model = normalize(machine.model || '');
  const unitType = normalize(machine.unitType || 'combine');
  const modelYear = numberOrNull(machine.modelYear);
  const engineHours = numberOrNull(machine.engineHours);
  const all = demoCompData.comparables.filter(comp => {
    if (unitType && normalize(comp.unitType) !== unitType) return false;
    if (make && normalize(comp.make) !== make) return false;
    if (model && normalize(comp.model) !== model) return false;
    return true;
  });

  const exactYear = modelYear == null ? [] : all.filter(comp => comp.modelYear === modelYear);
  const source = exactYear.length >= 3 ? exactYear : all;
  return source
    .map(comp => ({
      ...comp,
      similarityScore: similarityScore(comp, { modelYear, engineHours })
    }))
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 5);
}

function similarityScore(comp, { modelYear, engineHours }) {
  let score = 1;
  if (modelYear != null && comp.modelYear != null) score -= Math.min(Math.abs(comp.modelYear - modelYear) * 0.12, 0.35);
  if (engineHours != null && comp.engineHours != null) score -= Math.min(Math.abs(comp.engineHours - engineHours) / 6000, 0.25);
  if (comp.currency !== 'USD') score -= 0.2;
  return Number(Math.max(0, score).toFixed(3));
}

function buildFixtureValuation(context) {
  const reconBudget = estimateReconBudget(context);
  const valuation = estimateTradeValue(context, reconBudget);
  const riskAdjustments = estimateRiskAdjustments(context);
  const approvalStatus = approvalStatusForRoute(context.routing?.route);

  return {
    enabled: true,
    demoOnly: true,
    status: 'generated',
    provider: 'fixture',
    mode: 'fixture',
    researchMode: 'fallback_fixture',
    model: 'fixture-demo-valuation',
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    approvalStatus,
    valuation,
    reconBudget,
    comparableSales: context.comparableSales,
    assumptions: buildAssumptions(context, valuation),
    riskAdjustments,
    reviewerQuestions: buildReviewerQuestions(context),
    sourceNotes: [
      'Fallback mode used the local demo comparable set, not live web research.',
      'Comparable values are asking prices, not confirmed sale prices.',
      'Internal sale history, trade history, JDDO/Dynamics, TractorHouse/dealer web data, and approved recon pricing are not integrated yet.'
    ]
  };
}

function estimateReconBudget(context) {
  const route = context.routing?.route;
  const checklist = context.checklist || {};
  const severityCounts = countSeverities(context.findings);
  const scenario = route === 'technician_inspection_required'
    ? 'heavy'
    : route === 'fast_path_candidate'
      ? 'light'
      : 'standard';

  const baseByScenario = {
    light: { low: 8000, high: 16000 },
    standard: { low: 18000, high: 35000 },
    heavy: { low: 45000, high: 90000 }
  };
  const lineItems = [
    {
      category: 'baseline_reconditioning_allowance',
      range: baseByScenario[scenario],
      reason: `${humanizeToken(scenario)} demo allowance based on route and evidence posture.`
    }
  ];

  const evidenceLow = Math.min((checklist.missingCount || 0) * 2000 + (checklist.weakCount || 0) * 2500 + (checklist.retakeCount || 0) * 3000, 20000);
  const evidenceHigh = Math.min((checklist.missingCount || 0) * 3500 + (checklist.weakCount || 0) * 4500 + (checklist.retakeCount || 0) * 6000, 35000);
  if (evidenceHigh > 0) {
    lineItems.push({
      category: 'evidence_uncertainty_reserve',
      range: { low: roundTo(evidenceLow, 500), high: roundTo(evidenceHigh, 500) },
      reason: 'Missing, weak, or retake evidence increases demo recon uncertainty.'
    });
  }

  const conditionLow = severityCounts.watch * 1500 + severityCounts.concern * 6000 + severityCounts.severe * 15000;
  const conditionHigh = severityCounts.watch * 3000 + severityCounts.concern * 12000 + severityCounts.severe * 30000;
  if (conditionHigh > 0) {
    lineItems.push({
      category: 'visible_condition_risk_reserve',
      range: { low: roundTo(conditionLow, 500), high: roundTo(conditionHigh, 500) },
      reason: 'Visible condition findings require recon reserve until the used team validates them.'
    });
  }

  if (route === 'technician_inspection_required') {
    lineItems.push({
      category: 'technician_inspection_hold',
      range: { low: 15000, high: 30000 },
      reason: 'Photo/video evidence should not clear visible mechanical or structural risk.'
    });
  }

  const estimatedRange = sumRanges(lineItems.map(item => item.range));
  return {
    currency: 'USD',
    estimatedRange,
    scenario,
    lineItems
  };
}

function estimateTradeValue(context, reconBudget) {
  const usdComps = context.comparableSales.filter(comp => comp.currency === 'USD' && Number.isFinite(Number(comp.askingPrice)));
  const prices = usdComps.map(comp => Number(comp.askingPrice)).sort((a, b) => a - b);
  const comparableRange = prices.length
    ? { low: roundTo(prices[0], 500), high: roundTo(prices[prices.length - 1], 500) }
    : { low: null, high: null };

  const machine = context.machine || {};
  const yearAdjustment = estimateYearAdjustment(machine, usdComps);
  const hourAdjustment = estimateHourAdjustment(machine, usdComps);
  const riskAdjustments = estimateRiskAdjustments(context);
  const riskRange = sumRanges(riskAdjustments.map(item => item.range));
  let tradeRange = { low: null, high: null };

  if (prices.length) {
    const adjustedLowRetail = comparableRange.low + Math.min(yearAdjustment, 0) + Math.min(hourAdjustment, 0);
    const adjustedHighRetail = comparableRange.high + Math.max(yearAdjustment, 0) + Math.max(hourAdjustment, 0);
    const low = adjustedLowRetail * 0.78 - reconBudget.estimatedRange.high - riskRange.high;
    const high = adjustedHighRetail * 0.88 - reconBudget.estimatedRange.low - riskRange.low;
    tradeRange = normalizedRange(roundTo(low, 5000), roundTo(high, 5000));
  }

  return {
    currency: 'USD',
    comparableAskingRange: comparableRange,
    estimatedTradeValueRange: tradeRange,
    approvalStatus: approvalStatusForRoute(context.routing?.route),
    confidence: valuationConfidence(context, prices.length),
    methodology: 'Comparable asking range minus retail-to-trade spread, demo recon allowance, hour/year adjustment, and evidence/risk buffer.'
  };
}

function estimateRiskAdjustments(context) {
  const route = context.routing?.route;
  const checklist = context.checklist || {};
  const severityCounts = countSeverities(context.findings);
  const adjustments = [];

  if ((checklist.missingCount || 0) + (checklist.weakCount || 0) + (checklist.retakeCount || 0) > 0) {
    adjustments.push({
      category: 'evidence_quality',
      range: {
        low: roundTo((checklist.weakCount || 0) * 1000 + (checklist.retakeCount || 0) * 1500, 500),
        high: roundTo((checklist.missingCount || 0) * 2500 + (checklist.weakCount || 0) * 3000 + (checklist.retakeCount || 0) * 4000, 500)
      },
      reason: 'The used team does not yet have complete, clean evidence for every required slot.'
    });
  }

  if (severityCounts.concern || severityCounts.severe) {
    adjustments.push({
      category: 'visible_condition',
      range: {
        low: roundTo(severityCounts.concern * 5000 + severityCounts.severe * 15000, 500),
        high: roundTo(severityCounts.concern * 12000 + severityCounts.severe * 35000, 500)
      },
      reason: 'Concern/severe visual findings can materially change both recon and resale confidence.'
    });
  }

  if (route === 'technician_inspection_required') {
    adjustments.push({
      category: 'mechanical_escalation',
      range: { low: 25000, high: 60000 },
      reason: 'Technician inspection required before valuation approval.'
    });
  }

  return adjustments;
}

function estimateYearAdjustment(machine, comps) {
  const modelYear = numberOrNull(machine.modelYear);
  const years = comps.map(comp => numberOrNull(comp.modelYear)).filter(value => value != null);
  if (modelYear == null || !years.length) return 0;
  const medianYear = median(years);
  return clamp((modelYear - medianYear) * 20000, -40000, 40000);
}

function estimateHourAdjustment(machine, comps) {
  const engineHours = numberOrNull(machine.engineHours);
  const hours = comps.map(comp => numberOrNull(comp.engineHours)).filter(value => value != null);
  if (engineHours == null || !hours.length) return 0;
  const medianHours = median(hours);
  return clamp((medianHours - engineHours) * 60, -35000, 35000);
}

function buildAssumptions(context, valuation) {
  const assumptions = [
    'Machine identity, year, model, and hours are assumed to be correct from the current trade case.',
    'Comparable basis uses asking prices only; final value should use actual sale history and current internal inventory context.',
    'Recon budget is a demo allowance derived from evidence completeness and visible risk flags, not a shop estimate.'
  ];
  if (valuation.approvalStatus !== 'demo_reviewable') {
    assumptions.push('The value range should stay on hold until missing evidence or technician escalation is resolved.');
  }
  return assumptions;
}

function buildReviewerQuestions(context) {
  const questions = [...(context.routing?.targetedFollowUpQuestions || [])].filter(Boolean);
  const machine = context.machine || {};
  if (!machine.serialOrPin) questions.push('Confirm serial/PIN before using any demo value range.');
  if (machine.unitType === 'combine' && (machine.separatorHours == null || machine.engineHours == null)) {
    questions.push('Confirm both engine and separator hours from the display.');
  } else if (machine.engineHours == null) {
    questions.push('Confirm engine hours from the display.');
  }
  if (!questions.length) questions.push('Validate options, tire/track condition, and any visible wear against the uploaded evidence.');
  return questions.slice(0, 6);
}

async function generateLiveValuation(context, fallback) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENAI_API_KEY is required for live demo valuation');
    error.statusCode = 503;
    throw error;
  }

  const model = process.env.DEMO_VALUATION_MODEL || 'gpt-5.5';
  const useWebSearch = envFlag('DEMO_VALUATION_WEB_SEARCH', true);
  const requestBody = buildLiveValuationRequest({ model, context, fallback, useWebSearch });
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(raw.error?.message || `OpenAI demo valuation failed with ${response.status}`);
    error.statusCode = 502;
    throw error;
  }

  const parsed = normalizeLiveOutput(extractOutputText(raw), fallback);
  const webResearch = extractWebResearch(raw);
  return {
    ...parsed,
    provider: 'openai',
    mode: 'live',
    researchMode: useWebSearch ? 'web_search' : 'model_only',
    model,
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    webResearch,
    openaiResponseId: raw.id || null,
    usage: raw.usage || null
  };
}

export function buildLiveValuationRequest({ model, context, fallback, useWebSearch = true } = {}) {
  const request = {
    model,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildLivePrompt(context, fallback, { useWebSearch })
          }
        ]
      }
    ]
  };

  if (useWebSearch) {
    request.tools = [buildWebSearchTool()];
    request.tool_choice = envFlag('DEMO_VALUATION_WEB_SEARCH_REQUIRED', true) ? 'required' : 'auto';
  }

  return request;
}

function buildWebSearchTool() {
  const tool = {
    type: 'web_search',
    search_context_size: normalizedSearchContextSize(process.env.DEMO_VALUATION_SEARCH_CONTEXT_SIZE || 'medium'),
    external_web_access: envFlag('DEMO_VALUATION_EXTERNAL_WEB_ACCESS', true)
  };
  const allowedDomains = parseCsv(process.env[SEARCH_DOMAINS_ENV]).map(domain => domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''));
  if (allowedDomains.length) {
    tool.filters = { allowed_domains: allowedDomains.slice(0, 100) };
  }
  return tool;
}

function buildLivePrompt(context, fallback, { useWebSearch = true } = {}) {
  const machine = context.machine || {};
  const identity = [
    machine.modelYear,
    machine.make,
    machine.model,
    machine.unitType
  ].filter(Boolean).join(' ');

  return `You are creating a demo trade-in valuation and reconditioning estimate for a John Deere dealership user QA test.

Return only valid JSON. Do not include markdown.
Do not claim this is an approved offer, a confirmed sale price, or a final technician/shop estimate.
${useWebSearch ? `Use web search before estimating value. Search for current comparable asking prices and recent public market signals for this exact machine or close substitutes: ${identity || 'the machine in the trade case'}.
Favor public equipment listing and auction/dealer sources such as MachineFinder, TractorHouse, dealer used-equipment pages, AuctionTime, EquipmentFacts, BigIron, Purple Wave, and TractorZoom when relevant. Do not limit yourself to the fallback examples.
Prefer same make/model/year and similar hours. If exact comps are sparse, use nearby model years or adjacent trim/model variants and explain the adjustment.
Only include a comparable in comparableSales when you found a source URL and a price or price-like public value. Do not invent prices.
For each comparableSales item include: source, sourceUrl, make, model, modelYear, unitType, currency, askingPrice, engineHours, separatorHours, location, capturedAt, summary, similarityReason.
Use the local fallback estimate only as a sanity check or fallback if live search is thin.` : 'Use the local fallback estimate as a guardrail because web search is disabled for this run.'}
Keep numeric ranges conservative and broad.

Required JSON keys:
enabled, demoOnly, status, approvalStatus, valuation, reconBudget, comparableSales, assumptions, riskAdjustments, reviewerQuestions, sourceNotes.

valuation keys:
currency, comparableAskingRange, estimatedTradeValueRange, approvalStatus, confidence, methodology.

reconBudget keys:
currency, estimatedRange, scenario, lineItems.

Use range objects shaped as {"low": number|null, "high": number|null}.
Use confidence enum: low, medium_low, medium.

Trade case context:
${JSON.stringify({
    tradeCaseId: context.tradeCaseId,
    caseNumber: context.caseNumber,
    machine: context.machine,
    checklist: context.checklist,
    routing: context.routing,
    findings: context.findings,
    fallbackComparableSales: context.fallbackComparableSales,
    fallbackEstimate: fallback
  })}`;
}

function normalizeLiveOutput(text, fallback) {
  let parsed = {};
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    return {
      ...fallback,
      status: 'fallback_generated',
      fallbackReason: 'OpenAI response did not contain parseable JSON.'
    };
  }

  const valuation = parsed.valuation || fallback.valuation;
  const reconBudget = parsed.reconBudget || fallback.reconBudget;
  return {
    enabled: true,
    demoOnly: true,
    status: parsed.status || 'generated',
    approvalStatus: parsed.approvalStatus || valuation.approvalStatus || fallback.approvalStatus,
    valuation: {
      ...fallback.valuation,
      ...valuation,
      comparableAskingRange: coerceRange(valuation.comparableAskingRange, fallback.valuation.comparableAskingRange),
      estimatedTradeValueRange: coerceRange(valuation.estimatedTradeValueRange, fallback.valuation.estimatedTradeValueRange),
      confidence: normalizeConfidence(valuation.confidence || fallback.valuation.confidence)
    },
    reconBudget: {
      ...fallback.reconBudget,
      ...reconBudget,
      estimatedRange: coerceRange(reconBudget.estimatedRange, fallback.reconBudget.estimatedRange),
      lineItems: Array.isArray(reconBudget.lineItems) ? reconBudget.lineItems : fallback.reconBudget.lineItems
    },
    comparableSales: normalizeComparables(parsed.comparableSales, fallback.comparableSales),
    assumptions: arrayOfText(parsed.assumptions, fallback.assumptions),
    riskAdjustments: Array.isArray(parsed.riskAdjustments) ? parsed.riskAdjustments : fallback.riskAdjustments,
    reviewerQuestions: arrayOfText(parsed.reviewerQuestions, fallback.reviewerQuestions),
    sourceNotes: arrayOfText(parsed.sourceNotes, fallback.sourceNotes)
  };
}

function normalizeComparables(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const clean = value
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      ...item,
      askingPrice: item.askingPrice == null ? item.askingPrice : numberOrNull(item.askingPrice),
      engineHours: item.engineHours == null ? item.engineHours : numberOrNull(item.engineHours),
      separatorHours: item.separatorHours == null ? item.separatorHours : numberOrNull(item.separatorHours)
    }))
    .filter(item => item.sourceUrl || item.source);
  return clean.length ? clean : fallback;
}

function approvalStatusForRoute(route) {
  if (route === 'technician_inspection_required') return 'hold_for_technician_inspection';
  if (route === 'needs_more_evidence') return 'hold_for_more_field_evidence';
  if (route === 'escalation_required') return 'hold_for_central_review';
  return 'demo_reviewable';
}

function valuationConfidence(context, compCount) {
  if (context.routing?.route === 'technician_inspection_required') return 'low';
  if (!context.routing?.packetReady) return 'low';
  if (compCount < 3) return 'low';
  if ((context.routing?.confidence || 0) >= 0.75 && context.routing?.route === 'fast_path_candidate') return 'medium';
  return 'medium_low';
}

function countSeverities(findings = []) {
  const counts = { info: 0, watch: 0, concern: 0, severe: 0 };
  for (const finding of findings || []) {
    if (finding.findingType && finding.findingType !== 'condition') continue;
    const severity = ['info', 'watch', 'concern', 'severe'].includes(finding.severity) ? finding.severity : 'info';
    counts[severity] += 1;
  }
  return counts;
}

function sumRanges(ranges) {
  return ranges.reduce((sum, range) => ({
    low: sum.low + Number(range?.low || 0),
    high: sum.high + Number(range?.high || 0)
  }), { low: 0, high: 0 });
}

function normalizedRange(low, high) {
  if (low == null || high == null) return { low: null, high: null };
  const floor = Math.max(0, low);
  const ceiling = Math.max(floor, high);
  return { low: floor, high: ceiling };
}

function coerceRange(value, fallback) {
  if (!value || typeof value !== 'object') return fallback;
  const low = value.low == null ? fallback.low : Number(value.low);
  const high = value.high == null ? fallback.high : Number(value.high);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return fallback;
  return normalizedRange(roundTo(low, 500), roundTo(high, 500));
}

function normalizeConfidence(value) {
  return ['low', 'medium_low', 'medium'].includes(value) ? value : 'low';
}

function arrayOfText(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const clean = value.map(item => String(item || '').trim()).filter(Boolean);
  return clean.length ? clean : fallback;
}

function extractWebResearch(raw = {}) {
  const calls = [];
  const citedUrls = [];
  for (const item of raw.output || []) {
    if (item.type === 'web_search_call') {
      calls.push({
        id: item.id || null,
        status: item.status || null,
        action: item.action || null
      });
    }
    if (item.type === 'message') {
      for (const content of item.content || []) {
        for (const annotation of content.annotations || []) {
          if (annotation.type === 'url_citation') {
            citedUrls.push({
              url: annotation.url,
              title: annotation.title || null
            });
          }
        }
      }
    }
  }
  return {
    usedWebSearch: calls.length > 0,
    calls,
    citedUrls: uniqueObjects(citedUrls, item => item.url)
  };
}

function extractOutputText(raw) {
  if (typeof raw.output_text === 'string') return raw.output_text;
  const chunks = [];
  for (const item of raw.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function roundTo(value, increment = 1) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) / increment) * increment;
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function envFlag(name, defaultValue = false) {
  const value = process.env[name];
  if (value == null || value === '') return defaultValue;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function normalizedSearchContextSize(value) {
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium';
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function uniqueObjects(items, keyFn) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function humanizeToken(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}
