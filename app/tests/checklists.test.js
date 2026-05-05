import test from 'node:test';
import assert from 'node:assert/strict';
import { computeChecklist, getChecklist, normalizeUnitType } from '../src/checklists.js';

test('normalizes high horsepower tractor aliases', () => {
  assert.equal(normalizeUnitType('high horsepower tractor'), 'high_hp_tractor');
  assert.equal(normalizeUnitType('large-tractor'), 'high_hp_tractor');
});

test('combine checklist reports missing baseline evidence', () => {
  const checklist = computeChecklist('combine', [
    { id: '1', checklist_slot: 'front_45', quality_status: 'accepted' }
  ]);

  assert.equal(checklist.unitType, 'combine');
  assert.equal(checklist.complete, false);
  assert.equal(checklist.completeCount, 1);
  assert.ok(checklist.missingSlots.includes('rear_45'));
});

test('checklist reports weak and retake evidence separately from accepted evidence', () => {
  const checklist = computeChecklist('combine', [
    { id: '1', checklist_slot: 'front_45', quality_status: 'accepted', analysis_status: 'complete' },
    { id: '2', checklist_slot: 'rear_45', quality_status: 'weak', analysis_status: 'complete' },
    { id: '3', checklist_slot: 'engine_compartment', quality_status: 'needs_retake', analysis_status: 'complete' },
    { id: '4', checklist_slot: 'front_45', quality_status: 'duplicate', analysis_status: 'complete' }
  ]);

  assert.equal(checklist.complete, false);
  assert.equal(checklist.acceptedCount, 1);
  assert.equal(checklist.weakCount, 1);
  assert.equal(checklist.retakeCount, 1);
  assert.equal(checklist.duplicateCount, 1);
  assert.deepEqual(checklist.acceptedSlots, ['front_45']);
  assert.ok(checklist.weakSlots.includes('rear_45'));
  assert.ok(checklist.retakeSlots.includes('engine_compartment'));
  assert.equal(checklist.nextRecommendedSlots[0], 'engine_compartment');
});

test('both initial unit types have checklist definitions', () => {
  assert.ok(getChecklist('combine').length > 0);
  assert.ok(getChecklist('high_hp_tractor').length > 0);
});
