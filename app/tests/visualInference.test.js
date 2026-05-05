import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEvidenceMedia } from '../src/visualInference.js';

test('fixture visual inference returns normalized field guidance', async () => {
  process.env.OPENAI_VISION_MODE = 'fixture';
  const result = await analyzeEvidenceMedia({
    evidence: {
      mediaType: 'photo',
      storageUri: 'fixtures/media/front-45-placeholder.jpg',
      checklistSlot: 'front_45',
      notes: 'clear front 45 photo'
    },
    tradeCase: {
      machine: {
        make: 'John Deere',
        model: 'S780'
      }
    },
    request: {}
  });

  assert.equal(result.provider, 'fixture');
  assert.equal(result.normalized.analysisStatus, 'complete');
  assert.equal(result.normalized.qualityStatus, 'accepted');
  assert.equal(result.normalized.checklistSlot, 'front_45');
  assert.ok(result.normalized.visibleConditionFindings.length > 0);
});

test('fixture visual inference can request a retake', async () => {
  process.env.OPENAI_VISION_MODE = 'fixture';
  const result = await analyzeEvidenceMedia({
    evidence: {
      mediaType: 'photo',
      storageUri: 'fixtures/media/dark-engine.jpg',
      checklistSlot: 'engine_compartment',
      notes: 'dark image'
    },
    tradeCase: { machine: {} },
    request: {}
  });

  assert.equal(result.normalized.qualityStatus, 'needs_retake');
  assert.ok(result.normalized.retakeReason);
});

test('fixture visual inference accepts sampled video frame requests', async () => {
  process.env.OPENAI_VISION_MODE = 'fixture';
  const result = await analyzeEvidenceMedia({
    evidence: {
      mediaType: 'video',
      storageUri: 'teams://attachment/startup-video',
      checklistSlot: 'startup_video',
      notes: 'startup video'
    },
    tradeCase: { machine: { model: 'S780' } },
    request: {
      sampledFrames: [
        {
          storageUri: 'fixtures/media/startup-frame-001.jpg',
          contentType: 'image/jpeg'
        }
      ]
    }
  });

  assert.equal(result.normalized.analysisStatus, 'complete');
  assert.equal(result.normalized.checklistSlot, 'startup_video');
});
