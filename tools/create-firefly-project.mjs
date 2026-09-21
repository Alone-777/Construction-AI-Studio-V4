#!/usr/bin/env node

import { access, copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  MANUAL_KLING_PROMPT_MAX_CHARS,
  buildManualExecutionRecipe,
  compileManualKlingPrompt,
} from './manual-video-execution.mjs';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const ANIMATION_PROMPT_MAX_CHARS = MANUAL_KLING_PROMPT_MAX_CHARS;
const STAGES = [
  [0, 25],
  [25, 50],
  [50, 75],
  [75, 100],
];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slug(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72) || 'projeto';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error('Argumento inválido: ' + key);
    const name = key.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('Valor ausente para --' + name);
    }
    out[name] = value;
    index += 1;
  }
  return out;
}

function inferConstruction(description) {
  const text = normalize(description);
  const matchers = [
    ['casa_arvore', ['casa na arvore', 'casa de arvore']],
    ['piscina_natural', ['piscina natural', 'lago artificial']],
    ['casa_elevada', ['casa elevada', 'palafita']],
    ['casa_pedra', ['casa de pedra']],
    ['casa_barro', ['casa de barro', 'taipa']],
    ['casa_madeira', ['casa de madeira']],
    ['casa_rustica', ['casa rustica']],
    ['plataforma', ['plataforma', 'deck']],
    ['ponte', ['ponte', 'passarela']],
    ['torre', ['torre', 'mirante']],
    ['sauna', ['sauna']],
    ['galpao', ['galpao', 'celeiro']],
    ['cabana', ['cabana', 'chale']],
    ['abrigo', ['abrigo', 'refugio']],
  ];
  return matchers.find(([, terms]) => terms.some(term => text.includes(normalize(term))))?.[0]
    ?? 'construcao_personalizada';
}

function inferEnvironment(description) {
  const text = normalize(description);
  const matchers = [
    ['riacho', ['riacho', 'corrego']],
    ['margem_rio', ['margem do rio', 'beira do rio']],
    ['pinheiros', ['pinheiro', 'pinheiros']],
    ['montanha', ['montanha', 'montanhoso']],
    ['area_rochosa', ['rochoso', 'rochas', 'pedregoso']],
    ['terreno_inclinado', ['inclinado', 'encosta', 'declive']],
    ['vale', ['vale']],
    ['clareira', ['clareira']],
    ['floresta_umida', ['floresta umida', 'mata umida']],
    ['floresta_temperada', ['floresta temperada']],
    ['floresta', ['floresta', 'mata', 'selva']],
  ];
  return matchers.find(([, terms]) => terms.some(term => text.includes(normalize(term))))?.[0]
    ?? 'ambiente_personalizado';
}

function inferMaterials(description, construction) {
  const text = normalize(description);
  const aliases = {
    madeira: ['madeira', 'tabua'],
    troncos: ['tronco', 'troncos', 'toras'],
    bambu: ['bambu'],
    pedra: ['pedra', 'pedras', 'rocha'],
    argila: ['argila'],
    terra: ['terra'],
    barro: ['barro', 'taipa'],
    palha: ['palha', 'sape'],
    fibras: ['fibra', 'fibras'],
    cascalho: ['cascalho'],
  };
  const detected = Object.entries(aliases)
    .filter(([, terms]) => terms.some(term => text.includes(normalize(term))))
    .map(([material]) => material);
  if (detected.length) return detected;
  if (construction === 'piscina_natural') return ['pedra', 'argila', 'cascalho'];
  if (construction === 'casa_pedra' || construction === 'sauna') return ['pedra', 'madeira'];
  if (construction === 'casa_barro') return ['barro', 'madeira', 'palha'];
  return ['madeira', 'pedra', 'palha'];
}

function operationPlan(construction) {
  if (construction === 'ponte') {
    return [
      ['preparacao', 'Preparação seletiva do local', 'delimitar a implantação e remover somente obstáculos autorizados'],
      ['apoios', 'Execução dos apoios', 'escavar e consolidar os apoios estruturais'],
      ['vigas', 'Montagem das vigas longitudinais', 'posicionar, alinhar e travar as vigas entre os apoios'],
      ['tabuleiro', 'Montagem do tabuleiro', 'fixar sequencialmente os módulos do tabuleiro'],
      ['guarda_corpo', 'Instalação do guarda-corpo', 'fixar montantes e travessas de proteção'],
    ];
  }

  if (construction === 'piscina_natural') {
    return [
      ['preparacao', 'Preparação seletiva do local', 'delimitar a implantação e remover somente obstáculos autorizados'],
      ['escavacao', 'Escavação controlada', 'escavar o volume por setores e manter o solo fisicamente rastreável'],
      ['base', 'Regularização da base', 'regularizar e compactar a base progressivamente'],
      ['contencao', 'Construção da contenção', 'assentar a contenção por trechos visíveis'],
      ['acabamento', 'Aplicação do acabamento', 'aplicar a camada final de forma progressiva'],
    ];
  }

  if (construction === 'torre') {
    return [
      ['preparacao', 'Preparação seletiva do local', 'delimitar a implantação e remover somente obstáculos autorizados'],
      ['fundacao', 'Execução das fundações', 'escavar e consolidar cada fundação'],
      ['pilares', 'Elevação dos pilares', 'elevar, aprumar, escorar e fixar os pilares'],
      ['travamento', 'Montagem dos travamentos', 'fixar travessas e contraventamentos'],
      ['plataforma', 'Montagem da plataforma superior', 'montar e fixar a plataforma superior'],
      ['acesso', 'Instalação do acesso', 'instalar e conferir a escada ou acesso'],
    ];
  }

  return [
    ['preparacao', 'Preparação seletiva do local', 'delimitar a implantação e remover somente obstáculos autorizados'],
    ['fundacao', 'Execução das fundações', 'escavar e assentar progressivamente as fundações'],
    ['base', 'Montagem da base e piso', 'montar e fixar progressivamente a base e o piso'],
    ['pilares', 'Elevação dos pilares', 'posicionar, aprumar e fixar progressivamente os pilares'],
    ['paredes', 'Fechamento das paredes', 'montar progressivamente os trechos de parede sobre a estrutura existente'],
    ['vigas', 'Estrutura da cobertura', 'cortar, elevar e encaixar progressivamente as vigas de cobertura'],
    ['cobertura', 'Aplicação da cobertura', 'fixar progressivamente a cobertura à estrutura'],
    ['acesso', 'Instalação do acesso principal', 'alinhar, encaixar e testar o acesso principal'],
  ];
}

function countPromptChars(value) {
  return Array.from(String(value ?? '')).length;
}

function compactField(value, maxChars) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  const sliced = chars.slice(0, Math.max(1, maxChars - 1)).join('');
  const clean = sliced.replace(/\s+\S*$/, '').trimEnd();
  return (clean || sliced.trimEnd()) + '…';
}

function compactList(values, maxItems = 6, itemChars = 48) {
  const items = unique(values)
    .map(value => compactField(value, itemChars))
    .filter(Boolean);
  if (!items.length) return '';
  const shown = items.slice(0, maxItems);
  const extra = items.length - shown.length;
  return shown.join(', ') + (extra > 0 ? ' +' + extra + ' more' : '');
}

function assertAnimationPromptLimit(prompt) {
  const count = countPromptChars(prompt);
  if (count > ANIMATION_PROMPT_MAX_CHARS) {
    throw new Error(
      'Animation prompt exceeds hard limit: ' + count +
      '/' + ANIMATION_PROMPT_MAX_CHARS + ' characters.',
    );
  }
  return prompt;
}

function promptFor({
  environment,
  operation,
  operationIndex,
  operations,
  start,
  target,
  executionRecipe,
}) {
  const completed = operations.slice(0, operationIndex).map(item => item[1]);
  const future = operations.slice(operationIndex + 1).map(item => item[1]);

  return compileManualKlingPrompt({
    operationName: operation[1],
    physicalAction: operation[2],
    executionRecipe,
    startStagePercentage: start,
    targetStagePercentage: target,
    durationSeconds: 15,
    aspectRatio: '16:9',
    model: 'KLING_3_0',
    environment,
    completedOperations: completed,
    forbiddenFutureElements: future,
  }).prompt;
}

function sourceImagePromptFor({
  description,
  environment,
  materials,
  initialImageName,
  firstOperation,
}) {
  return [
    '[OFFICIAL SOURCE IMAGE PREPARATION]',
    'Create a photorealistic 16:9 still image for the canonical START state of JOB 1.',
    `Project intent: ${description.trim()}.`,
    `Use ${initialImageName} strictly as MANUAL_REFERENCE for compatible design identity, proportions, materials, terrain, vegetation, environmental landmarks and lighting logic.`,
    'The MANUAL_REFERENCE is not temporal authority. Do not copy any construction component that belongs to a future state.',
    `Environment identity: ${environment}. Material/design vocabulary: ${materials.join(', ')}.`,
    `The upcoming first physical operation is: ${firstOperation[1]} — ${firstOperation[2]}.`,
    'This image must represent the moment immediately BEFORE that operation starts.',
    'Show the preserved site, terrain and environment consistently, but no completed construction, no foundations, no floor, no pillars, no walls, no roof and no future components unless they are explicitly part of the true preconstruction environment.',
    'Keep one stable wide camera position suitable for the entire timelapse.',
    'If a worker is visible, keep a single consistent worker identity and clothing ready to begin work.',
    'No magical objects, no premature construction, no temporal contradiction.',
    'The result becomes OFFICIAL temporal source for JOB 1 only after it is reviewed/accepted.',
  ].join(' ');
}

function negativeConstraints(future) {
  return [
    'no magical construction',
    'no morphing construction',
    'no teleportation of worker, tools or materials',
    'no disappearing completed components',
    'no unexplained terrain change',
    'no camera jump',
    'no hidden skip in construction progress',
    ...future.map(name => 'no premature ' + name),
  ];
}

function checklist({ operationName, start, target, future }) {
  return [
    'The clip duration is exactly 15 seconds.',
    `The source starts at the canonical ${start}% state for ${operationName}.`,
    `The terminal frame reaches the canonical ${target}% state for ${operationName}.`,
    'Worker identity, clothing, camera, terrain and environmental landmarks remain continuous.',
    'All previously completed construction remains present.',
    'Physical progress is visible rather than appearing magically.',
    ...future.map(name => `Future component remains absent: ${name}.`),
    'The terminal frame is stable enough to become the next JOB source.',
  ];
}

function jobDirName(sequence, jobId) {
  return String(sequence).padStart(3, '0') + '__' + slug(jobId);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function findInitialImage(projectRoot) {
  const root = path.join(projectRoot, 'Imagem Inicial');
  const entries = await readdir(root, { withFileTypes: true });
  const images = entries
    .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  if (!images.length) throw new Error('Nenhuma Imagem Inicial encontrada.');
  if (images.length > 1) {
    throw new Error('Há mais de uma Imagem Inicial. Deixe somente uma imagem antes de criar o projeto.');
  }

  return {
    root,
    name: images[0],
    absolute: path.join(root, images[0]),
    extension: path.extname(images[0]).toLowerCase(),
  };
}

export async function createFireflyProject({
  projectRoot,
  description,
  name,
  createdAt = new Date(),
}) {
  if (!projectRoot) throw new Error('projectRoot é obrigatório.');
  if (!String(description || '').trim()) throw new Error('description é obrigatória.');

  const resolvedRoot = path.resolve(projectRoot);
  const initial = await findInitialImage(resolvedRoot);
  const construction = inferConstruction(description);
  const environment = inferEnvironment(description);
  const materials = inferMaterials(description, construction);
  const operations = operationPlan(construction);
  const stamp = createdAt.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const title = String(name || '').trim() || `${construction.replaceAll('_', ' ')} — ${environment.replaceAll('_', ' ')}`;
  const projectId = `${slug(title)}_${stamp}`;
  const workspace = path.join(resolvedRoot, '.firefly', projectId);

  if (await exists(workspace)) throw new Error('Workspace já existe: ' + projectId);

  const jobsRoot = path.join(workspace, 'jobs');
  const referencesRoot = path.join(workspace, 'references');
  const officialInputsRoot = path.join(workspace, 'inputs', 'official');
  const outputsRoot = path.join(workspace, 'outputs');
  const incomingRoot = path.join(workspace, 'incoming');
  await mkdir(jobsRoot, { recursive: true });
  await mkdir(referencesRoot, { recursive: true });
  await mkdir(officialInputsRoot, { recursive: true });
  await mkdir(outputsRoot, { recursive: true });
  await mkdir(incomingRoot, { recursive: true });

  const referenceName = 'initial-master' + initial.extension;
  const referenceAbs = path.join(referencesRoot, referenceName);
  await copyFile(initial.absolute, referenceAbs);
  const referencePath = path.posix.join('references', referenceName);
  const firstOfficialSourcePath = path.posix.join('inputs', 'official', 'job-001-source.png');
  const firstSourceImagePrompt = sourceImagePromptFor({
    description,
    environment,
    materials,
    initialImageName: initial.name,
    firstOperation: operations[0],
  });

  const jobs = [];
  let previousJob = null;
  let sequence = 0;

  for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
    const operation = operations[operationIndex];
    for (let segmentIndex = 0; segmentIndex < STAGES.length; segmentIndex += 1) {
      const [start, target] = STAGES[segmentIndex];
      sequence += 1;
      const jobId = `firefly:${projectId}:${operation[0]}:${start}-${target}`;
      const jobDirectory = path.join('jobs', jobDirName(sequence, jobId));
      const jobDir = path.join(workspace, jobDirectory);
      await mkdir(jobDir, { recursive: true });

      const source = previousJob
        ? { kind: 'PREVIOUS_JOB_LAST_FRAME', previousJobId: previousJob.id }
        : {
            kind: 'KEYFRAME',
            keyframeId: 'official-source:job-001',
            referenceKind: 'MANUAL_REFERENCE',
            referencePath,
          };

      const sourcePath = previousJob
        ? previousJob.output.lastFrameSlot
        : firstOfficialSourcePath;

      const future = operations.slice(operationIndex + 1).map(item => item[1]);
      const executionRecipe = buildManualExecutionRecipe({
        operationType: operation[0],
        operationName: operation[1],
        physicalAction: operation[2],
        startStagePercentage: start,
        targetStagePercentage: target,
      });
      const prompt = promptFor({
        environment,
        operation,
        operationIndex,
        operations,
        start,
        target,
        executionRecipe,
      });

      const videoSlot = path.posix.join('outputs', String(sequence).padStart(3, '0') + '.mp4');
      const lastFrameSlot = path.posix.join('outputs', String(sequence).padStart(3, '0') + '.last-frame.png');

      const job = {
        id: jobId,
        projectId,
        projectName: title,
        sceneId: `scene:${operation[0]}`,
        sceneNumber: operationIndex + 1,
        operationType: operation[0],
        operationName: operation[1],
        physicalAction: operation[2],
        executionRecipe,
        segmentId: `${operation[0]}:${start}-${target}`,
        segmentIndex: segmentIndex + 1,
        startStagePercentage: start,
        targetStagePercentage: target,
        model: 'KLING_3_0',
        durationSeconds: 15,
        aspectRatio: '16:9',
        resolution: { width: 1920, height: 1080 },
        source,
        sourceImagePrompt: sequence === 1 ? firstSourceImagePrompt : null,
        initialReferencePath: referencePath,
        terminalRequirement: target === 100 ? 'SCENE_EXIT' : 'INTERMEDIATE_CONTINUATION',
        prompt,
        negativeConstraints: negativeConstraints(future),
        continuityLocks: {
          preserveWorkerIdentity: true,
          preserveCamera: true,
          preserveTerrain: true,
          preserveEnvironment: environment,
          preserveCompletedOperations: operations.slice(0, operationIndex).map(item => item[0]),
          forbiddenFutureElements: future,
        },
        acceptanceChecklist: checklist({
          operationName: operation[1],
          start,
          target,
          future,
        }),
        output: {
          videoSlot,
          lastFrameSlot,
        },
        status: 'READY',
      };

      const sourceAbsolute = path.join(workspace, sourcePath);
      await writeJson(path.join(jobDir, 'job.json'), job);
      await writeJson(path.join(jobDir, 'source.json'), {
        ...source,
        resolvedPath: sourcePath,
        absolutePath: sourceAbsolute,
        initialReferencePath: referencePath,
        sourceReady: await exists(sourceAbsolute),
      });
      if (sequence === 1) {
        await writeFile(
          path.join(jobDir, 'source-image-prompt.txt'),
          firstSourceImagePrompt + '\n',
          'utf8',
        );
      }
      await writeJson(path.join(jobDir, 'state.json'), {
        jobId,
        status: 'PENDING',
        attempts: 0,
        completedAt: null,
        lastReview: null,
        notes: [],
      });
      await writeFile(path.join(jobDir, 'prompt.txt'), prompt + '\n', 'utf8');
      await writeFile(
        path.join(jobDir, 'negative.txt'),
        job.negativeConstraints.join('\n') + '\n',
        'utf8',
      );
      await writeFile(
        path.join(jobDir, 'checklist.txt'),
        job.acceptanceChecklist.map(item => '- [ ] ' + item).join('\n') + '\n',
        'utf8',
      );

      jobs.push({
        sequence,
        jobId,
        sceneId: job.sceneId,
        model: 'KLING_3_0',
        startStagePercentage: start,
        targetStagePercentage: target,
        durationSeconds: 15,
        jobDirectory,
        sourcePath,
        videoOutput: videoSlot,
        lastFrameOutput: lastFrameSlot,
      });

      previousJob = job;
    }
  }

  const manifest = {
    schemaVersion: 'construction-ai-manual-video/1.2',
    projectId,
    projectName: title,
    createdAt: createdAt.toISOString(),
    description: String(description).trim(),
    construction,
    environment,
    materials,
    initialImage: {
      name: initial.name,
      sourcePath: path.relative(resolvedRoot, initial.absolute).split(path.sep).join('/'),
      workspacePath: referencePath,
      temporalRole: 'MANUAL_REFERENCE',
      temporalAuthority: false,
    },
    videoPolicy: {
      provider: 'KLING_3_0_MANUAL',
      model: 'Kling 3.0',
      durationSeconds: 15,
      oneActiveJobAtATime: true,
    },
    executionPolicy: {
      schema: 'construction-manual-execution-recipe/1',
      requireExplicitTools: true,
      requireActorAction: true,
      requireVisibleTransformation: true,
      requireTerminalEvidence: true,
      rejectPantomimeWithoutPhysicalChange: true,
    },
    operations: operations.map(([id, operationName, physicalAction], index) => ({
      sequence: index + 1,
      id,
      name: operationName,
      physicalAction,
    })),
  };

  await writeJson(path.join(workspace, 'manifest.json'), manifest);
  await writeJson(path.join(workspace, 'queue.json'), {
    projectId,
    projectName: title,
    totalJobs: jobs.length,
    durationSecondsPerJob: 15,
    jobs,
  });

  const initialInfo = await stat(initial.absolute);

  return {
    ok: true,
    projectId,
    projectName: title,
    workspace: path.relative(resolvedRoot, workspace).split(path.sep).join('/'),
    workspaceName: projectId,
    totalJobs: jobs.length,
    totalDurationSeconds: jobs.length * 15,
    firstJob: {
      ...jobs[0],
      sourceReady: false,
      sourceImagePrompt: firstSourceImagePrompt,
      expectedOfficialSource: firstOfficialSourcePath,
    },
    initialImage: {
      name: initial.name,
      size: initialInfo.size,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await createFireflyProject({
    projectRoot: args['project-root'],
    description: args.description,
    name: args.name,
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  });
}
