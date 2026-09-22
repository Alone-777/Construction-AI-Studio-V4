import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FiscalProviderRouter } from '../server/visual-fiscal-agent/provider-router.mjs';
import { runVisualFiscalAgent } from './visual-fiscal-agent.mjs';

const temporaryDirectories = [];

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'visual-fiscal-agent-'));
  temporaryDirectories.push(directory);
  const image = Buffer.alloc(128, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(image);
  const contactSheetPath = path.join(directory, 'contact-sheet.png');
  await writeFile(contactSheetPath, image);
  return {
    directory,
    contactSheetPath,
    sha256: createHash('sha256').update(image).digest('hex'),
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ));
});

function context(sha256) {
  return {
    jobId: 'job-001',
    attempt: 1,
    contactSheetSha256: sha256,
    job: {
      id: 'job-001',
      operationType: 'site-preparation',
      startStagePercentage: 0,
      targetStagePercentage: 25,
      prompt: 'Clear only the bounded patch.',
      acceptanceChecklist: ['cleared surface persists'],
      continuityLocks: { forbiddenFutureElements: ['foundation'] },
    },
  };
}

function passAnalysis(observedStagePercentage = 25) {
  return {
    summary: 'Causal selective clearing reaches a partial stable result.',
    observedStagePercentage,
    confidence: 0.94,
    continuity: { source: 'MATCH', worker: 'MATCH', environment: 'MATCH', geometry: 'MATCH' },
    futureElementsVisible: [],
    missingEvidence: [],
    terminalFrameValid: true,
    physicalCausality: 'VALID',
    failures: [],
    uncertainties: [],
  };
}

describe('runVisualFiscalAgent', () => {
  it('returns REVIEW_REQUIRED without an active provider and never mutates canonical state', async () => {
    const item = await fixture();
    const result = await runVisualFiscalAgent({
      contactSheetPath: item.contactSheetPath,
      context: context(item.sha256),
      stateDir: path.join(item.directory, 'state'),
      env: {},
      providers: [],
    });

    expect(result).toMatchObject({
      verdict: 'REVIEW_REQUIRED',
      blockers: ['VISUAL_FISCAL_PROVIDER_NOT_CONFIGURED'],
      canonicalWorldAdvanced: false,
    });
  });

  it('performs two independent rounds before returning PASS', async () => {
    const item = await fixture();
    let calls = 0;
    const provider = {
      id: 'custom',
      model: 'test-model',
      configured: true,
      billingClass: 'custom',
      async analyze() {
        calls += 1;
        return passAnalysis(calls === 1 ? 25 : 27);
      },
    };
    const router = new FiscalProviderRouter({
      providers: [provider],
      stateDir: path.join(item.directory, 'router'),
    });

    const result = await runVisualFiscalAgent({
      contactSheetPath: item.contactSheetPath,
      context: context(item.sha256),
      stateDir: path.join(item.directory, 'state'),
      providers: [provider],
      router,
    });

    expect(calls).toBe(2);
    expect(result).toMatchObject({
      verdict: 'PASS',
      expectedContactSheetSha256: item.sha256,
      expectedAttempts: 1,
      canonicalWorldAdvanced: false,
    });
  });

  it('blocks stale contact-sheet evidence before calling a provider', async () => {
    const item = await fixture();
    const result = await runVisualFiscalAgent({
      contactSheetPath: item.contactSheetPath,
      context: context('f'.repeat(64)),
      stateDir: path.join(item.directory, 'state'),
      providers: [],
    });

    expect(result).toMatchObject({
      verdict: 'REVIEW_REQUIRED',
      blockers: ['CONTACT_SHEET_IDENTITY_MISMATCH'],
      errorCode: 'STALE_REVIEW_EVIDENCE',
    });
  });
});
