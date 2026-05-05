import { query, withTransaction } from './db.js';
import { computeChecklist, normalizeUnitType } from './checklists.js';

function toTradeCase(row, machine = null, evidenceItems = undefined) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    sourceConversationId: row.source_conversation_id,
    status: row.status,
    route: row.route,
    confidence: row.confidence,
    assignedReviewer: row.assigned_reviewer,
    archivedAt: row.archived_at,
    machine,
    evidenceItems
  };
}

function machinePayload(input = {}) {
  return {
    unitType: normalizeUnitType(input.unitType || input.unit_type || 'combine'),
    make: input.make || null,
    model: input.model || null,
    modelYear: input.modelYear || input.model_year || null,
    serialOrPin: input.serialOrPin || input.serial_or_pin || null,
    engineHours: input.engineHours ?? input.engine_hours ?? null,
    separatorHours: input.separatorHours ?? input.separator_hours ?? null,
    location: input.location || null,
    attachmentsOrOptions: input.attachmentsOrOptions || input.attachments_or_options || null
  };
}

export async function healthCheck() {
  const result = await query('SELECT NOW() AS now');
  return { ok: true, databaseTime: result.rows[0].now };
}

export async function createTradeCase(input = {}) {
  return withTransaction(async client => {
    const caseResult = await client.query(
      `INSERT INTO trade_cases (created_by, source_conversation_id, status, route, confidence, assigned_reviewer)
       VALUES ($1, $2, COALESCE($3, 'draft'), COALESCE($4, 'draft'), $5, $6)
       RETURNING *`,
      [
        input.createdBy || input.created_by || 'local-dev',
        input.sourceConversationId || input.source_conversation_id || null,
        input.status || null,
        input.route || null,
        input.confidence ?? null,
        input.assignedReviewer || input.assigned_reviewer || null
      ]
    );

    const machine = machinePayload(input.machine || {});
    const machineResult = await client.query(
      `INSERT INTO machines (
        trade_case_id, unit_type, make, model, model_year, serial_or_pin,
        engine_hours, separator_hours, location, attachments_or_options
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        caseResult.rows[0].id,
        machine.unitType,
        machine.make,
        machine.model,
        machine.modelYear,
        machine.serialOrPin,
        machine.engineHours,
        machine.separatorHours,
        machine.location,
        machine.attachmentsOrOptions
      ]
    );

    return toTradeCase(caseResult.rows[0], rowToMachine(machineResult.rows[0]), []);
  });
}

export async function listTradeCases({ includeArchived = false } = {}) {
  const result = await query(
    `SELECT tc.*, row_to_json(m.*) AS machine
     FROM trade_cases tc
     LEFT JOIN machines m ON m.trade_case_id = tc.id
     WHERE ($1::boolean OR tc.archived_at IS NULL)
     ORDER BY tc.created_at DESC`,
    [includeArchived]
  );

  return result.rows.map(row => {
    const machine = row.machine ? rowToMachine(row.machine) : null;
    return toTradeCase(row, machine);
  });
}

export async function getTradeCase(id) {
  const result = await query(
    `SELECT tc.*, row_to_json(m.*) AS machine
     FROM trade_cases tc
     LEFT JOIN machines m ON m.trade_case_id = tc.id
     WHERE tc.id = $1`,
    [id]
  );
  if (!result.rows.length) return null;

  const evidence = await listEvidence(id);
  const row = result.rows[0];
  return toTradeCase(row, row.machine ? rowToMachine(row.machine) : null, evidence);
}

export async function updateTradeCase(id, input = {}) {
  return withTransaction(async client => {
    const existing = await client.query('SELECT * FROM trade_cases WHERE id = $1', [id]);
    if (!existing.rows.length) return null;

    const current = existing.rows[0];
    const caseResult = await client.query(
      `UPDATE trade_cases
       SET status = $2,
           route = $3,
           confidence = $4,
           assigned_reviewer = $5,
           source_conversation_id = $6,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.status ?? current.status,
        input.route ?? current.route,
        input.confidence ?? current.confidence,
        input.assignedReviewer ?? input.assigned_reviewer,
        input.sourceConversationId ?? input.source_conversation_id
      ]
    );

    let machine = null;
    if (input.machine) {
      const currentMachine = await client.query('SELECT * FROM machines WHERE trade_case_id = $1', [id]);
      const merged = {
        ...rowToMachine(currentMachine.rows[0] || {}),
        ...input.machine
      };
      const normalized = machinePayload(merged);
      const machineResult = await client.query(
        `INSERT INTO machines (
          trade_case_id, unit_type, make, model, model_year, serial_or_pin,
          engine_hours, separator_hours, location, attachments_or_options
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (trade_case_id) DO UPDATE SET
          unit_type = EXCLUDED.unit_type,
          make = EXCLUDED.make,
          model = EXCLUDED.model,
          model_year = EXCLUDED.model_year,
          serial_or_pin = EXCLUDED.serial_or_pin,
          engine_hours = EXCLUDED.engine_hours,
          separator_hours = EXCLUDED.separator_hours,
          location = EXCLUDED.location,
          attachments_or_options = EXCLUDED.attachments_or_options,
          updated_at = NOW()
        RETURNING *`,
        [
          id,
          normalized.unitType,
          normalized.make,
          normalized.model,
          normalized.modelYear,
          normalized.serialOrPin,
          normalized.engineHours,
          normalized.separatorHours,
          normalized.location,
          normalized.attachmentsOrOptions
        ]
      );
      machine = rowToMachine(machineResult.rows[0]);
    } else {
      const machineResult = await client.query('SELECT * FROM machines WHERE trade_case_id = $1', [id]);
      machine = machineResult.rows[0] ? rowToMachine(machineResult.rows[0]) : null;
    }

    return toTradeCase(caseResult.rows[0], machine, await listEvidence(id));
  });
}

export async function archiveTradeCase(id) {
  const result = await query(
    `UPDATE trade_cases
     SET status = 'archived', archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND archived_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

export async function addEvidence(id, input = {}) {
  const exists = await query('SELECT id FROM trade_cases WHERE id = $1', [id]);
  if (!exists.rows.length) return null;

  const result = await query(
    `INSERT INTO evidence_items (
      trade_case_id, uploaded_by, media_type, storage_uri,
      checklist_slot, quality_status, analysis_status, notes
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *`,
    [
      id,
      input.uploadedBy || input.uploaded_by || 'local-dev',
      input.mediaType || input.media_type || 'photo',
      input.storageUri || input.storage_uri || null,
      input.checklistSlot || input.checklist_slot || null,
      input.qualityStatus || input.quality_status || 'pending',
      input.analysisStatus || input.analysis_status || 'pending',
      input.notes || null
    ]
  );
  return rowToEvidence(result.rows[0]);
}

export async function listEvidence(id) {
  const result = await query(
    `SELECT * FROM evidence_items WHERE trade_case_id = $1 ORDER BY uploaded_at ASC, id ASC`,
    [id]
  );
  return result.rows.map(rowToEvidence);
}

export async function getChecklistStatus(id) {
  const tradeCase = await getTradeCase(id);
  if (!tradeCase) return null;
  return computeChecklist(tradeCase.machine?.unitType || 'combine', tradeCase.evidenceItems.map(evidenceToDbShape));
}

export async function generatePacket(id) {
  const tradeCase = await getTradeCase(id);
  if (!tradeCase) return null;

  const checklist = computeChecklist(
    tradeCase.machine?.unitType || 'combine',
    tradeCase.evidenceItems.map(evidenceToDbShape)
  );
  const route = checklist.complete ? 'fast_path_candidate' : 'needs_more_evidence';
  const nextStep = checklist.complete
    ? 'Centralized used evaluation reviewer should review the draft packet.'
    : `Collect missing baseline evidence: ${checklist.missingSlots.join(', ')}.`;

  const packet = {
    tradeCaseId: tradeCase.id,
    generatedAt: new Date().toISOString(),
    route,
    valuationReadiness: checklist.complete ? 'ready_for_review' : 'not_ready',
    machine: tradeCase.machine,
    evidenceCompleteness: checklist,
    riskFlags: [],
    reconScenarios: [
      {
        scenarioType: 'light',
        assumptions: 'Baseline only; no major visible risk flags recorded yet.',
        includedWork: [],
        excludedWork: ['Mechanical inspection', 'Detailed shop estimate'],
        riskNotes: checklist.complete ? 'Needs reviewer validation.' : 'Evidence incomplete.'
      },
      {
        scenarioType: 'standard',
        assumptions: 'Use when average wear or incomplete confidence appears during reviewer analysis.',
        includedWork: [],
        excludedWork: ['Final approved work order'],
        riskNotes: 'Placeholder scenario for MVP packet structure.'
      },
      {
        scenarioType: 'heavy',
        assumptions: 'Use when major wear, leaks, warning lights, structural damage, or weak evidence requires escalation.',
        includedWork: [],
        excludedWork: ['Licensed technician inspection details'],
        riskNotes: 'May require full licensed-technician inspection.'
      }
    ],
    recommendation: {
      preliminaryTradeValue: null,
      reason: 'Numeric valuation is out of scope for Milestone One.',
      nextStep
    }
  };

  const result = await query(
    `INSERT INTO packets (trade_case_id, packet_json, packet_markdown)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, packet, packetToMarkdown(packet)]
  );

  return {
    id: result.rows[0].id,
    tradeCaseId: id,
    packet,
    markdown: result.rows[0].packet_markdown,
    createdAt: result.rows[0].created_at
  };
}

function rowToMachine(row = {}) {
  if (!row) return null;
  return {
    unitType: row.unit_type,
    make: row.make,
    model: row.model,
    modelYear: row.model_year,
    serialOrPin: row.serial_or_pin,
    engineHours: row.engine_hours,
    separatorHours: row.separator_hours,
    location: row.location,
    attachmentsOrOptions: row.attachments_or_options
  };
}

function rowToEvidence(row = {}) {
  return {
    id: row.id,
    tradeCaseId: row.trade_case_id,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    mediaType: row.media_type,
    storageUri: row.storage_uri,
    checklistSlot: row.checklist_slot,
    qualityStatus: row.quality_status,
    analysisStatus: row.analysis_status,
    notes: row.notes
  };
}

function evidenceToDbShape(row = {}) {
  return {
    id: row.id,
    checklist_slot: row.checklistSlot,
    quality_status: row.qualityStatus
  };
}

function packetToMarkdown(packet) {
  const missing = packet.evidenceCompleteness.missingSlots.length
    ? packet.evidenceCompleteness.missingSlots.join(', ')
    : 'None';

  return `# Trade Evaluation Draft Packet

Generated: ${packet.generatedAt}

## Machine

- Unit type: ${packet.machine?.unitType || 'unknown'}
- Make: ${packet.machine?.make || 'unknown'}
- Model: ${packet.machine?.model || 'unknown'}
- Serial/PIN: ${packet.machine?.serialOrPin || 'unknown'}

## Evidence Completeness

- Required: ${packet.evidenceCompleteness.requiredCount}
- Complete: ${packet.evidenceCompleteness.completeCount}
- Missing: ${missing}

## Route

${packet.route}

## Recommendation

${packet.recommendation.nextStep}
`;
}
