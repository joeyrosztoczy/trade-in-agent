import { getChecklist, normalizeUnitType } from './checklists.js';

const ROUTE_NEEDS_MORE_EVIDENCE = 'needs_more_evidence';
const ROUTE_FAST_PATH = 'fast_path_candidate';
const ROUTE_STANDARD_REVIEW = 'standard_review';
const ROUTE_ESCALATION = 'escalation_required';
const ROUTE_TECHNICIAN = 'technician_inspection_required';

const CRITICAL_FINDING_PATTERNS = [
  /\b(leak|leaking|oil|hydraulic|coolant|fuel)\b/i,
  /\b(crack|cracked|structural|frame|weld|welded)\b/i,
  /\b(smoke|rough idle|hard start|abnormal noise|vibration)\b/i,
  /\b(warning light|fault|code|alarm|derate)\b/i,
  /\b(engine|transmission|final drive|emission|def|scr)\b/i,
  /\b(missing guard|fire|burn|overheat)\b/i
];

const HIGH_RISK_SLOTS = new Set([
  'startup_video',
  'engine_compartment',
  'underbody_leaks',
  'damage_leaks_welds',
  'hydraulic_remotes',
  'feeder_house',
  'tires_tracks',
  'front_tires_tracks',
  'rear_tires_tracks'
]);

const UNSUPPORTED_EVIDENCE_PATTERNS = [
  /\b(does not show|doesn't show|not show|not visible|not present)\b/i,
  /\b(unrelated|wrong subject|not valid trade-in evidence|not a .*machine|not a .*combine|not a .*tractor)\b/i,
  /\b(no .*combine .*visible|no .*tractor .*visible|no .*machine .*visible)\b/i,
  /\b(cannot support|can't support|insufficient for|not usable for)\b/i
];

export function computeRoutingDecision({ tradeCase = {}, checklist = {}, findings = [] } = {}) {
  const machine = tradeCase.machine || {};
  const unitType = normalizeUnitType(checklist.unitType || machine.unitType || 'combine');
  const requiredCount = Number(checklist.requiredCount || 0);
  const completeCount = Number(checklist.completeCount || checklist.acceptedCount || 0);
  const acceptedRatio = requiredCount ? completeCount / requiredCount : 0;
  const missingSlots = arrayOf(checklist.missingSlots);
  const retakeSlots = arrayOf(checklist.retakeSlots);
  const weakSlots = arrayOf(checklist.weakSlots);
  const rejectedCount = Number(checklist.rejectedCount || 0);
  const routeFindings = findings.filter(finding => !isUnsupportedEvidenceFinding(finding));
  const severityCounts = countSeverities(routeFindings);
  const highRiskFindings = routeFindings.filter(isHighRiskFinding);
  const identityMissing = !machine.serialOrPin;
  const hoursMissing = !hasHours(unitType, machine);
  const hoursRisk = detectHoursRisk(unitType, machine);
  const riskFlags = [];

  if (missingSlots.length) {
    riskFlags.push(flag('evidence_incomplete', 'watch', `${missingSlots.length} required evidence slot(s) are still missing.`, 'collection'));
  }
  if (retakeSlots.length) {
    riskFlags.push(flag('retake_required', 'watch', `${retakeSlots.length} evidence item(s) need a retake before reviewer handoff.`, 'collection'));
  }
  if (weakSlots.length) {
    riskFlags.push(flag('weak_evidence', 'watch', `${weakSlots.length} evidence item(s) are usable only with low confidence.`, 'collection'));
  }
  if (rejectedCount) {
    riskFlags.push(flag('rejected_evidence', 'watch', `${rejectedCount} evidence item(s) were rejected as unusable or irrelevant.`, 'collection'));
  }
  if (severityCounts.severe > 0) {
    riskFlags.push(flag('visible_severe_condition', 'severe', 'One or more severe visible condition findings were recorded.', 'condition'));
  }
  if (highRiskFindings.length) {
    riskFlags.push(flag(
      'visible_mechanical_or_structural_concern',
      severityCounts.severe > 0 ? 'severe' : 'concern',
      'Visible findings suggest mechanical, leak, structural, warning-code, or safety risk that should not be cleared through photos alone.',
      'condition'
    ));
  }
  if (identityMissing) {
    riskFlags.push(flag('identity_unconfirmed', 'concern', 'Serial/PIN is not confirmed yet.', 'identity'));
  }
  if (hoursMissing) {
    riskFlags.push(flag('hours_unconfirmed', 'concern', 'Required hour meter evidence is not confirmed yet.', 'identity'));
  }
  if (hoursRisk) {
    riskFlags.push(flag('high_hours', 'watch', hoursRisk, 'machine'));
  }

  const nextEvidenceRequests = buildEvidenceRequests({ checklist, unitType, missingSlots, retakeSlots, weakSlots });
  const targetedFollowUpQuestions = buildFollowUpQuestions({
    unitType,
    machine,
    checklist,
    highRiskFindings,
    nextEvidenceRequests,
    identityMissing,
    hoursMissing
  });

  const confidence = computeConfidence({
    acceptedRatio,
    missingCount: missingSlots.length,
    retakeCount: retakeSlots.length,
    weakCount: weakSlots.length,
    rejectedCount,
    severityCounts,
    uncertaintyCount: findings.filter(finding => finding.findingType === 'uncertainty').length,
    identityMissing,
    hoursMissing
  });

  const hasMechanicalEscalation = severityCounts.severe > 0 || highRiskFindings.length > 0;
  const collectionIncomplete = missingSlots.length > 0 || retakeSlots.length > 0 || weakSlots.length > 0;
  const identityEscalation = !collectionIncomplete && (identityMissing || hoursMissing);
  let route = ROUTE_NEEDS_MORE_EVIDENCE;
  let routeCategory = 'collection';
  let reviewStatus = 'field_collection';
  let packetReady = false;
  let routeReason = 'More baseline evidence is needed before the centralized used evaluation team can rely on the packet.';

  if (hasMechanicalEscalation) {
    route = ROUTE_TECHNICIAN;
    routeCategory = 'escalation';
    reviewStatus = 'technician_inspection_required';
    packetReady = true;
    routeReason = 'Visible high-risk condition findings require licensed-technician inspection or equivalent mechanical review before valuation approval.';
  } else if (collectionIncomplete) {
    route = ROUTE_NEEDS_MORE_EVIDENCE;
    routeCategory = 'collection';
    reviewStatus = 'field_collection';
    packetReady = false;
  } else if (identityEscalation) {
    route = ROUTE_ESCALATION;
    routeCategory = 'escalation';
    reviewStatus = 'central_review_hold';
    packetReady = true;
    routeReason = 'Evidence is otherwise complete, but identity or hour confirmation is missing, so valuation should be held for reviewer follow-up.';
  } else if (severityCounts.concern > 0 || severityCounts.watch > 1 || hoursRisk) {
    route = ROUTE_STANDARD_REVIEW;
    routeCategory = 'standard';
    reviewStatus = 'ready_for_standard_review';
    packetReady = true;
    routeReason = 'Baseline evidence is complete, but visible wear, concern-level notes, or machine-hour risk call for normal centralized reviewer handling.';
  } else {
    route = ROUTE_FAST_PATH;
    routeCategory = 'fast';
    reviewStatus = 'ready_for_fast_review';
    packetReady = true;
    routeReason = 'Baseline evidence is complete with no major visible risk flags, so this can be considered for fast centralized review.';
  }

  return {
    route,
    routeCategory,
    reviewStatus,
    confidence,
    packetReady,
    routeReason,
    riskFlags,
    nextEvidenceRequests,
    targetedFollowUpQuestions,
    escalationReasons: riskFlags.filter(item => ['severe', 'concern'].includes(item.severity)).map(item => item.message),
    confidenceFactors: {
      acceptedRatio: Number(acceptedRatio.toFixed(3)),
      completeCount,
      requiredCount,
      missingCount: missingSlots.length,
      retakeCount: retakeSlots.length,
      weakCount: weakSlots.length,
      rejectedCount,
      severityCounts,
      identityConfirmed: !identityMissing,
      hoursConfirmed: !hoursMissing
    }
  };
}

function countSeverities(findings) {
  const counts = { info: 0, watch: 0, concern: 0, severe: 0 };
  for (const finding of findings || []) {
    const severity = ['info', 'watch', 'concern', 'severe'].includes(finding.severity) ? finding.severity : 'info';
    counts[severity] += 1;
  }
  return counts;
}

function isHighRiskFinding(finding = {}) {
  if (finding.findingType !== 'condition') return false;
  if (isUnsupportedEvidenceFinding(finding)) return false;
  if (finding.severity === 'severe') return true;
  if (finding.severity !== 'concern') return false;
  const text = `${finding.section || ''} ${finding.finding || ''} ${finding.recommendation || ''}`;
  return CRITICAL_FINDING_PATTERNS.some(pattern => pattern.test(text));
}

function isUnsupportedEvidenceFinding(finding = {}) {
  if (finding.findingType !== 'condition') return false;
  const text = `${finding.finding || ''} ${finding.recommendation || ''}`;
  return UNSUPPORTED_EVIDENCE_PATTERNS.some(pattern => pattern.test(text));
}

function detectHoursRisk(unitType, machine = {}) {
  const engineHours = Number(machine.engineHours);
  const separatorHours = Number(machine.separatorHours);
  if (unitType === 'combine') {
    if (Number.isFinite(separatorHours) && separatorHours >= 1800) return `Separator hours are high for a combine (${separatorHours}).`;
    if (Number.isFinite(engineHours) && engineHours >= 2500) return `Engine hours are high for a combine (${engineHours}).`;
    return null;
  }
  if (unitType === 'high_hp_tractor' && Number.isFinite(engineHours) && engineHours >= 5000) {
    return `Engine hours are high for a high-horsepower tractor (${engineHours}).`;
  }
  return null;
}

function hasHours(unitType, machine = {}) {
  if (unitType === 'combine') {
    return machine.engineHours != null && machine.separatorHours != null;
  }
  return machine.engineHours != null;
}

function buildEvidenceRequests({ checklist, unitType, missingSlots, retakeSlots, weakSlots }) {
  const descriptions = slotDescriptions(checklist, unitType);
  const requests = [];
  for (const slot of retakeSlots.slice(0, 3)) {
    requests.push({
      slot,
      description: descriptions.get(slot) || slot,
      reason: HIGH_RISK_SLOTS.has(slot) ? 'retake high-risk area with better detail' : 'retake weak or unusable evidence',
      priority: 'high'
    });
  }
  for (const slot of missingSlots.slice(0, Math.max(0, 3 - requests.length))) {
    requests.push({
      slot,
      description: descriptions.get(slot) || slot,
      reason: 'missing required baseline evidence',
      priority: HIGH_RISK_SLOTS.has(slot) ? 'high' : 'normal'
    });
  }
  for (const slot of weakSlots.slice(0, Math.max(0, 3 - requests.length))) {
    requests.push({
      slot,
      description: descriptions.get(slot) || slot,
      reason: 'existing evidence is usable but low confidence',
      priority: HIGH_RISK_SLOTS.has(slot) ? 'high' : 'normal'
    });
  }
  return requests;
}

function buildFollowUpQuestions({ unitType, machine, highRiskFindings, nextEvidenceRequests, identityMissing, hoursMissing }) {
  const questions = [];
  for (const request of nextEvidenceRequests) {
    if (request.reason.startsWith('retake')) {
      questions.push(`Please retake ${request.description} with brighter light, the whole area in frame, and a close-up of any visible issue.`);
    } else {
      questions.push(`Please send ${request.description}.`);
    }
  }
  if (identityMissing) {
    questions.push('Please send a clear serial plate/PIN photo so the evaluator can confirm machine identity.');
  }
  if (hoursMissing) {
    questions.push(unitType === 'combine'
      ? 'Please send the cab display showing both engine hours and separator hours.'
      : 'Please send the cab display showing current engine hours.');
  }
  for (const finding of highRiskFindings.slice(0, 2)) {
    const section = finding.section ? ` around ${finding.section}` : '';
    questions.push(`Please capture a closer photo or short video${section} so a reviewer can assess: ${finding.finding}`);
  }
  if (!questions.length && machine.model) {
    questions.push(`Evidence looks ready for reviewer handoff on the ${machine.model}; ask the evaluator whether they want a fast-path review or normal review.`);
  }
  return [...new Set(questions)].slice(0, 5);
}

function computeConfidence({
  acceptedRatio,
  missingCount,
  retakeCount,
  weakCount,
  rejectedCount,
  severityCounts,
  uncertaintyCount,
  identityMissing,
  hoursMissing
}) {
  const score = 0.28 +
    acceptedRatio * 0.5 -
    missingCount * 0.045 -
    retakeCount * 0.07 -
    weakCount * 0.04 -
    rejectedCount * 0.03 -
    severityCounts.severe * 0.22 -
    severityCounts.concern * 0.09 -
    severityCounts.watch * 0.035 -
    uncertaintyCount * 0.025 -
    (identityMissing ? 0.08 : 0) -
    (hoursMissing ? 0.06 : 0);

  return Number(Math.max(0.05, Math.min(0.95, score)).toFixed(2));
}

function slotDescriptions(checklist, unitType) {
  const descriptions = new Map();
  for (const item of checklist.items || []) descriptions.set(item.slot, item.description);
  for (const [slot, description] of getChecklist(unitType)) {
    if (!descriptions.has(slot)) descriptions.set(slot, description);
  }
  return descriptions;
}

function flag(code, severity, message, category) {
  return { code, severity, message, category };
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}
