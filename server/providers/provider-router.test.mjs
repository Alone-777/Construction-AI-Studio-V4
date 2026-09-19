import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AllVisualProvidersFailedError,
  VisualProviderRouter,
  visualProviderPolicy,
} from './provider-router.mjs';

const tempDirs = [];

async function tempStateDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'provider-router-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir =>
    rm(dir, { recursive: true, force: true })
  ));
});

function provider(id, analyze, options = {}) {
  return {
    id,
    name: id,
    model: options.model || id + '-model',
    configured: options.configured ?? true,
    endpoint: options.endpoint,
    timeoutMs: 120_000,
    analyze: vi.fn(analyze),
  };
}

function request() {
  return {
    imageData: 'data:image/png;base64,AAAA',
    mimeType: 'image/png',
    userContext: 'same contact sheet',
    contract: 'construction-fiscal-v1',
  };
}

function operationalError(code) {
  return Object.assign(new Error(code), { code });
}

describe('VisualProviderRouter', () => {
  it('falls back to the next eligible provider after a transient failure', async () => {
    const gemini = provider('gemini', async () => {
      throw operationalError('PROVIDER_UNAVAILABLE');
    });
    const custom = provider('custom', async () => ({ ok: true }), {
      endpoint: 'http://localhost:9000/analyze',
    });
    const router = new VisualProviderRouter({
      providers: [gemini, custom],
      stateDir: await tempStateDir(),
    });

    const result = await router.analyze(request(), {
      preferredProviderId: 'gemini',
    });

    expect(result.providerId).toBe('custom');
    expect(gemini.analyze).toHaveBeenCalledOnce();
    expect(custom.analyze).toHaveBeenCalledOnce();
    expect(result.routeTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerId: 'gemini',
        status: 'FAILED',
        errorCode: 'PROVIDER_UNAVAILABLE',
      }),
      expect.objectContaining({
        providerId: 'custom',
        status: 'SUCCESS',
      }),
    ]));
  });

  it('never enables paid fallback automatically', async () => {
    const gemini = provider('gemini', async () => {
      throw operationalError('PROVIDER_TIMEOUT');
    });
    const openai = provider('openai', async () => ({ ok: true }));
    const router = new VisualProviderRouter({
      providers: [gemini, openai],
      stateDir: await tempStateDir(),
      allowPaidFallback: false,
    });

    await expect(router.analyze(request(), {
      preferredProviderId: 'gemini',
    })).rejects.toMatchObject({
      code: 'ALL_VISUAL_PROVIDERS_FAILED',
    });
    expect(openai.analyze).not.toHaveBeenCalled();
  });

  it('allows a paid provider only when it is explicitly requested', async () => {
    const openai = provider('openai', async () => ({ ok: true }));
    const router = new VisualProviderRouter({
      providers: [openai],
      stateDir: await tempStateDir(),
      allowPaidFallback: false,
    });

    const result = await router.analyze(request(), {
      preferredProviderId: 'openai',
    });

    expect(result.providerId).toBe('openai');
    expect(openai.analyze).toHaveBeenCalledOnce();
  });

  it('marks free/quota providers as untrusted by default', () => {
    expect(visualProviderPolicy({ id: 'gemini' })).toMatchObject({
      billingClass: 'free_or_quota',
      trustedByDefault: false,
    });
  });

  it('opens the circuit after repeated provider failures', async () => {
    let now = 1_000;
    const gemini = provider('gemini', async () => {
      throw operationalError('PROVIDER_UNAVAILABLE');
    });
    const router = new VisualProviderRouter({
      providers: [gemini],
      stateDir: await tempStateDir(),
      now: () => now,
    });

    for (let index = 0; index < 3; index += 1) {
      await expect(router.analyze(request(), {
        preferredProviderId: 'gemini',
        useCache: false,
      })).rejects.toBeInstanceOf(AllVisualProvidersFailedError);
      now += 1;
    }

    await expect(router.analyze(request(), {
      preferredProviderId: 'gemini',
      useCache: false,
    })).rejects.toMatchObject({
      routeTrace: [
        expect.objectContaining({
          providerId: 'gemini',
          status: 'SKIPPED',
          reason: 'CIRCUIT_OPEN',
        }),
      ],
    });
    expect(gemini.analyze).toHaveBeenCalledTimes(3);
  });

  it('updates health score and persists only safe operational metadata', async () => {
    const gemini = provider('gemini', async () => ({ ok: true }));
    const stateDir = await tempStateDir();
    const router = new VisualProviderRouter({
      providers: [gemini],
      stateDir,
    });

    const result = await router.analyze(request(), {
      preferredProviderId: 'gemini',
    });

    expect(result.healthScore).toBe(60);
    const state = JSON.parse(
      await readFile(path.join(stateDir, 'health.json'), 'utf8'),
    );
    expect(state.providers.gemini).toMatchObject({
      healthScore: 60,
      successes: 1,
      failures: 0,
      circuit: 'CLOSED',
    });
    expect(JSON.stringify(state)).not.toContain('imageData');
  });

  it('reuses a successful analysis by SHA-256 cache for identical input', async () => {
    const gemini = provider('gemini', async () => ({ answer: 42 }));
    const router = new VisualProviderRouter({
      providers: [gemini],
      stateDir: await tempStateDir(),
    });

    const first = await router.analyze(request(), {
      preferredProviderId: 'gemini',
    });
    const second = await router.analyze(request(), {
      preferredProviderId: 'gemini',
    });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.analysis).toEqual({ answer: 42 });
    expect(gemini.analyze).toHaveBeenCalledOnce();
  });

  it('fails closed when every eligible provider fails', async () => {
    const gemini = provider('gemini', async () => {
      throw operationalError('RATE_OR_QUOTA_LIMIT');
    });
    const custom = provider('custom', async () => {
      throw operationalError('PROVIDER_TIMEOUT');
    }, {
      endpoint: 'http://localhost:9000/analyze',
    });
    const router = new VisualProviderRouter({
      providers: [gemini, custom],
      stateDir: await tempStateDir(),
    });

    await expect(router.analyze(request(), {
      preferredProviderId: 'gemini',
      useCache: false,
    })).rejects.toMatchObject({
      code: 'ALL_VISUAL_PROVIDERS_FAILED',
      retryable: true,
    });
  });
});
