import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TRANSIENT_CODES = new Set([
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'RATE_OR_QUOTA_LIMIT',
]);
const OPERATIONAL_CODES = new Set([
  ...TRANSIENT_CODES,
  'INVALID_API_KEY',
  'MODEL_NOT_AVAILABLE',
  'INVALID_PROVIDER_RESPONSE',
]);
const DEFAULT_PRIORITY = ['gemini', 'custom', 'openai'];

function initialHealth() {
  return {
    healthScore: 50,
    successes: 0,
    failures: 0,
    consecutiveFailures: 0,
    circuit: 'CLOSED',
    openUntil: null,
    lastErrorCode: null,
    lastSuccessAt: null,
    lastFailureAt: null,
  };
}

function bounded(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = filePath + '.tmp-' + process.pid + '-' + Date.now();
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await rename(temporary, filePath);
}

export class FiscalProvidersExhaustedError extends Error {
  constructor(routeTrace) {
    super('No configured visual fiscal provider completed the review.');
    this.name = 'FiscalProvidersExhaustedError';
    this.code = 'ALL_VISUAL_FISCAL_PROVIDERS_FAILED';
    this.routeTrace = routeTrace;
    this.retryable = routeTrace.some(item =>
      item.status === 'FAILED' && TRANSIENT_CODES.has(item.errorCode)
    );
  }
}

export class FiscalProviderRouter {
  constructor({
    providers,
    stateDir,
    priority = DEFAULT_PRIORITY,
    allowPaidFallback = false,
    now = () => Date.now(),
    cacheTtlMs = 7 * 24 * 60 * 60 * 1000,
  }) {
    this.providers = new Map((providers ?? []).map(provider => [provider.id, provider]));
    this.stateDir = path.resolve(stateDir);
    this.priority = [...priority];
    this.allowPaidFallback = Boolean(allowPaidFallback);
    this.now = now;
    this.cacheTtlMs = cacheTtlMs;
    this.statePath = path.join(this.stateDir, 'health.json');
    this.cacheDir = path.join(this.stateDir, 'cache');
    this.state = null;
  }

  async load() {
    if (this.state) return;
    await mkdir(this.cacheDir, { recursive: true });
    if (await exists(this.statePath)) {
      try {
        const parsed = JSON.parse(await readFile(this.statePath, 'utf8'));
        if (parsed?.schemaVersion === 1 && parsed.providers) {
          this.state = parsed;
          return;
        }
      } catch {
        // Corrupt health state cannot authorize a PASS and is safely replaced.
      }
    }
    this.state = { schemaVersion: 1, providers: {} };
  }

  providerHealth(providerId) {
    this.state.providers[providerId] ??= initialHealth();
    return this.state.providers[providerId];
  }

  orderedIds(preferredProviderId, deprioritized = []) {
    const ids = preferredProviderId
      ? [preferredProviderId, ...this.priority.filter(id => id !== preferredProviderId)]
      : [...this.priority];
    for (const id of this.providers.keys()) if (!ids.includes(id)) ids.push(id);
    const late = new Set(deprioritized);
    return [...ids.filter(id => !late.has(id)), ...ids.filter(id => late.has(id))];
  }

  circuitAllows(health) {
    if (health.circuit !== 'OPEN') return true;
    if (Number(health.openUntil || 0) <= this.now()) {
      health.circuit = 'HALF_OPEN';
      return true;
    }
    return false;
  }

  cacheKey(provider, request) {
    return createHash('sha256')
      .update(String(provider.id)).update('\0')
      .update(String(provider.model)).update('\0')
      .update(String(request.context)).update('\0')
      .update(String(request.imageData))
      .digest('hex');
  }

  async readCache(provider, request) {
    const key = this.cacheKey(provider, request);
    const file = path.join(this.cacheDir, key + '.json');
    if (!(await exists(file))) return null;
    try {
      const cached = JSON.parse(await readFile(file, 'utf8'));
      const age = this.now() - Number(cached.createdAtMs || 0);
      if (age < 0 || age > this.cacheTtlMs) return null;
      return cached.analysis;
    } catch {
      return null;
    }
  }

  async record(providerId, ok, errorCode = null) {
    const health = this.providerHealth(providerId);
    if (ok) {
      health.healthScore = bounded(health.healthScore + 10);
      health.successes += 1;
      health.consecutiveFailures = 0;
      health.circuit = 'CLOSED';
      health.openUntil = null;
      health.lastErrorCode = null;
      health.lastSuccessAt = new Date(this.now()).toISOString();
    } else {
      health.healthScore = bounded(health.healthScore - (TRANSIENT_CODES.has(errorCode) ? 15 : 25));
      health.failures += 1;
      health.consecutiveFailures += 1;
      health.lastErrorCode = errorCode;
      health.lastFailureAt = new Date(this.now()).toISOString();
      if (
        ['INVALID_API_KEY', 'MODEL_NOT_AVAILABLE'].includes(errorCode) ||
        health.consecutiveFailures >= 3
      ) {
        health.circuit = 'OPEN';
        health.openUntil = this.now() + 5 * 60 * 1000;
      }
    }
    await atomicJson(this.statePath, this.state);
    return health;
  }

  async analyze(request, {
    preferredProviderId = null,
    deprioritizeProviderIds = [],
    useCache = true,
  } = {}) {
    await this.load();
    const trace = [];

    for (const id of this.orderedIds(preferredProviderId, deprioritizeProviderIds)) {
      const provider = this.providers.get(id);
      if (!provider) continue;
      const health = this.providerHealth(id);

      if (!provider.configured) {
        trace.push({ providerId: id, status: 'SKIPPED', reason: 'NOT_CONFIGURED' });
        continue;
      }
      const explicitlySelected = preferredProviderId === id;
      if (provider.billingClass === 'paid' && !explicitlySelected && !this.allowPaidFallback) {
        trace.push({ providerId: id, status: 'SKIPPED', reason: 'PAID_FALLBACK_DISABLED' });
        continue;
      }
      if (!this.circuitAllows(health)) {
        trace.push({ providerId: id, status: 'SKIPPED', reason: 'CIRCUIT_OPEN', healthScore: health.healthScore });
        continue;
      }

      if (useCache) {
        const cached = await this.readCache(provider, request);
        if (cached) {
          trace.push({ providerId: id, status: 'CACHE_HIT', healthScore: health.healthScore });
          return { analysis: cached, providerId: id, model: provider.model, cacheHit: true, routeTrace: trace };
        }
      }

      try {
        const analysis = await provider.analyze(request);
        const nextHealth = await this.record(id, true);
        await atomicJson(path.join(this.cacheDir, this.cacheKey(provider, request) + '.json'), {
          schemaVersion: 1,
          createdAtMs: this.now(),
          providerId: id,
          model: provider.model,
          analysis,
        });
        trace.push({ providerId: id, status: 'SUCCESS', healthScore: nextHealth.healthScore });
        return { analysis, providerId: id, model: provider.model, cacheHit: false, routeTrace: trace };
      } catch (error) {
        const code = String(error?.code || '');
        if (!OPERATIONAL_CODES.has(code)) throw error;
        const nextHealth = await this.record(id, false, code);
        trace.push({
          providerId: id,
          status: 'FAILED',
          errorCode: code,
          healthScore: nextHealth.healthScore,
          circuit: nextHealth.circuit,
        });
      }
    }

    await atomicJson(this.statePath, this.state);
    throw new FiscalProvidersExhaustedError(trace);
  }
}

export function providerPriorityFromEnv(env = process.env) {
  const configured = String(env.VISUAL_FISCAL_PROVIDER_PRIORITY || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? [...new Set(configured)] : [...DEFAULT_PRIORITY];
}
