#!/usr/bin/env node

import { access, copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
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

function promptFor({
  description,
  environment,
  materials,
  operation,
  operationIndex,
  operations,
  start,
  target,
  initialImageName,
}) {
  const completed = operations.slice(0, operationIndex).map(item => item[1]);
  const future = operations.slice(operationIndex + 1).map(item => item[1]);
  const stageVerb = target === 100
    ? 'complete this operation'
    : `advance this operation visibly from ${start}% to exactly ${target}%`;

  return [
    '[OFFICIAL FIREFLY VIDEO JOB]',
    'Create exactly 8 seconds of realistic 16:9 image-to-video construction timelapse.',
    'The supplied source frame is the temporal truth at the beginning of this JOB; never contradict it.',
    `Project intent: ${description.trim()}.`,
    `Environment identity: ${environment}. Stable materials/design vocabulary: ${materials.join(', ')}.`,
    `Initial visual origin: ${initialImageName}. Preserve its compatible terrain, proportions, lighting logic, material identity and environmental landmarks.`,
    `Current physical operation: ${operation[1]}. Visible action: ${operation[2]}.`,
    `During this 8-second clip, ${stageVerb}. The terminal frame must represent the canonical ${target}% state of this operation.`,
    completed.length
      ? `Already completed components must remain present and unchanged: ${completed.join('; ')}.`
      : 'No construction component is considered completed before this operation.',
    future.length
      ? `Do not show or anticipate future construction: ${future.join('; ')}.`
      : 'Do not add any construction beyond the current operation.',
    'Use one continuous physically plausible action. Show material handling and assembly on screen.',
    'Keep the same worker identity and clothing if a worker is visible. Keep camera position, terrain, vegetation and permanent environmental objects continuous.',
    'No magical appearance, morphing, teleportation, disappearing completed work, hidden jumps in progress, camera jump, or unexplained material movement.',
    'The final frame must be stable and usable as the exact source frame of the next JOB.',
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
    'The clip duration is exactly 8 seconds.',
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
  const keyframesRoot = path.join(workspace, 'inputs', 'keyframes');
  const outputsRoot = path.join(workspace, 'outputs');
  const incomingRoot = path.join(workspace, 'incoming');
  await mkdir(jobsRoot, { recursive: true });
  await mkdir(keyframesRoot, { recursive: true });
  await mkdir(outputsRoot, { recursive: true });
  await mkdir(incomingRoot, { recursive: true });

  const keyframeName = 'initial-master' + initial.extension;
  const keyframeAbs = path.join(keyframesRoot, keyframeName);
  await copyFile(initial.absolute, keyframeAbs);

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
        : { kind: 'KEYFRAME', keyframeId: 'initial-image:' + initial.name };

      const sourcePath = previousJob
        ? previousJob.output.lastFrameSlot
        : path.posix.join('inputs', 'keyframes', keyframeName);

      const future = operations.slice(operationIndex + 1).map(item => item[1]);
      const prompt = promptFor({
        description,
        environment,
        materials,
        operation,
        operationIndex,
        operations,
        start,
        target,
        initialImageName: initial.name,
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
        segmentId: `${operation[0]}:${start}-${target}`,
        segmentIndex: segmentIndex + 1,
        startStagePercentage: start,
        targetStagePercentage: target,
        model: 'FIREFLY',
        durationSeconds: 8,
        aspectRatio: '16:9',
        resolution: { width: 1920, height: 1080 },
        source,
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
      });
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
        model: 'FIREFLY',
        startStagePercentage: start,
        targetStagePercentage: target,
        durationSeconds: 8,
        jobDirectory,
        sourcePath,
        videoOutput: videoSlot,
        lastFrameOutput: lastFrameSlot,
      });

      previousJob = job;
    }
  }

  const manifest = {
    schemaVersion: 'construction-ai-firefly-manual/1.0',
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
      workspacePath: path.posix.join('inputs', 'keyframes', keyframeName),
      temporalRole: 'INITIAL_VISUAL_ORIGIN',
    },
    videoPolicy: {
      provider: 'ADOBE_FIREFLY_MANUAL',
      durationSeconds: 8,
      oneActiveJobAtATime: true,
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
    durationSecondsPerJob: 8,
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
    totalDurationSeconds: jobs.length * 8,
    firstJob: jobs[0],
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

if (import.meta.url === new URL('file://' + process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  });
}
