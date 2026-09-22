import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Read-only synthetic examples: no .firefly access, providers, generated assets or state writes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false } });
try {
  const { logisticsExample } = await server.ssrLoadModule('/src/core/actions/physical-execution-v2/logistics-fixtures.ts');
  const v2 = await server.ssrLoadModule('/src/core/actions/physical-execution-v2/index.ts');
  const examples = [
    ['light board, visible stock, one worker', {}],
    ['stock not verified in source frame', { observed: false }],
    ['long piece, one worker', { profile: { loadClass: 'LIGHT', sizeClass: 'LONG', heightClass: 'GROUND' } }],
    ['heavy elevated beam, no equipment', { profile: { massKg: 80, lengthM: 4, targetHeightM: 3 } }],
    ['staged beam, two workers and anchored hoist/platform', { workerCount: 2, equipment: true, profile: { massKg: 80, lengthM: 4, targetHeightM: 3 } }],
  ];
  for (const [name, options] of examples) {
    const { world, input } = logisticsExample(options);
    const before = JSON.stringify(world);
    const plan = v2.planPhysicalExecutionV2(input);
    const receipt = v2.simulatePhysicalExecution(world, plan);
    const preflight = receipt.logisticsPreflight;
    if (before !== JSON.stringify(world)) throw new Error('Example mutated input world');
    const artifact = v2.compileProviderNeutralPromptArtifact(plan, receipt);
    const preview = v2.compileLogisticsShadowPrompt(artifact);
    process.stdout.write(JSON.stringify({ name, mode: 'SHADOW', status: preflight.status,
      codes: [...new Set(preflight.issues.map(issue => issue.code))],
      movements: plan.equipmentLogisticsPlan.movements.map(m => ({ resource: m.resourceKey,
        transport: m.transportMethod, placement: m.method, workers: m.requiredWorkers, chain: m.steps.map(s => s.kind) })),
      promptCharacters: preview.characterCount, previewReason: preview.reason,
      commitAvailable: receipt.commitAvailable, officialUnchanged: true }, null, 2) + '\n');
  }
} finally { await server.close(); }
