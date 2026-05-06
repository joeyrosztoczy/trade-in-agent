import fs from 'node:fs/promises';
import path from 'node:path';
import { describeChecklistSlots, routeLabel } from '../src/presentation.js';

const baseUrl = process.env.SIDECAR_URL || 'http://127.0.0.1:8788';
const outputRoot = process.env.QA_OUTPUT_DIR || path.resolve(process.cwd(), '../../qa-output');
const scenarioFilter = process.env.QA_SCENARIO || 'all';
const runId = new Date().toISOString().replace(/[:.]/g, '-');

const machineFinderListing = 'https://www.machinefinder.com/ww/en-US/machines/2020-john-deere-s780-combine-11033496';
const tractorZoomListing = 'https://tractorzoom.com/equipment/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092';
const stotzComparableListing = 'https://www.stotzequipment.com/used-equipment/harvesting/john-deere-s780-e898505/';
const startupVideo = 'https://www.youtube.com/watch?v=P6W7T40A1OA';
const startupFrame = 'https://img.youtube.com/vi/P6W7T40A1OA/hqdefault.jpg';

const images = {
  front45: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/e8904967-b2db-48d9-bcb0-596ac36e8057-img-1.jpeg?w=828&q=75&format=auto',
  leftSide: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/4ea63c5d-6ade-48cf-afbc-7c012b0df149-img-2.jpeg?w=828&q=75&format=auto',
  rear45: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/16d0b758-2620-47af-8b16-1970f7a2456a-img-4.jpeg?w=828&q=75&format=auto',
  rightSide: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/e761b087-443a-4f6e-9795-3141d41b4cea-img-6.jpeg?w=828&q=75&format=auto',
  modelBadging: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/7a07b5a8-2bdd-48e4-838a-93d61e501b50-img-8.jpeg?w=828&q=75&format=auto',
  feederHouse: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/a548633a-80d2-42f4-863a-b302b3f6aef3-img-11.jpeg?w=828&q=75&format=auto',
  underbody: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/0e222b7d-9602-49d8-b8e5-4ad6c1403a67-img-13.jpeg?w=828&q=75&format=auto',
  frontTire: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/8ba05500-bfab-4db0-adbd-12b11bbf02b6-img-14.jpeg?w=828&q=75&format=auto',
  rearTire: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/98767236-6a1c-4d78-99c5-1ca1fbedd9ff-img-20.jpeg?w=828&q=75&format=auto',
  damageLeaksWelds: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/5a58ff27-6cdb-4234-a9ef-53ed0b101e99-img-26.jpeg?w=828&q=75&format=auto',
  engineCompartment: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/067dc549-4875-4d89-a565-6b30fedb73d8-img-28.jpeg?w=828&q=75&format=auto',
  cabDisplayHours: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/942a0b17-931a-4054-ab72-6cf1abf4e0cc-img-31.jpeg?w=828&q=75&format=auto',
  serialPlate: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/ccc3a58a-d586-4d32-873a-96be68e66a0f-img-44.jpeg?w=828&q=75&format=auto',
  grainTank: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/c67e3153-495b-4f5e-acc2-8fbbb0f78762-img-25.jpeg?w=828&q=75&format=auto',
  cabOverview: 'https://tz-images.gumlet.io/lot/2020-john-deere-s780-370a70f9-8922-4614-90d1-e318703c1092/74c48369-bd0b-40b0-98f9-3fc4d490207a-img-33.jpeg?w=828&q=75&format=auto'
};

const machine = {
  unitType: 'combine',
  make: 'John Deere',
  model: 'S780',
  modelYear: 2020,
  serialOrPin: '1H0S780SLLT810207',
  engineHours: 1039,
  separatorHours: 683,
  location: 'Twin Falls, ID',
  attachmentsOrOptions: 'PRWD, duals, Yield Monitor, Active Yield, Harvest Mobile, Advisor Package, Powercast Tailboard, Power Folding Bin Extension, no header.'
};

const scenarios = [
  {
    name: 'partial-field-walkaround',
    description: 'Sales rep sends a few useful photos first. The agent should accept them and ask for the smallest next useful set.',
    phases: [
      {
        name: 'first batch from sales rep',
        items: [
          photo('front_45', images.front45, 'Front 45-degree photo from Stotz/TractorZoom listing.'),
          photo('left_side', images.leftSide, 'Left side overview from Stotz/TractorZoom listing.'),
          photo('rear_45', images.rear45, 'Rear 45-degree photo from Stotz/TractorZoom listing.'),
          photo('front_tires_tracks', images.frontTire, 'Front tire close-up from Stotz/TractorZoom listing.')
        ]
      }
    ]
  },
  {
    name: 'full-walkaround-with-startup-video',
    description: 'Sales rep sends a near-complete walkaround plus a startup-video placeholder represented by a sampled online frame.',
    phases: [
      {
        name: 'baseline walkaround',
        items: [
          photo('front_45', images.front45, 'Front 45-degree view.'),
          photo('rear_45', images.rear45, 'Rear 45-degree view.'),
          photo('left_side', images.leftSide, 'Full left side.'),
          photo('right_side', images.rightSide, 'Full right side.'),
          photo('serial_plate', images.serialPlate, 'Serial plate / PIN.'),
          photo('model_badging', images.modelBadging, 'Model badging near feederhouse.'),
          photo('cab_display_hours', images.cabDisplayHours, 'Cab display showing engine and separator hours.'),
          photo('feeder_house', images.feederHouse, 'Feeder house evidence.'),
          photo('engine_compartment', images.engineCompartment, 'Engine compartment evidence.'),
          photo('front_tires_tracks', images.frontTire, 'Front tire close-up.'),
          photo('rear_tires_tracks', images.rearTire, 'Rear tire close-up.'),
          photo('damage_leaks_welds', images.damageLeaksWelds, 'Undercarriage / auger / visible damage-leak-weld evidence.')
        ]
      },
      {
        name: 'startup video sample',
        items: [
          video('startup_video', startupVideo, startupFrame, 'Online combine harvest-start video sample. This uses a still frame as the current sidecar proxy for startup video QA; audio and true cold-start behavior are not available from the sampled frame.')
        ]
      },
      {
        name: 'optional reviewer context',
        items: [
          photo('grain_tank', images.grainTank, 'Optional grain tank area.'),
          photo('cab_overview', images.cabOverview, 'Optional cab overview.')
        ]
      }
    ]
  }
];

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathname} failed (${response.status}): ${text}`);
  }
  return body;
}

async function main() {
  const health = await request('/health');
  if (!health.ok) throw new Error('Sidecar health check failed');

  const selected = scenarios.filter(scenario => scenarioFilter === 'all' || scenario.name === scenarioFilter);
  if (!selected.length) throw new Error(`No scenario matched QA_SCENARIO=${scenarioFilter}`);

  const outputDir = path.join(outputRoot, runId);
  await fs.mkdir(outputDir, { recursive: true });

  const results = [];
  for (const scenario of selected) {
    results.push(await runScenario(scenario, outputDir));
  }

  const summary = {
    ok: true,
    baseUrl,
    runId,
    generatedAt: new Date().toISOString(),
    sourcePages: { machineFinderListing, tractorZoomListing, stotzComparableListing, startupVideo },
    scenarios: results.map(result => ({
      name: result.name,
      tradeCaseId: result.tradeCase.id,
      caseNumber: result.tradeCase.caseNumber,
      route: result.routing.route,
      reviewStatus: result.routing.reviewStatus,
      confidence: result.routing.confidence,
      missingCount: result.routing.checklist.missingCount,
      packetId: result.packet.id,
      observations: result.observations,
      outputFiles: result.outputFiles
    }))
  };

  await fs.writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

async function runScenario(scenario, outputDir) {
  const tradeCase = await request('/trade-cases', {
    method: 'POST',
    body: JSON.stringify({
      createdBy: `user-flow-qa:${scenario.name}`,
      sourceConversationId: `qa-${scenario.name}-${Date.now()}`,
      machine
    })
  });

  const phaseResults = [];
  for (const phase of scenario.phases) {
    const batch = await request(`/trade-cases/${tradeCase.id}/evidence/batch`, {
      method: 'POST',
      body: JSON.stringify({ items: phase.items.map(item => item.registration) })
    });

    const analyses = [];
    for (let index = 0; index < batch.items.length; index += 1) {
      const evidence = batch.items[index];
      const source = phase.items[index];
      const analysis = await request(`/trade-cases/${tradeCase.id}/evidence/${evidence.id}/analyze`, {
        method: 'POST',
        body: JSON.stringify({
          analysisMode: source.analysisMode || 'field_evidence_quality',
          checklistSlot: source.registration.checklistSlot,
          sampledFrames: source.sampledFrames
        })
      });
      analyses.push({ evidence, analysis });
    }

    const guidance = await request(`/trade-cases/${tradeCase.id}/guidance`, { method: 'POST', body: '{}' });
    phaseResults.push({ name: phase.name, analyses, guidance });
  }

  const routing = await request(`/trade-cases/${tradeCase.id}/routing`, { method: 'POST', body: '{}' });
  const packet = await request(`/trade-cases/${tradeCase.id}/packet`, { method: 'POST', body: '{}' });
  const fullCase = await request(`/trade-cases/${tradeCase.id}`);

  const scenarioOutput = {
    name: scenario.name,
    description: scenario.description,
    sourcePages: { machineFinderListing, tractorZoomListing, stotzComparableListing, startupVideo },
    tradeCase: fullCase,
    phases: phaseResults,
    routing,
    packet
  };
  scenarioOutput.observations = evaluateScenario(scenarioOutput);

  const jsonPath = path.join(outputDir, `${scenario.name}.json`);
  const mdPath = path.join(outputDir, `${scenario.name}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(scenarioOutput, null, 2));
  await fs.writeFile(mdPath, scenarioMarkdown(scenarioOutput));

  return {
    ...scenarioOutput,
    outputFiles: {
      json: jsonPath,
      markdown: mdPath
    }
  };
}

function photo(checklistSlot, storageUri, notes) {
  return {
    registration: {
      uploadedBy: 'qa-sales-rep',
      mediaType: 'photo',
      storageUri,
      originalFileName: `${checklistSlot}.jpg`,
      contentType: 'image/jpeg',
      checklistSlot,
      qualityStatus: 'pending',
      analysisStatus: 'pending',
      notes,
      metadata: {
        sourcePage: tractorZoomListing,
        sourceMachineFinderPage: machineFinderListing,
        sourceDealerComparablePage: stotzComparableListing,
        qaScenario: true
      }
    }
  };
}

function video(checklistSlot, sourceVideoUri, sampledFrameUri, notes) {
  return {
    registration: {
      uploadedBy: 'qa-sales-rep',
      mediaType: 'video',
      storageUri: sourceVideoUri,
      originalFileName: `${checklistSlot}.youtube-url`,
      contentType: 'text/uri-list',
      checklistSlot,
      qualityStatus: 'pending',
      analysisStatus: 'pending',
      notes,
      metadata: {
        sourceVideoUri,
        sampledFrameUri,
        qaScenario: true
      }
    },
    sampledFrames: [
      {
        storageUri: sampledFrameUri,
        contentType: 'image/jpeg',
        sourceVideoUri
      }
    ]
  };
}

function scenarioMarkdown(output) {
  const lastGuidance = output.phases.at(-1)?.guidance;
  const checklist = output.routing.checklist;
  const unitType = checklist.unitType || output.tradeCase.machine?.unitType || 'combine';
  const accepted = describeChecklistSlots(unitType, checklist.acceptedSlots, checklist, { limit: 12 }).join('; ') || 'None';
  const missing = describeChecklistSlots(unitType, checklist.missingSlots, checklist, { limit: 12 }).join('; ') || 'None';
  const retake = describeChecklistSlots(unitType, checklist.retakeSlots, checklist, { limit: 12 }).join('; ') || 'None';
  const weak = describeChecklistSlots(unitType, checklist.weakSlots, checklist, { limit: 12 }).join('; ') || 'None';
  const riskFlags = output.routing.riskFlags.length
    ? output.routing.riskFlags.map(flag => `- ${flag.severity}: ${flag.message}`).join('\n')
    : '- None';
  const followUps = output.routing.targetedFollowUpQuestions.length
    ? output.routing.targetedFollowUpQuestions.map(question => `- ${question}`).join('\n')
    : '- None';
  const observations = Object.entries(output.observations || {})
    .map(([key, value]) => `- ${key}: ${value ? 'yes' : 'no'}`)
    .join('\n');
  const packetMarkdown = output.packet.markdown || '';

  return `# ${output.name}

${output.description}

Case: ${output.tradeCase.caseNumber} (${output.tradeCase.id})

## Field Guidance

${lastGuidance?.suggestedNextMessage || 'No guidance generated.'}

## Routing

- Route: ${routeLabel(output.routing.route)} (${output.routing.route})
- Review status: ${output.routing.reviewStatus}
- Confidence: ${Math.round((output.routing.confidence || 0) * 100)}%
- Accepted slots: ${accepted}
- Missing slots: ${missing}
- Retake slots: ${retake}
- Weak slots: ${weak}

## Risk Flags

${riskFlags}

## Follow-Up Questions

${followUps}

## Automated QA Observations

${observations || '- No observations recorded'}

## Packet Recommendation

${output.packet.packet.recommendation.nextStep}

## Used-Team Packet Preview

${packetMarkdown}
`;
}

function evaluateScenario(output) {
  const guidance = output.phases.map(phase => phase.guidance?.suggestedNextMessage || '').join('\n');
  const packetText = `${JSON.stringify(output.packet.packet)}\n${output.packet.markdown || ''}`;
  const rawSlotPattern = /\b[a-z]+(?:_[a-z0-9]+){1,}\b/;
  const startupScenario = output.name.includes('startup');
  return {
    caseNumberVisibleToRep: guidance.includes(output.tradeCase.caseNumber),
    friendlyGuidanceHasNoRawSlotIds: !rawSlotPattern.test(guidance),
    guidanceIncludesNextAction: /\bNext:/i.test(guidance),
    packetHasReviewerBrief: Boolean(output.packet.packet.reviewerBrief?.nextStep),
    packetHasReadableEvidenceSummary: Boolean(output.packet.packet.evidenceCompletenessSummary),
    startupVideoLimitationCaptured: startupScenario
      ? /\b(audio|cold-start|startup|sampled frame|video)\b/i.test(packetText)
      : true
  };
}

await main();
