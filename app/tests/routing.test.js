import test from 'node:test';
import assert from 'node:assert/strict';
import { computeChecklist, getChecklist } from '../src/checklists.js';
import { computeRoutingDecision } from '../src/routing.js';

test('incomplete baseline evidence stays in field collection with targeted next requests', () => {
  const checklist = computeChecklist('combine', [
    evidence('front_45')
  ]);

  const decision = computeRoutingDecision({
    tradeCase: combineCase(),
    checklist,
    findings: []
  });

  assert.equal(decision.route, 'needs_more_evidence');
  assert.equal(decision.reviewStatus, 'field_collection');
  assert.equal(decision.packetReady, false);
  assert.equal(decision.nextEvidenceRequests[0].slot, 'rear_45');
  assert.ok(decision.riskFlags.some(flag => flag.code === 'evidence_incomplete'));
});

test('complete clean evidence can become a fast-path candidate', () => {
  const checklist = computeChecklist('combine', completeEvidence('combine'));

  const decision = computeRoutingDecision({
    tradeCase: combineCase(),
    checklist,
    findings: [
      {
        findingType: 'condition',
        severity: 'info',
        finding: 'No major visible issue recorded on exterior overview photos.'
      }
    ]
  });

  assert.equal(decision.route, 'fast_path_candidate');
  assert.equal(decision.routeCategory, 'fast');
  assert.equal(decision.reviewStatus, 'ready_for_fast_review');
  assert.equal(decision.packetReady, true);
  assert.ok(decision.confidence > 0.7);
});

test('high-hour complete evidence goes to standard review', () => {
  const checklist = computeChecklist('high_hp_tractor', completeEvidence('high_hp_tractor'));

  const decision = computeRoutingDecision({
    tradeCase: {
      machine: {
        unitType: 'high_hp_tractor',
        make: 'John Deere',
        model: '8R 370',
        serialOrPin: 'TRACTOR-PIN',
        engineHours: 6500
      }
    },
    checklist,
    findings: []
  });

  assert.equal(decision.route, 'standard_review');
  assert.equal(decision.reviewStatus, 'ready_for_standard_review');
  assert.ok(decision.riskFlags.some(flag => flag.code === 'high_hours'));
});

test('visible mechanical risk escalates to technician inspection', () => {
  const checklist = computeChecklist('combine', completeEvidence('combine'));

  const decision = computeRoutingDecision({
    tradeCase: combineCase(),
    checklist,
    findings: [
      {
        findingType: 'condition',
        section: 'engine_compartment',
        severity: 'concern',
        finding: 'Visible hydraulic leak under the engine compartment.'
      }
    ]
  });

  assert.equal(decision.route, 'technician_inspection_required');
  assert.equal(decision.routeCategory, 'escalation');
  assert.equal(decision.reviewStatus, 'technician_inspection_required');
  assert.ok(decision.escalationReasons.length > 0);
  assert.ok(decision.targetedFollowUpQuestions.some(question => question.includes('hydraulic leak')));
});

test('weak startup video asks for a specific field-friendly retake', () => {
  const checklist = computeChecklist('combine', [
    ...completeEvidence('combine').filter(item => item.checklist_slot !== 'startup_video'),
    {
      id: 'startup-video-evidence',
      checklist_slot: 'startup_video',
      quality_status: 'weak',
      analysis_status: 'complete'
    }
  ]);

  const decision = computeRoutingDecision({
    tradeCase: combineCase(),
    checklist,
    findings: [
      {
        findingType: 'uncertainty',
        severity: 'info',
        finding: 'Sampled frames do not verify audio or true cold-start behavior.'
      }
    ]
  });

  assert.equal(decision.route, 'needs_more_evidence');
  assert.ok(decision.targetedFollowUpQuestions.some(question => question.includes('cold start')));
  assert.ok(decision.confidence > 0.4);
});

test('evidence quality warnings do not double-count as visible condition severity', () => {
  const checklist = computeChecklist('combine', [
    ...completeEvidence('combine').filter(item => item.checklist_slot !== 'engine_compartment'),
    {
      id: 'engine-compartment-evidence',
      checklist_slot: 'engine_compartment',
      quality_status: 'weak',
      analysis_status: 'complete'
    }
  ]);

  const decision = computeRoutingDecision({
    tradeCase: combineCase(),
    checklist,
    findings: [
      {
        findingType: 'evidence_quality',
        section: 'engine_compartment',
        severity: 'concern',
        finding: 'The engine compartment image is partially shadowed and should be clearer.'
      }
    ]
  });

  assert.equal(decision.route, 'needs_more_evidence');
  assert.equal(decision.confidenceFactors.severityCounts.concern, 0);
  assert.ok(decision.confidence > 0.45);
});

test('rejected wrong-subject media stays in evidence collection instead of technician escalation', () => {
  const checklist = computeChecklist('combine', [
    {
      id: 'wrong-subject',
      checklist_slot: 'front_45',
      quality_status: 'rejected',
      analysis_status: 'complete'
    }
  ]);

  const decision = computeRoutingDecision({
    tradeCase: combineCase(),
    checklist,
    findings: [
      {
        findingType: 'condition',
        severity: 'severe',
        finding: 'The image does not show the referenced machine; it shows a portrait instead of a John Deere combine.'
      }
    ]
  });

  assert.equal(decision.route, 'needs_more_evidence');
  assert.equal(decision.reviewStatus, 'field_collection');
  assert.ok(decision.riskFlags.some(flag => flag.code === 'rejected_evidence'));
});

test('portrait or artwork evidence does not trigger mechanical escalation', () => {
  const checklist = computeChecklist('combine', [
    {
      id: 'portrait',
      checklist_slot: 'front_45',
      quality_status: 'rejected',
      analysis_status: 'complete'
    }
  ]);

  const decision = computeRoutingDecision({
    tradeCase: combineCase(),
    checklist,
    findings: [
      {
        findingType: 'condition',
        severity: 'severe',
        finding: 'Visible content appears to be a painted portrait of a seated woman, not equipment evidence.'
      }
    ]
  });

  assert.equal(decision.route, 'needs_more_evidence');
  assert.equal(decision.reviewStatus, 'field_collection');
  assert.ok(decision.riskFlags.some(flag => flag.code === 'rejected_evidence'));
  assert.ok(!decision.riskFlags.some(flag => flag.code === 'visible_severe_condition'));
});

function combineCase() {
  return {
    machine: {
      unitType: 'combine',
      make: 'John Deere',
      model: 'S780',
      serialOrPin: 'COMBINE-PIN',
      engineHours: 1200,
      separatorHours: 850
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
