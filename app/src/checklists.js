export const checklistDefinitions = {
  combine: [
    ['front_45', 'Front 45-degree view', true],
    ['rear_45', 'Rear 45-degree view', true],
    ['left_side', 'Full left side', true],
    ['right_side', 'Full right side', true],
    ['serial_plate', 'Serial plate / PIN', true],
    ['model_badging', 'Model badging', true],
    ['cab_display_hours', 'Cab display with engine and separator hours', true],
    ['startup_video', 'Startup video', true],
    ['feeder_house', 'Feeder house opening', true],
    ['engine_compartment', 'Engine compartment', true],
    ['front_tires_tracks', 'Front tires or tracks', true],
    ['rear_tires_tracks', 'Rear tires or tracks', true],
    ['damage_leaks_welds', 'Close-up of visible damage, leaks, rust, welds, or missing guards', true],
    ['grain_tank', 'Grain tank interior', false],
    ['unloading_auger', 'Unloading auger and spout', false],
    ['chopper_spreader', 'Chopper or spreader area', false]
  ],
  high_hp_tractor: [
    ['front_45', 'Front 45-degree view', true],
    ['rear_45', 'Rear 45-degree view', true],
    ['left_side', 'Full left side', true],
    ['right_side', 'Full right side', true],
    ['serial_plate', 'Serial plate / PIN', true],
    ['model_badging', 'Model badging', true],
    ['cab_display_hours', 'Cab display with hours', true],
    ['startup_video', 'Startup video', true],
    ['tires_tracks', 'Tires or tracks close-ups', true],
    ['drawbar_three_point_pto', 'Drawbar / three-point / PTO', true],
    ['hydraulic_remotes', 'Hydraulic remotes', true],
    ['engine_compartment', 'Engine compartment', true],
    ['underbody_leaks', 'Underbody or leak evidence when safe', true],
    ['damage_leaks_welds', 'Close-up of visible damage, leaks, rust, welds, or missing guards', true]
  ]
};

export function normalizeUnitType(unitType) {
  if (!unitType) return 'combine';
  const value = String(unitType).trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (['tractor', 'large_tractor', 'high_hp_tractor', 'high_horsepower_tractor'].includes(value)) {
    return 'high_hp_tractor';
  }
  return value;
}

export function getChecklist(unitType) {
  const normalized = normalizeUnitType(unitType);
  return checklistDefinitions[normalized] || [];
}

export function computeChecklist(unitType, evidenceItems) {
  const evidenceBySlot = new Map();
  for (const item of evidenceItems || []) {
    if (!item.checklist_slot) continue;
    const existing = evidenceBySlot.get(item.checklist_slot) || [];
    existing.push(item);
    evidenceBySlot.set(item.checklist_slot, existing);
  }

  const stateBuckets = {
    accepted: [],
    weak: [],
    retake: [],
    duplicate: [],
    rejected: [],
    pending: []
  };

  for (const items of evidenceBySlot.values()) {
    for (const item of items) {
      const status = normalizeEvidenceStatus(item.quality_status);
      stateBuckets[status].push(item);
    }
  }

  const items = getChecklist(unitType).map(([slot, description, requiredForBaseline]) => {
    const slotEvidence = evidenceBySlot.get(slot) || [];
    const accepted = slotEvidence.find(item => ['accepted', 'usable'].includes(item.quality_status));
    const weak = slotEvidence.find(item => item.quality_status === 'weak');
    const retake = slotEvidence.find(item => item.quality_status === 'needs_retake');
    const duplicate = slotEvidence.find(item => item.quality_status === 'duplicate');
    const evidence = accepted || weak || retake || duplicate || slotEvidence[0];
    const status = accepted
      ? 'complete'
      : weak
        ? 'weak'
        : retake
          ? 'needs_retake'
          : requiredForBaseline
            ? 'missing'
            : 'optional';
    return {
      slot,
      description,
      requiredForBaseline,
      status,
      evidenceItemId: evidence?.id || null,
      qualityStatus: evidence?.quality_status || null,
      analysisStatus: evidence?.analysis_status || null
    };
  });

  const required = items.filter(item => item.requiredForBaseline);
  const complete = required.filter(item => item.status === 'complete');
  const missing = required.filter(item => item.status === 'missing');
  const weak = required.filter(item => item.status === 'weak');
  const retake = required.filter(item => item.status === 'needs_retake');
  const nextRecommendedSlots = [...retake, ...missing, ...weak].slice(0, 3).map(item => item.slot);

  return {
    unitType: normalizeUnitType(unitType),
    requiredCount: required.length,
    completeCount: complete.length,
    acceptedCount: complete.length,
    weakCount: weak.length,
    retakeCount: retake.length,
    duplicateCount: stateBuckets.duplicate.length,
    missingCount: missing.length,
    complete: missing.length === 0 && weak.length === 0 && retake.length === 0,
    acceptedSlots: complete.map(item => item.slot),
    weakSlots: weak.map(item => item.slot),
    retakeSlots: retake.map(item => item.slot),
    duplicateSlots: stateBuckets.duplicate.map(item => item.checklist_slot),
    missingSlots: missing.map(item => item.slot),
    nextRecommendedSlots,
    items
  };
}

function normalizeEvidenceStatus(status) {
  if (['accepted', 'usable'].includes(status)) return 'accepted';
  if (status === 'weak') return 'weak';
  if (status === 'needs_retake') return 'retake';
  if (status === 'duplicate') return 'duplicate';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}
