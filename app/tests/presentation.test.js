import test from 'node:test';
import assert from 'node:assert/strict';
import { computeChecklist, getChecklist } from '../src/checklists.js';
import { buildGuidanceMessage, buildReviewerBrief, packetToMarkdown } from '../src/presentation.js';
import { computeRoutingDecision } from '../src/routing.js';

test('field guidance uses a case number and friendly evidence names', () => {
  const checklist = computeChecklist('combine', [
    evidence('front_45'),
    evidence('left_side'),
    evidence('rear_45'),
    evidence('front_tires_tracks')
  ]);
  const routing = computeRoutingDecision({
    tradeCase: combineCase(),
    checklist,
    findings: []
  });

  const message = buildGuidanceMessage({
    caseNumber: 'TIA-ABC12345',
    accepted: checklist.acceptedSlots,
    retake: checklist.retakeSlots,
    missing: routing.nextEvidenceRequests.map(request => request.slot),
    visibleSummary: [],
    limitationSummary: [],
    checklist,
    routing
  });

  assert.match(message, /Trade case TIA-ABC12345/);
  assert.match(message, /Front 45-degree view/);
  assert.match(message, /Next: please send/);
  assert.doesNotMatch(message, /\bfront_45\b/);
  assert.doesNotMatch(message, /\brear_45\b/);
});

test('packet markdown is reviewer oriented and human-readable', () => {
  const checklist = computeChecklist('combine', completeEvidence('combine'));
  const packet = {
    tradeCaseId: 'case-id',
    caseNumber: 'TIA-ABC12345',
    generatedAt: '2026-05-06T00:00:00.000Z',
    route: 'standard_review',
    routeCategory: 'standard',
    routeReason: 'Baseline evidence is complete, but visible wear requires normal centralized reviewer handling.',
    reviewStatus: 'ready_for_standard_review',
    confidence: 0.78,
    valuationReadiness: 'ready_for_review',
    machine: combineCase().machine,
    evidenceCompleteness: checklist,
    visibleConditionFindings: [
      {
        findingType: 'condition',
        severity: 'watch',
        finding: 'Visible wear around feeder house should be reviewed before recon budget approval.'
      }
    ],
    evidenceQualityFindings: [],
    uncertaintyFindings: [
      {
        finding: 'Startup video sampled frames do not verify audio or true cold-start behavior.'
      }
    ],
    riskFlags: [],
    targetedFollowUpQuestions: [
      'Ask the rep whether any warning lights appeared during startup.'
    ],
    reconScenarios: [],
    recommendation: {
      preliminaryTradeValue: null,
      reason: 'Numeric valuation is out of scope.',
      nextStep: 'Centralized used evaluation reviewer should review the draft packet.'
    }
  };
  packet.reviewerBrief = buildReviewerBrief(packet);

  const markdown = packetToMarkdown(packet);

  assert.match(markdown, /Reviewer Snapshot/);
  assert.match(markdown, /Ready for standard review/);
  assert.match(markdown, /Cab display with engine and separator hours/);
  assert.match(markdown, /Startup video sampled frames/);
  assert.doesNotMatch(markdown, /\bcab_display_hours\b/);
});

function combineCase() {
  return {
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
