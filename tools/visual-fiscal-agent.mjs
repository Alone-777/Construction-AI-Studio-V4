#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessFiscalRound,
  combineFiscalRounds,
  reviewRequiredDecision,
} from '../server/visual-fiscal-agent/decision.mjs';
import { buildVisualFiscalContext } from '../server/visual-fiscal-agent/prompt.mjs';
import {
  FiscalProviderRouter,
  providerPriorityFromEnv,
} from '../server/visual-fiscal-agent/provider-router.mjs';
import {
  createFiscalProviders,
  describeFiscalProviders,
} from '../server/visual-fiscal-agent/providers.mjs';

const SHA256_RE = /^[a-f0-9]{64}$/;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error('Invalid argument: ' + key);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error('Missing value for ' + key);
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

function mimeTypeFor(filePath, bytes) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (['.jpg', '.jpeg'].includes(extension) && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (extension === '.webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  throw new Error('Contact sheet format or binary signature is unsupported.');
}

function normalizeContext(raw, contactSheetSha256) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Fiscal context must be a JSON object.');
  }
  const job = raw.job;
  if (!job || typeof job !== 'object' || Array.isArray(job)) {
    throw new Error('Fiscal context is missing job.');
  }
  const jobId = String(raw.jobId ?? job.id ?? '').trim();
  const attempt = Number(raw.attempt);
  const target = Number(job.targetStagePercentage);
  if (!jobId || jobId.length > 256) throw new Error('Fiscal context has invalid jobId.');
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 999) {
    throw new Error('Fiscal context has invalid attempt.');
  }
  if (!Number.isFinite(target) || target < 0 || target > 100) {
    throw new Error('Fiscal context has invalid targetStagePercentage.');
  }
  const expected = String(raw.contactSheetSha256 ?? '').toLowerCase();
  if (expected && (!SHA256_RE.test(expected) || expected !== contactSheetSha256)) {
    return {
      stale: true,
      context: { ...raw, jobId, attempt, contactSheetSha256 },
    };
  }
  return {
    stale: false,
    context: { ...raw, jobId, attempt, contactSheetSha256 },
  };
}

function providerMetadata(result) {
  return {
    providerId: result.providerId,
    model: result.model,
    cacheHit: result.cacheHit,
    routeTrace: result.routeTrace,
  };
}

export async function runVisualFiscalAgent({
  contactSheetPath,
  context,
  stateDir,
  preferredProviderId = null,
  env = process.env,
  providers = null,
  router = null,
}) {
  const absoluteContactSheet = path.resolve(contactSheetPath);
  const bytes = await readFile(absoluteContactSheet);
  if (bytes.length < 64 || bytes.length > 20 * 1024 * 1024) {
    throw new Error('Contact sheet must be between 64 bytes and 20 MB.');
  }
  const mimeType = mimeTypeFor(absoluteContactSheet, bytes);
  const contactSheetSha256 = createHash('sha256').update(bytes).digest('hex');
  const normalized = normalizeContext(context, contactSheetSha256);
  if (normalized.stale) {
    return reviewRequiredDecision(normalized.context, 'CONTACT_SHEET_IDENTITY_MISMATCH', {
      errorCode: 'STALE_REVIEW_EVIDENCE',
    });
  }

  const liveContext = normalized.context;
  const activeProviders = providers ?? createFiscalProviders(env);
  if (!activeProviders.some(provider => provider.configured)) {
    return {
      ...reviewRequiredDecision(liveContext, 'VISUAL_FISCAL_PROVIDER_NOT_CONFIGURED', {
        errorCode: 'PROVIDER_UNAVAILABLE',
      }),
      providers: describeFiscalProviders(env),
    };
  }

  const fiscalRouter = router ?? new FiscalProviderRouter({
    providers: activeProviders,
    stateDir,
    priority: providerPriorityFromEnv(env),
    allowPaidFallback: String(env.VISUAL_FISCAL_ALLOW_PAID_FALLBACK || '').toLowerCase() === 'true',
  });
  const imageData = `data:${mimeType};base64,${bytes.toString('base64')}`;

  let primary;
  try {
    primary = await fiscalRouter.analyze({
      imageData,
      mimeType,
      context: buildVisualFiscalContext(liveContext, 'PRIMARY'),
    }, { preferredProviderId });
  } catch (error) {
    return reviewRequiredDecision(liveContext, 'VISUAL_FISCAL_PRIMARY_UNAVAILABLE', {
      errorCode: error?.code ?? 'VISUAL_FISCAL_ERROR',
      providerRoute: error?.routeTrace ?? [],
    });
  }

  let verification;
  try {
    verification = await fiscalRouter.analyze({
      imageData,
      mimeType,
      context: buildVisualFiscalContext(liveContext, 'VERIFICATION'),
    }, {
      preferredProviderId,
      deprioritizeProviderIds: [primary.providerId],
    });
  } catch (error) {
    return {
      ...reviewRequiredDecision(liveContext, 'VISUAL_FISCAL_VERIFICATION_UNAVAILABLE', {
        errorCode: error?.code ?? 'VISUAL_FISCAL_ERROR',
        providerRoute: error?.routeTrace ?? [],
      }),
      primaryProvider: providerMetadata(primary),
    };
  }

  const primaryAssessment = assessFiscalRound(liveContext, primary.analysis);
  const verificationAssessment = assessFiscalRound(liveContext, verification.analysis);
  return {
    ...combineFiscalRounds(liveContext, primaryAssessment, verificationAssessment),
    primaryProvider: providerMetadata(primary),
    verificationProvider: providerMetadata(verification),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let context;
  try {
    context = JSON.parse(args['context-json']);
  } catch {
    throw new Error('--context-json must contain valid JSON.');
  }
  const result = await runVisualFiscalAgent({
    contactSheetPath: args['contact-sheet'],
    context,
    stateDir: args['state-dir'],
    preferredProviderId: args['preferred-provider'] || null,
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  });
}
