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

test('both initial unit types have checklist definitions', () => {
  assert.ok(getChecklist('combine').length > 0);
  assert.ok(getChecklist('high_hp_tractor').length > 0);
});
