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
  const acceptedEvidence = new Map();
  for (const item of evidenceItems || []) {
    if (!item.checklist_slot) continue;
    if (['accepted', 'usable'].includes(item.quality_status)) {
      acceptedEvidence.set(item.checklist_slot, item);
    }
  }

  const items = getChecklist(unitType).map(([slot, description, requiredForBaseline]) => {
    const evidence = acceptedEvidence.get(slot);
    return {
      slot,
      description,
      requiredForBaseline,
      status: evidence ? 'complete' : requiredForBaseline ? 'missing' : 'optional',
      evidenceItemId: evidence?.id || null
    };
  });

  const required = items.filter(item => item.requiredForBaseline);
  const complete = required.filter(item => item.status === 'complete');
  const missing = required.filter(item => item.status === 'missing');

  return {
    unitType: normalizeUnitType(unitType),
    requiredCount: required.length,
    completeCount: complete.length,
    missingCount: missing.length,
    complete: missing.length === 0,
    missingSlots: missing.map(item => item.slot),
    items
  };
}
