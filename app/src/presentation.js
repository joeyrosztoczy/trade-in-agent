import { getChecklist, normalizeUnitType } from './checklists.js';

const ROUTE_LABELS = {
  draft: 'Draft',
  needs_more_evidence: 'Field collection',
  fast_path_candidate: 'Ready for fast review',
  standard_review: 'Ready for standard review',
  escalation_required: 'Reviewer hold',
  technician_inspection_required: 'Technician inspection needed'
};

const REVIEW_STATUS_LABELS = {
  field_collection: 'Field collection',
  ready_for_fast_review: 'Ready for fast review',
  ready_for_standard_review: 'Ready for standard review',
  central_review_hold: 'Reviewer hold',
  technician_inspection_required: 'Technician inspection needed'
};

export function routeLabel(route) {
  return ROUTE_LABELS[route] || humanizeToken(route || 'unknown');
}

export function reviewStatusLabel(status) {
  return REVIEW_STATUS_LABELS[status] || humanizeToken(status || 'unknown');
}

export function describeChecklistSlot(unitType, slot, checklist = {}) {
  const normalizedUnitType = normalizeUnitType(unitType || checklist.unitType || 'combine');
  const fromChecklist = (checklist.items || []).find(item => item.slot === slot)?.description;
  if (fromChecklist) return fromChecklist;

  const fromDefinition = getChecklist(normalizedUnitType).find(([definitionSlot]) => definitionSlot === slot)?.[1];
  return fromDefinition || humanizeToken(slot);
}

export function describeChecklistSlots(unitType, slots = [], checklist = {}, options = {}) {
  const labels = slots
    .filter(Boolean)
    .map(slot => describeChecklistSlot(unitType, slot, checklist));
  return compactList(labels, options);
}

export function evidenceRequestsForSlots(unitType, slots = [], checklist = {}) {
  return slots.filter(Boolean).map(slot => ({
    slot,
    description: describeChecklistSlot(unitType, slot, checklist)
  }));
}

export function buildGuidanceMessage({
  caseNumber,
  accepted = [],
  retake = [],
  missing = [],
  visibleSummary = [],
  limitationSummary = [],
  checklist = {},
  routing = {}
}) {
  const unitType = checklist.unitType || 'combine';
  const missingWithoutRetake = missing.filter(slot => !retake.includes(slot));
  const missingSlotSet = new Set(checklist.missingSlots || []);
  const weakSlotSet = new Set(checklist.weakSlots || []);
  const missingOnly = missingWithoutRetake.filter(slot => missingSlotSet.has(slot));
  const weakOnly = missingWithoutRetake.filter(slot => weakSlotSet.has(slot));
  const otherNeeded = missingWithoutRetake.filter(slot => !missingSlotSet.has(slot) && !weakSlotSet.has(slot));
  const nextRequest = routing.nextEvidenceRequests?.[0];
  const route = routeLabel(routing.route);
  const confidence = Math.round((routing.confidence || 0) * 100);
  const lines = [];

  if (caseNumber) lines.push(`Trade case ${caseNumber}.`);
  if (routing.route) lines.push(`Status: ${route} (${confidence}% confidence).`);
  if (accepted.length) {
    lines.push(`Got: ${describeChecklistSlots(unitType, accepted, checklist, { limit: 5 }).join('; ')}.`);
  }
  if (retake.length) {
    lines.push(`Please retake: ${describeChecklistSlots(unitType, retake, checklist, { limit: 3 }).join('; ')}.`);
  }
  if (missingOnly.length && !routing.packetReady) {
    lines.push(`Still need: ${describeChecklistSlots(unitType, missingOnly, checklist, { limit: 4 }).join('; ')}.`);
  }
  if (weakOnly.length && !routing.packetReady) {
    lines.push(`Need better evidence: ${describeChecklistSlots(unitType, weakOnly, checklist, { limit: 4 }).join('; ')}.`);
  }
  if (otherNeeded.length && !routing.packetReady) {
    lines.push(`Need attention: ${describeChecklistSlots(unitType, otherNeeded, checklist, { limit: 4 }).join('; ')}.`);
  }
  if (visibleSummary.length) lines.push(`Visible notes: ${visibleSummary.slice(0, 2).join(' ')}`);
  if (limitationSummary.length) lines.push(`Limitations: ${limitationSummary.slice(0, 2).join(' ')}`);
  if (routing.routeReason && routing.route !== 'needs_more_evidence') lines.push(`Why: ${routing.routeReason}`);

  if (routing.route === 'technician_inspection_required') {
    lines.push('Next: pause valuation approval and send this case to a licensed technician or equivalent mechanical reviewer.');
  } else if (routing.packetReady || checklist.complete) {
    lines.push('Next: this evidence package is ready for the centralized used evaluation team.');
  } else if (nextRequest?.description) {
    const action = nextRequest.reason?.startsWith('retake') ? 'retake' : 'send';
    lines.push(`Next: please ${action} ${nextRequest.description}.`);
  } else {
    const nextSlot = checklist.nextRecommendedSlots?.[0] || checklist.missingSlots?.[0];
    const nextLabel = nextSlot ? describeChecklistSlot(unitType, nextSlot, checklist) : null;
    lines.push(nextLabel ? `Next: please send ${nextLabel}.` : 'Next: continue collecting baseline evidence.');
  }

  return lines.join('\n');
}

export function buildProcessingAcknowledgementMessage({
  caseNumber,
  registeredCount = 0,
  queuedCount = 0,
  nextEvidenceRequests = [],
  checklist = {},
  unitType = checklist.unitType || 'combine'
} = {}) {
  const mediaLabel = pluralize(registeredCount, 'item', 'items');
  const lines = [];

  if (caseNumber) lines.push(`Trade case ${caseNumber} is open.`);
  lines.push(`I added ${registeredCount} new ${mediaLabel} and started processing ${queuedCount || registeredCount} in the background.`);
  lines.push('You can keep sending photos or video while that finishes.');

  const nextSlots = nextEvidenceRequests
    .map(request => request.slot)
    .filter(Boolean)
    .slice(0, 3);
  if (nextSlots.length) {
    lines.push(`Next best shots: ${describeChecklistSlots(unitType, nextSlots, checklist, { limit: 3 }).join('; ')}.`);
  } else {
    const fallback = (checklist.nextRecommendedSlots || checklist.missingSlots || []).slice(0, 3);
    if (fallback.length) {
      lines.push(`Next best shots: ${describeChecklistSlots(unitType, fallback, checklist, { limit: 3 }).join('; ')}.`);
    }
  }

  return lines.join('\n');
}

export function buildReviewerBrief(packet) {
  const conditionFindings = packet.visibleConditionFindings || [];
  const qualityFindings = packet.evidenceQualityFindings || [];
  const uncertaintyFindings = packet.uncertaintyFindings || [];
  const riskFlags = packet.riskFlags || [];
  const positives = conditionFindings
    .filter(finding => ['info'].includes(finding.severity))
    .map(finding => finding.finding)
    .filter(Boolean)
    .slice(0, 5);
  const concerns = [
    ...conditionFindings.filter(finding => ['watch', 'concern', 'severe'].includes(finding.severity)).map(finding => finding.finding),
    ...riskFlags.filter(flag => ['watch', 'concern', 'severe'].includes(flag.severity)).map(flag => flag.message)
  ].filter(Boolean).slice(0, 6);
  const limitations = [
    ...qualityFindings.map(finding => finding.recommendation || finding.finding),
    ...uncertaintyFindings.map(finding => finding.finding)
  ].filter(Boolean).slice(0, 6);

  return {
    status: routeLabel(packet.route),
    reviewStatus: reviewStatusLabel(packet.reviewStatus),
    confidencePercent: Math.round((packet.confidence || 0) * 100),
    valuationReadiness: packet.valuationReadiness,
    oneLine: `${routeLabel(packet.route)} at ${Math.round((packet.confidence || 0) * 100)}% confidence.`,
    positives,
    concerns,
    limitations,
    fieldFollowUps: (packet.targetedFollowUpQuestions || []).slice(0, 5),
    nextStep: packet.recommendation?.nextStep || null
  };
}

export function packetToMarkdown(packet) {
  const checklist = packet.evidenceCompleteness || {};
  const unitType = checklist.unitType || packet.machine?.unitType || 'combine';
  const accepted = describeChecklistSlots(unitType, checklist.acceptedSlots || [], checklist, { limit: 12 });
  const missing = describeChecklistSlots(unitType, checklist.missingSlots || [], checklist, { limit: 12 });
  const weak = describeChecklistSlots(unitType, checklist.weakSlots || [], checklist, { limit: 12 });
  const retake = describeChecklistSlots(unitType, checklist.retakeSlots || [], checklist, { limit: 12 });
  const brief = packet.reviewerBrief || buildReviewerBrief(packet);
  const demoValuationMarkdown = renderDemoValuation(packet.demoValuation);

  return `# Trade Evaluation Draft Packet

Case: ${packet.caseNumber || packet.tradeCaseId}

Generated: ${packet.generatedAt}

## Reviewer Snapshot

- Status: ${brief.status}
- Review queue: ${brief.reviewStatus}
- Confidence: ${brief.confidencePercent}%
- Next step: ${brief.nextStep || 'Reviewer should inspect the packet.'}

## Machine Identity

- Unit type: ${humanizeToken(packet.machine?.unitType || 'unknown')}
- Make: ${packet.machine?.make || 'unknown'}
- Model: ${packet.machine?.model || 'unknown'}
- Model year: ${packet.machine?.modelYear || 'unknown'}
- Serial/PIN: ${packet.machine?.serialOrPin || 'unknown'}
- Engine hours: ${packet.machine?.engineHours ?? 'unknown'}
- Separator hours: ${packet.machine?.separatorHours ?? 'n/a'}
- Location: ${packet.machine?.location || 'unknown'}
- Options/context: ${packet.machine?.attachmentsOrOptions || 'unknown'}

## Evidence Status

- Required baseline slots: ${checklist.requiredCount ?? 0}
- Complete baseline slots: ${checklist.completeCount ?? 0}
- Accepted: ${accepted.length ? accepted.join('; ') : 'None yet'}
- Missing: ${missing.length ? missing.join('; ') : 'None'}
- Retake needed: ${retake.length ? retake.join('; ') : 'None'}
- Weak evidence: ${weak.length ? weak.join('; ') : 'None'}

## Used-Team Review Signals

Visible positives:
${bulletList(brief.positives, '- None recorded yet')}

Visible concerns and risks:
${bulletList(brief.concerns, '- None recorded')}

Evidence limitations:
${bulletList(brief.limitations, '- None recorded')}

## Field Follow-Up

${bulletList(brief.fieldFollowUps, '- None')}

${demoValuationMarkdown}
## Recon And Valuation Notes

- Preliminary trade value: ${packet.demoValuation ? moneyRange(packet.demoValuation.valuation?.estimatedTradeValueRange, packet.demoValuation.valuation?.currency) : 'not set in this milestone.'}
- Demo recon budget: ${packet.demoValuation ? moneyRange(packet.demoValuation.reconBudget?.estimatedRange, packet.demoValuation.reconBudget?.currency) : 'not set in this milestone.'}
- Pricing note: ${packet.recommendation?.reason || 'Reviewer should combine this packet with sales history, competitive listings, and business-system data.'}
- Reconditioning stance: ${packet.demoValuation ? 'use the demo recon range as a QA-only starting point, then validate with approved recon pricing inputs.' : 'use the light, standard, and heavy scenarios below as placeholders until approved recon pricing inputs are integrated.'}

${(packet.reconScenarios || []).map(scenario => `### ${humanizeToken(scenario.scenarioType)} Recon Scenario

- Assumptions: ${scenario.assumptions}
- Excluded work: ${(scenario.excludedWork || []).join(', ') || 'None listed'}
- Risk notes: ${scenario.riskNotes}`).join('\n\n')}
`;
}

function compactList(items, { limit } = {}) {
  const clean = [...new Set(items.filter(Boolean))];
  if (!limit || clean.length <= limit) return clean;
  return [...clean.slice(0, limit), `plus ${clean.length - limit} more`];
}

function pluralize(count, singular, plural) {
  return Number(count) === 1 ? singular : plural;
}

function bulletList(items = [], fallback) {
  const clean = items.filter(Boolean);
  return clean.length ? clean.map(item => `- ${item}`).join('\n') : fallback;
}

function renderDemoValuation(demoValuation) {
  if (!demoValuation) return '';
  const valuation = demoValuation.valuation || {};
  const recon = demoValuation.reconBudget || {};
  const comparableLines = (demoValuation.comparableSales || []).slice(0, 5).map(comp => {
    const hours = comp.engineHours == null ? 'unknown hours' : `${comp.engineHours} engine hours`;
    const source = comp.sourceUrl ? `[${comp.source || 'source'}](${comp.sourceUrl})` : comp.source || 'source';
    return `- ${comp.modelYear || 'unknown'} ${comp.make || ''} ${comp.model || ''}: ${money(comp.askingPrice, comp.currency)} asking, ${hours}, ${comp.location || 'unknown location'} (${source})`;
  });
  const reconLines = (recon.lineItems || []).map(item => (
    `- ${humanizeToken(item.category)}: ${moneyRange(item.range, recon.currency)} - ${item.reason || 'No reason recorded.'}`
  ));
  const adjustmentLines = (demoValuation.riskAdjustments || []).map(item => (
    `- ${humanizeToken(item.category)}: ${moneyRange(item.range, valuation.currency)} - ${item.reason || 'No reason recorded.'}`
  ));
  const sourceNoteLines = [
    ...(demoValuation.sourceNotes || []),
    ...((demoValuation.webResearch?.citedUrls || []).slice(0, 5).map(source => (
      source.url ? `[${source.title || source.url}](${source.url})` : source.title
    )))
  ].filter(Boolean);

  return `## Demo Valuation And Recon Estimate

- Status: ${humanizeToken(demoValuation.status || 'generated')}
- Research mode: ${humanizeToken(demoValuation.researchMode || demoValuation.mode || 'unknown')}
- Approval posture: ${humanizeToken(demoValuation.approvalStatus || valuation.approvalStatus || 'demo_reviewable')}
- Demo trade value range: ${moneyRange(valuation.estimatedTradeValueRange, valuation.currency)}
- Comparable asking range: ${moneyRange(valuation.comparableAskingRange, valuation.currency)}
- Demo recon budget: ${moneyRange(recon.estimatedRange, recon.currency)}
- Confidence: ${humanizeToken(valuation.confidence || 'low')}
- Methodology: ${valuation.methodology || 'Comparable asking range minus demo risk and recon allowances.'}
- Guardrail: ${demoValuation.disclaimer || 'Demo estimate for controlled QA only.'}

Comparable basis:
${comparableLines.length ? comparableLines.join('\n') : '- None available'}

Recon line items:
${reconLines.length ? reconLines.join('\n') : '- None recorded'}

Risk/value adjustments:
${adjustmentLines.length ? adjustmentLines.join('\n') : '- None recorded'}

Source notes:
${bulletList(sourceNoteLines, '- None recorded')}

Reviewer questions:
${bulletList(demoValuation.reviewerQuestions || [], '- None')}

`;
}

function moneyRange(range, currency = 'USD') {
  if (!range || range.low == null || range.high == null) return 'not available';
  if (range.low === range.high) return money(range.low, currency);
  return `${money(range.low, currency)} to ${money(range.high, currency)}`;
}

function money(value, currency = 'USD') {
  if (value == null || Number.isNaN(Number(value))) return 'not available';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0
  }).format(Number(value));
}

function humanizeToken(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}
