import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  analyzeEvidenceMedia,
  resolveImageInputsForMedia,
  resolveImageUrl,
  resolveLocalMediaPath,
  selectVisionModel
} from '../src/visualInference.js';

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
  assert.match(result.normalized.visibleConditionFindings[0].finding, /Front 45-degree view/);
  assert.doesNotMatch(result.normalized.visibleConditionFindings[0].finding, /front_45/);
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

test('vision model selection defaults to mini and escalates for high-risk review', () => {
  delete process.env.OPENAI_VISION_MODEL;
  delete process.env.OPENAI_VISION_REVIEW_MODEL;

  assert.equal(selectVisionModel({ analysisMode: 'field_evidence_quality' }), 'gpt-5.4-mini');
  assert.equal(selectVisionModel({ analysisMode: 'high_risk' }), 'gpt-5.4');
  assert.equal(selectVisionModel({ useReviewModel: true }), 'gpt-5.4');
  assert.equal(selectVisionModel({ model: 'custom-model' }), 'custom-model');
});

test('vision model selection honors configured defaults', () => {
  process.env.OPENAI_VISION_MODEL = 'default-test-model';
  process.env.OPENAI_VISION_REVIEW_MODEL = 'review-test-model';

  assert.equal(selectVisionModel({}), 'default-test-model');
  assert.equal(selectVisionModel({ escalate: true }), 'review-test-model');

  delete process.env.OPENAI_VISION_MODEL;
  delete process.env.OPENAI_VISION_REVIEW_MODEL;
});

test('media resolver hydrates OpenClaw inbound media references', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaw-media-'));
  const previousRoot = process.env.OPENCLAW_MEDIA_ROOT;
  process.env.OPENCLAW_MEDIA_ROOT = root;
  try {
    await fs.mkdir(path.join(root, 'inbound'), { recursive: true });
    await fs.writeFile(path.join(root, 'inbound', 'front.jpg'), Buffer.from('fake-jpeg-bytes'));

    const expectedFrontPath = await fs.realpath(path.join(root, 'inbound', 'front.jpg'));
    const resolved = await resolveLocalMediaPath('media://inbound/front.jpg');
    assert.equal(resolved, expectedFrontPath);
    assert.equal(await resolveLocalMediaPath('media://inbound/../front.jpg'), null);

    const imageUrl = await resolveImageUrl('media://inbound/front.jpg', 'image/jpeg');
    assert.match(imageUrl, /^data:image\/jpeg;base64,/);

    const inputs = await resolveImageInputsForMedia({
      mediaType: 'photo',
      storageUri: 'media://inbound/front.jpg',
      contentType: 'image/jpeg'
    });
    assert.equal(inputs.length, 1);
    assert.match(inputs[0], /^data:image\/jpeg;base64,/);
  } finally {
    if (previousRoot === undefined) delete process.env.OPENCLAW_MEDIA_ROOT;
    else process.env.OPENCLAW_MEDIA_ROOT = previousRoot;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('media resolver accepts file URLs only inside allowlisted media roots', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaw-media-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-media-'));
  const previousRoot = process.env.OPENCLAW_MEDIA_ROOT;
  process.env.OPENCLAW_MEDIA_ROOT = root;
  try {
    await fs.writeFile(path.join(root, 'inside.jpg'), Buffer.from('inside'));
    await fs.writeFile(path.join(outside, 'outside.jpg'), Buffer.from('outside'));

    assert.equal(await resolveLocalMediaPath(`file://${path.join(root, 'inside.jpg')}`), await fs.realpath(path.join(root, 'inside.jpg')));
    assert.equal(await resolveLocalMediaPath(`file://${path.join(outside, 'outside.jpg')}`), null);

    await fs.writeFile(path.join(root, 'space photo.jpg'), Buffer.from('inside'));
    const spacedFileUrl = new URL(`file://${path.join(root, 'space photo.jpg')}`).href;
    assert.equal(await resolveLocalMediaPath(spacedFileUrl), await fs.realpath(path.join(root, 'space photo.jpg')));
  } finally {
    if (previousRoot === undefined) delete process.env.OPENCLAW_MEDIA_ROOT;
    else process.env.OPENCLAW_MEDIA_ROOT = previousRoot;
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
