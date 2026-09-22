import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FiscalProviderRouter, FiscalProvidersExhaustedError } from './provider-router.mjs';

const temporaryDirectories = [];

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'visual-fiscal-router-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ));
});

function provider(id, analyze, billingClass = 'free_or_quota') {
  return {
    id,
    model: id + '-model',
    configured: true,
    billingClass,
    analyze: vi.fn(analyze),
  };
}

function request(round = 'primary') {
  return {
    imageData: 'data:image/png;base64,AAAA',
    mimeType: 'image/png',
    context: round,
  };
}

describe('FiscalProviderRouter', () => {
  it('falls back, caches results and persists no image or credential data', async () => {
    const first = provider('gemini', async () => {
      throw Object.assign(new Error('quota'), { code: 'RATE_OR_QUOTA_LIMIT' });
    });
    const second = provider('custom', async () => ({ summary: 'ok' }), 'custom');
    const stateDir = await temporaryDirectory();
    const router = new FiscalProviderRouter({ providers: [first, second], stateDir });

    const initial = await router.analyze(request(), { preferredProviderId: 'gemini' });
    const cached = await router.analyze(request(), { preferredProviderId: 'custom' });

    expect(initial.providerId).toBe('custom');
    expect(cached.cacheHit).toBe(true);
    expect(second.analyze).toHaveBeenCalledOnce();
    const health = await readFile(path.join(stateDir, 'health.json'), 'utf8');
    expect(health).not.toContain('imageData');
    expect(health).not.toContain('AAAA');
  });

  it('never uses paid fallback unless it is explicitly enabled or selected', async () => {
    const free = provider('gemini', async () => {
      throw Object.assign(new Error('offline'), { code: 'PROVIDER_UNAVAILABLE' });
    });
    const paid = provider('openai', async () => ({ summary: 'ok' }), 'paid');
    const router = new FiscalProviderRouter({
      providers: [free, paid],
      stateDir: await temporaryDirectory(),
    });

    await expect(router.analyze(request(), { preferredProviderId: 'gemini' }))
      .rejects.toBeInstanceOf(FiscalProvidersExhaustedError);
    expect(paid.analyze).not.toHaveBeenCalled();
  });
});
