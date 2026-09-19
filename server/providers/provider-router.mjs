import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GeminiVisualProvider } from './gemini-visual-provider.mjs';
import { OpenAIVisualProvider } from './openai-visual-provider.mjs';
import { CustomVisualProvider } from './custom-visual-provider.mjs';

const ROUTER_SCHEMA_VERSION = 1;
const DEFAULT_HEALTH_SCORE = 50;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const TRANSIENT_CODES = new Set([
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'RATE_OR_QUOTA_LIMIT',
  'QUOTA_EXCEEDED',
]);

const OPERATIONAL_CODES = new Set([
  ...TRANSIENT_CODES,
  'INVALID_API_KEY',
  'MODEL_NOT_AVAILABLE',
  'INVALID_PROVIDER_RESPONSE',
]);

export const DEFAULT_PROVIDER_PRIORITY = Object.freeze([
  'gemini',
  'custom',
  'openai',
]);

function boundedScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function isLocalCustom(provider) {
  try {
    const url = new URL(provider?.endpoint || '');
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function visualProviderPolicy(provider) {
  if (provider?.id === 'gemini') {
    return {
      billingClass: 'free_or_quota',
      trustedByDefault: false,
      automaticFallback: true,
    };
  }
  if (provider?.id === 'openai') {
    return {
      billingClass: 'paid',
      trustedByDefault: false,
      automaticFallback: false,
    };
  }
  if (provider?.id === 'custom' && isLocalCustom(provider)) {
    return {
      billingClass: 'local',
      trustedByDefault: false,
      automaticFallback: true,
    };
  }
  return {
    billingClass: 'unknown',
    trustedByDefault: false,
    automaticFallback: false,
  };
}

export function createVisualProviders(env = process.env) {
  return [
    new GeminiVisualProvider(env),
    new OpenAIVisualProvider(env),
    new CustomVisualProvider(env),
  ];
}

export function describeVisualProviders(env = process.env) {
  return createVisualProviders(env).map(provider => ({
    id: provider.id,
    name: provider.name,
    model: provider.model,
    configured: provider.configured,
    ...visualProviderPolicy(provider),
  }));
}

export class AllVisualProvidersFailedError extends Error {
  constructor(routeTrace) {
    super('No eligible visual provider completed the fiscal analysis.');
    this.name = 'AllVisualProvidersFailedError';
    this.code = 'ALL_VISUAL_PROVIDERS_FAILED';
    this.routeTrace = routeTrace;
    this.retryable = routeTrace.some(entry =>
      entry.status === 'FAILED' && TRANSIENT_CODES.has(entry.errorCode)
    );
  }
}

function initialProviderState() {
  return {
    healthScore: DEFAULT_HEALTH_SCORE,
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

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class VisualProviderRouter {
  constructor({
    providers,
    stateDir,
    priority = DEFAULT_PROVIDER_PRIORITY,
    allowPaidFallback = false,
    now = () => Date.now(),
    cacheTtlMs = CACHE_TTL_MS,
  }) {
    this.providers = new Map((providers || []).map(provider => [provider.id, provider]));
    this.stateDir = path.resolve(stateDir);
    this.priority = [...priority];
    this.allowPaidFallback = Boolean(allowPaidFallback);
    this.now = now;
    this.cacheTtlMs = cacheTtlMs;
    this.statePath = path.join(this.stateDir, 'health.json');
    this.cacheDir = path.join(this.stateDir, 'cache');
    this.state = null;
  }

  async loadState() {
    if (this.state) return this.state;
    await mkdir(this.cacheDir, { recursive: true });
    if (await exists(this.statePath)) {
      try {
        const parsed = JSON.parse(await readFile(this.statePath, 'utf8'));
        if (parsed?.schemaVersion === ROUTER_SCHEMA_VERSION && parsed.providers) {
          this.state = parsed;
          return this.state;
        }
      } catch {
        // Corrupt operational state must never authorize a job.
      }
    }
    this.state = { schemaVersion: ROUTER_SCHEMA_VERSION, providers: {} };
    return this.state;
  }

  async saveState() {
    await mkdir(this.stateDir, { recursive: true });
    await writeFile(this.statePath, JSON.stringify(this.state, null, 2) + '\n', 'utf8');
  }

  providerState(providerId) {
    this.state.providers[providerId] ??= initialProviderState();
    return this.state.providers[providerId];
  }

  orderedProviderIds(preferredProviderId, deprioritizeProviderIds = []) {
    const base = preferredProviderId
      ? [preferredProviderId, ...this.priority.filter(id => id !== preferredProviderId)]
      : [...this.priority];
    for (const id of this.providers.keys()) {
      if (!base.includes(id)) base.push(id);
    }
    const deprioritized = new Set(deprioritizeProviderIds);
    return [
      ...base.filter(id => !deprioritized.has(id)),
      ...base.filter(id => deprioritized.has(id)),
    ];
  }

  circuitAllows(state) {
    if (state.circuit !== 'OPEN') return true;
    if (Number(state.openUntil || 0) <= this.now()) {
      state.circuit = 'HALF_OPEN';
      return true;
    }
    return false;
  }

  async recordSuccess(providerId) {
    const state = this.providerState(providerId);
    state.healthScore = boundedScore(state.healthScore + 10);
    state.successes += 1;
    state.consecutiveFailures = 0;
    state.circuit = 'CLOSED';
    state.openUntil = null;
    state.lastErrorCode = null;
    state.lastSuccessAt = new Date(this.now()).toISOString();
    await this.saveState();
    return state;
  }

  async recordFailure(providerId, errorCode) {
    const state = this.providerState(providerId);
    const transient = TRANSIENT_CODES.has(errorCode);
    state.healthScore = boundedScore(state.healthScore - (transient ? 15 : 25));
    state.failures += 1;
    state.consecutiveFailures += 1;
    state.lastErrorCode = errorCode;
    state.lastFailureAt = new Date(this.now()).toISOString();

    const permanentConfigurationFailure =
      errorCode === 'INVALID_API_KEY' || errorCode === 'MODEL_NOT_AVAILABLE';
    if (permanentConfigurationFailure ||
        state.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      state.circuit = 'OPEN';
      state.openUntil = this.now() + CIRCUIT_COOLDOWN_MS;
    }
    await this.saveState();
    return state;
  }

  cacheKey(provider, request) {
    const hash = createHash('sha256');
    hash.update(String(provider.id || ''));
    hash.update('\0');
    hash.update(String(provider.model || ''));
    hash.update('\0');
    hash.update(String(request?.contract || ''));
    hash.update('\0');
    hash.update(String(request?.userContext || ''));
    hash.update('\0');
    hash.update(String(request?.imageData || ''));
    return hash.digest('hex');
  }

  async readCache(provider, request) {
    const key = this.cacheKey(provider, request);
    const cachePath = path.join(this.cacheDir, key + '.json');
    if (!(await exists(cachePath))) return null;
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf8'));
      const age = this.now() - Number(cached.createdAtMs || 0);
      if (age < 0 || age > this.cacheTtlMs) return null;
      return { key, cachePath, analysis: cached.analysis };
    } catch {
      return null;
    }
  }

  async writeCache(provider, request, analysis) {
    const key = this.cacheKey(provider, request);
    const cachePath = path.join(this.cacheDir, key + '.json');
    await mkdir(this.cacheDir, { recursive: true });
    await writeFile(cachePath, JSON.stringify({
      schemaVersion: ROUTER_SCHEMA_VERSION,
      createdAtMs: this.now(),
      providerId: provider.id,
      model: provider.model,
      analysis,
    }, null, 2) + '\n', 'utf8');
    return { key, cachePath };
  }

  async analyze(request, {
    preferredProviderId,
    deprioritizeProviderIds = [],
    useCache = true,
    minimumTimeoutMs,
  } = {}) {
    await this.loadState();
    const routeTrace = [];
    const explicitProvider = preferredProviderId || null;

    for (const providerId of this.orderedProviderIds(
      preferredProviderId,
      deprioritizeProviderIds,
    )) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;
      const policy = visualProviderPolicy(provider);
      const state = this.providerState(providerId);

      if (!provider.configured) {
        routeTrace.push({ providerId, status: 'SKIPPED', reason: 'NOT_CONFIGURED' });
        continue;
      }

      const explicitlyRequested = explicitProvider === providerId;
      const automaticAllowed = policy.automaticFallback &&
        (policy.billingClass !== 'paid' || this.allowPaidFallback);
      if (!explicitlyRequested && !automaticAllowed) {
        routeTrace.push({
          providerId,
          status: 'SKIPPED',
          reason: policy.billingClass === 'paid'
            ? 'PAID_FALLBACK_DISABLED'
            : 'AUTOMATIC_FALLBACK_DISABLED',
        });
        continue;
      }

      if (!this.circuitAllows(state)) {
        routeTrace.push({
          providerId,
          status: 'SKIPPED',
          reason: 'CIRCUIT_OPEN',
          healthScore: state.healthScore,
        });
        continue;
      }

      if (useCache) {
        const cached = await this.readCache(provider, request);
        if (cached) {
          routeTrace.push({
            providerId,
            status: 'CACHE_HIT',
            healthScore: state.healthScore,
          });
          return {
            analysis: cached.analysis,
            providerId,
            model: provider.model,
            cacheHit: true,
            healthScore: state.healthScore,
            trustedByDefault: policy.trustedByDefault,
            billingClass: policy.billingClass,
            routeTrace,
          };
        }
      }

      const originalTimeout = provider.timeoutMs;
      if (typeof originalTimeout === 'number' &&
          Number.isFinite(minimumTimeoutMs)) {
        provider.timeoutMs = Math.max(originalTimeout, minimumTimeoutMs);
      }

      try {
        const analysis = await provider.analyze(request);
        const updatedState = await this.recordSuccess(providerId);
        await this.writeCache(provider, request, analysis);
        routeTrace.push({
          providerId,
          status: 'SUCCESS',
          healthScore: updatedState.healthScore,
        });
        return {
          analysis,
          providerId,
          model: provider.model,
          cacheHit: false,
          healthScore: updatedState.healthScore,
          trustedByDefault: policy.trustedByDefault,
          billingClass: policy.billingClass,
          routeTrace,
        };
      } catch (error) {
        const errorCode = String(error?.code || '');
        if (!OPERATIONAL_CODES.has(errorCode)) throw error;
        const updatedState = await this.recordFailure(providerId, errorCode);
        routeTrace.push({
          providerId,
          status: 'FAILED',
          errorCode,
          healthScore: updatedState.healthScore,
          circuit: updatedState.circuit,
        });
      } finally {
        if (typeof originalTimeout === 'number') {
          provider.timeoutMs = originalTimeout;
        }
      }
    }

    await this.saveState();
    throw new AllVisualProvidersFailedError(routeTrace);
  }
}

export function isTransientProviderCode(code) {
  return TRANSIENT_CODES.has(String(code || ''));
}
