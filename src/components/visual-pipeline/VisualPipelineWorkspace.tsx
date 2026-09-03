import { useMemo, useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { useVisualPipelineStore } from '../../store/useVisualPipelineStore';
import type { VisualPipelineRun } from '../../core/visual-pipeline';
import {
  createVisualPipelineStartDraft,
  imageAssetFromFile,
  isLocalPreviewUri,
  pipelineSteps,
  requiredActionLabel,
  videoAssetFromFile,
  visualPipelineKey,
  type ImageEvidenceAnswers,
  type ReviewAnswer,
  type VideoEvidenceAnswers,
} from './presentation';

const INITIAL_IMAGE_EVIDENCE: ImageEvidenceAnswers = {
  construction: 'MATCH',
  character: 'MATCH',
  clothing: 'MATCH',
  environment: 'MATCH',
  futureElementPresent: false,
  missingRequiredElement: false,
  notes: '',
};

const INITIAL_VIDEO_EVIDENCE: VideoEvidenceAnswers = {
  actionCorrect: true,
  character: 'MATCH',
  clothing: 'MATCH',
  construction: 'MATCH',
  camera: 'MATCH',
  environment: 'MATCH',
  futureActionPresent: false,
  notes: '',
};

export function VisualPipelineWorkspace() {
  const project = useProjectStore(state => state.project);
  const selectedSceneId = useUIStore(state => state.selectedSceneId);
  const selectedStagePercentage = useUIStore(state => state.selectedStagePercentage);
  const selectScene = useUIStore(state => state.selectScene);
  const selectStage = useUIStore(state => state.selectStage);
  const pipeline = useVisualPipelineStore();
  const [localError, setLocalError] = useState('');

  const scene = project?.scenes.find(candidate => candidate.id === selectedSceneId)
    ?? project?.scenes[0];
  const stage = scene?.stages.find(candidate => candidate.percentage === selectedStagePercentage)
    ?? scene?.stages[0];
  const key = project && scene && stage
    ? visualPipelineKey(project.id, scene.id, String(stage.percentage))
    : '';
  const run = key ? pipeline.runs[key] : undefined;
  const busy = key ? !!pipeline.busy[key] : false;
  const error = localError || (key ? pipeline.errors[key] : undefined);

  const start = () => {
    if (!project || !scene || !stage) return;
    try {
      setLocalError('');
      pipeline.start(key, createVisualPipelineStartDraft(project, scene, stage));
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Não foi possível iniciar o pipeline visual.');
    }
  };

  const nextStage = useMemo(() => {
    if (!project || !scene || !stage) return undefined;
    const flattened = project.scenes.flatMap(candidateScene =>
      candidateScene.stages.map(candidateStage => ({ scene: candidateScene, stage: candidateStage })),
    );
    const currentIndex = flattened.findIndex(item =>
      item.scene.id === scene.id && item.stage.percentage === stage.percentage,
    );
    return currentIndex >= 0 ? flattened[currentIndex + 1] : undefined;
  }, [project, scene, stage]);

  if (!project || !scene || !stage) {
    return <EmptyState message="Selecione um projeto, uma cena e uma etapa para abrir o pipeline visual." />;
  }

  return (
    <div className="min-h-full space-y-3 p-2 md:p-3">
      <header className="panel p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-studio-cyan">Visual Pipeline</div>
            <h2 className="text-base font-semibold text-studio-text">{project.name}</h2>
            <p className="text-xs text-studio-muted">
              Cena {scene.number} · Etapa {stage.percentage}% · {stage.physicalAction}
            </p>
          </div>
          <span className={`badge ${run?.currentPhase === 'COMPLETED' ? 'badge-success' : 'badge-info'}`}>
            {run ? humanPhase(run.currentPhase) : 'Não iniciado'}
          </span>
        </div>
      </header>

      {run && <PipelineStepper run={run} />}

      {error && (
        <div role="alert" className="rounded border border-rose-500/50 bg-rose-500/10 p-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      {!run ? (
        <section className="panel p-5 text-center">
          <h3 className="font-semibold">Pipeline visual desta etapa</h3>
          <p className="mx-auto mt-2 max-w-xl text-xs text-studio-muted">
            A interface usará a ação física e o snapshot oficial já aprovados. Geração, validação e aprovação continuam sendo passos separados.
          </p>
          <button type="button" onClick={start} className="btn-primary mt-4">
            Iniciar pipeline visual
          </button>
        </section>
      ) : (
        <PipelinePhase
          run={run}
          busy={busy}
          onLocalError={setLocalError}
          actions={{
            generateImage: () => pipeline.generateImage(key),
            submitImage: asset => pipeline.submitImage(key, asset),
            validateImage: evidence => pipeline.validateImage(key, evidence),
            acknowledgeImageWarning: () => pipeline.acknowledgeImageWarning(key),
            retryImage: () => pipeline.retryImage(key),
            approveImage: () => pipeline.approveImage(key),
            prepareVideo: () => pipeline.prepareVideo(key),
            generateVideo: () => pipeline.generateVideo(key),
            submitVideo: asset => pipeline.submitVideo(key, asset),
            validateVideo: evidence => pipeline.validateVideo(key, evidence),
            acknowledgeVideoWarning: () => pipeline.acknowledgeVideoWarning(key),
            retryVideo: () => pipeline.retryVideo(key),
            acceptVideo: () => pipeline.acceptVideo(key),
          }}
        />
      )}

      {run?.currentPhase === 'COMPLETED' && nextStage && (
        <button type="button" className="btn-secondary" onClick={() => {
          selectScene(nextStage.scene.id);
          selectStage(nextStage.stage.percentage);
        }}>
          Próxima etapa
        </button>
      )}
    </div>
  );
}

interface PipelineActions {
  generateImage: () => Promise<void>;
  submitImage: (asset: ReturnType<typeof imageAssetFromFile>) => void;
  validateImage: (evidence: ImageEvidenceAnswers) => Promise<void>;
  acknowledgeImageWarning: () => void;
  retryImage: () => void;
  approveImage: () => void;
  prepareVideo: () => void;
  generateVideo: () => Promise<void>;
  submitVideo: (asset: ReturnType<typeof videoAssetFromFile>) => void;
  validateVideo: (evidence: VideoEvidenceAnswers) => Promise<void>;
  acknowledgeVideoWarning: () => void;
  retryVideo: () => void;
  acceptVideo: () => void;
}

function PipelinePhase({
  run,
  busy,
  actions,
  onLocalError,
}: {
  run: VisualPipelineRun;
  busy: boolean;
  actions: PipelineActions;
  onLocalError: (message: string) => void;
}) {
  const cta = requiredActionLabel(run);
  const imageAsset = run.imageState.result?.status === 'SUCCESS' ? run.imageState.result.asset : undefined;
  const videoAsset = run.videoState?.result?.status === 'SUCCESS' ? run.videoState.result.asset : undefined;

  switch (run.currentPhase) {
    case 'IMAGE_REQUEST_READY':
      return (
        <GenerationPanel title="Preparar imagem" prompt={run.imageState.request.prompt}
          aspectRatio={run.imageState.request.aspectRatio} resolution={run.imageState.request.resolution}
          referenceUri={run.imageState.previousOfficialReference?.asset.uri}
          correctionChange={run.imageState.correctionPlan?.correctionInstructions}
          correctionPreserve={run.imageState.correctionPlan?.preserveConstraints}
          cta={cta ?? 'Gerar imagem'} busy={busy} onAction={actions.generateImage} />
      );
    case 'IMAGE_MANUAL_ACTION_REQUIRED':
      return (
        <GenerationPanel title="Geração manual de imagem" prompt={run.imageState.request.prompt}
          aspectRatio={run.imageState.request.aspectRatio} resolution={run.imageState.request.resolution}
          referenceUri={run.imageState.previousOfficialReference?.asset.uri}
          status="Aguardando imagem gerada" hideAction>
          <FileSubmission kind="image" cta={cta ?? 'Enviar imagem gerada'} onError={onLocalError}
            onSubmit={actions.submitImage} />
        </GenerationPanel>
      );
    case 'IMAGE_VALIDATION_REQUIRED':
      return (
        <section className="panel p-4 space-y-3">
          <SectionHeading title="Validar imagem" subtitle="Registre somente o que você observou na imagem enviada." />
          <AssetPreview uri={imageAsset?.uri} kind="image" />
          <ImageEvidenceForm busy={busy} onSubmit={actions.validateImage} />
        </section>
      );
    case 'IMAGE_CORRECTION_REQUIRED':
      return (
        <CorrectionPanel title="Correção necessária" run={run} kind="image"
          cta={cta ?? 'Corrigir e tentar novamente'} onAction={actions.retryImage} />
      );
    case 'IMAGE_APPROVAL_REQUIRED':
      return (
        <ValidationPanel run={run} kind="image">
          {run.imageState.validation?.verdict === 'WARN' && !run.imageState.warningAcknowledged ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={actions.acknowledgeImageWarning}>Reconhecer aviso</button>
              <button type="button" className="btn-secondary" onClick={actions.retryImage}>Preparar nova tentativa</button>
            </div>
          ) : (
            <button type="button" className="btn-primary" onClick={actions.approveImage}>Aprovar imagem</button>
          )}
        </ValidationPanel>
      );
    case 'IMAGE_APPROVED':
      return (
        <section className="panel p-4 space-y-3">
          <SectionHeading title="Imagem oficial desta etapa" subtitle="A aprovação explícita foi registrada na memória visual." />
          <AssetPreview uri={run.imageState.officialReference?.asset.uri} kind="image" />
          <button type="button" className="btn-primary" onClick={actions.prepareVideo}>{cta ?? 'Preparar vídeo'}</button>
        </section>
      );
    case 'VIDEO_REQUEST_READY':
      return (
        <GenerationPanel title="Preparar vídeo" prompt={run.videoState?.request.renderedPrompt ?? ''}
          aspectRatio={run.videoState?.request.aspectRatio} resolution={run.videoState?.request.resolution}
          duration={run.videoState?.request.durationSeconds}
          referenceUri={run.imageState.officialReference?.asset.uri}
          correctionChange={run.videoState?.correctionPlan?.changeInstructions}
          correctionPreserve={run.videoState?.correctionPlan?.preserveInstructions}
          cta={cta ?? 'Gerar vídeo'} busy={busy} onAction={actions.generateVideo} />
      );
    case 'VIDEO_MANUAL_ACTION_REQUIRED':
      return (
        <GenerationPanel title="Geração manual de vídeo" prompt={run.videoState?.request.renderedPrompt ?? ''}
          aspectRatio={run.videoState?.request.aspectRatio} resolution={run.videoState?.request.resolution}
          duration={run.videoState?.request.durationSeconds}
          referenceUri={run.imageState.officialReference?.asset.uri}
          status="Aguardando vídeo gerado" hideAction>
          <FileSubmission kind="video" cta={cta ?? 'Enviar vídeo gerado'} onError={onLocalError}
            onSubmit={actions.submitVideo} />
        </GenerationPanel>
      );
    case 'VIDEO_VALIDATION_REQUIRED':
      return (
        <section className="panel p-4 space-y-3">
          <SectionHeading title="Validar vídeo" subtitle="O aplicativo não assiste ao vídeo: registre suas observações." />
          <AssetPreview uri={videoAsset?.uri} kind="video" />
          <VideoEvidenceForm busy={busy} onSubmit={actions.validateVideo} />
        </section>
      );
    case 'VIDEO_CORRECTION_REQUIRED':
      return (
        <CorrectionPanel title="Correção de vídeo necessária" run={run} kind="video"
          cta={cta ?? 'Tentar vídeo novamente'} onAction={actions.retryVideo} />
      );
    case 'VIDEO_ACCEPTANCE_REQUIRED':
      return (
        <ValidationPanel run={run} kind="video">
          {run.videoState?.validation?.verdict === 'WARN' && !run.videoState.warningAcknowledged ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={actions.acknowledgeVideoWarning}>Reconhecer aviso</button>
              <button type="button" className="btn-secondary" onClick={actions.retryVideo}>Tentar vídeo novamente</button>
            </div>
          ) : (
            <button type="button" className="btn-primary" onClick={actions.acceptVideo}>Finalizar vídeo</button>
          )}
        </ValidationPanel>
      );
    case 'COMPLETED':
      return (
        <section className="panel border-emerald-500/40 p-5 text-center">
          <div className="text-2xl text-emerald-400">✓</div>
          <h3 className="mt-1 text-lg font-semibold">ETAPA VISUAL CONCLUÍDA</h3>
          <p className="mt-2 text-xs text-studio-muted">Imagem aprovada · Vídeo validado · Stage {run.temporalIdentity.stageId}</p>
        </section>
      );
    case 'FAILED':
      return <EmptyState message="O fluxo foi interrompido. Revise a mensagem acima antes de continuar." />;
  }
}

function PipelineStepper({ run }: { run: VisualPipelineRun }) {
  return (
    <ol aria-label="Progresso do pipeline visual" className="grid grid-cols-2 gap-1 md:grid-cols-4 xl:grid-cols-8">
      {pipelineSteps(run).map(step => (
        <li key={step.id} className={`rounded border px-2 py-2 text-[10px] ${stepClass(step.status)}`}>
          <span className="mr-1 font-mono">{step.id}.</span>{step.label}
        </li>
      ))}
    </ol>
  );
}

function GenerationPanel({
  title, prompt, aspectRatio, resolution, duration, referenceUri, correctionChange,
  correctionPreserve, status, cta, busy, hideAction, onAction, children,
}: {
  title: string;
  prompt: string;
  aspectRatio?: number;
  resolution?: { width: number; height: number };
  duration?: number;
  referenceUri?: string;
  correctionChange?: readonly string[];
  correctionPreserve?: readonly string[];
  status?: string;
  cta?: string;
  busy?: boolean;
  hideAction?: boolean;
  onAction?: () => void | Promise<void>;
  children?: React.ReactNode;
}) {
  const [copyState, setCopyState] = useState('Copiar prompt');
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyState('Prompt copiado');
    } catch {
      setCopyState('Não foi possível copiar');
    }
  };
  return (
    <section className="panel p-4 space-y-3">
      <SectionHeading title={title} subtitle={status ?? 'Pacote manual, sem API de geração.'} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Prompt final</span>
            <button type="button" className="btn-secondary" onClick={copyPrompt}>{copyState}</button>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-studio-border bg-studio-bg p-3 text-[10px] text-studio-muted">{prompt}</pre>
        </div>
        <div className="space-y-2 text-xs">
          <AssetPreview uri={referenceUri} kind="image" label="Referência oficial" />
          <div className="rounded border border-studio-border bg-studio-bg p-2 text-studio-muted">
            <div>Aspecto: {aspectRatio ? aspectRatio.toFixed(3) : 'padrão'}</div>
            <div>Resolução: {resolution ? `${resolution.width} × ${resolution.height}` : 'não definida'}</div>
            {duration !== undefined && <div>Duração: {duration}s</div>}
          </div>
        </div>
      </div>
      {(correctionChange?.length || correctionPreserve?.length) ? (
        <CorrectionInstructions change={correctionChange ?? []} preserve={correctionPreserve ?? []} />
      ) : null}
      {!hideAction && onAction && (
        <button type="button" className="btn-primary" disabled={busy} onClick={onAction}>
          {busy ? 'Preparando…' : cta}
        </button>
      )}
      {children}
    </section>
  );
}

function FileSubmission({ kind, cta, onSubmit, onError }: {
  kind: 'image' | 'video';
  cta: string;
  onSubmit: (asset: never) => void;
  onError: (message: string) => void;
}) {
  const [file, setFile] = useState<File>();
  const submit = () => {
    if (!file) return onError(kind === 'image' ? 'Selecione uma imagem.' : 'Selecione um vídeo.');
    try {
      const uri = URL.createObjectURL(file);
      const asset = kind === 'image' ? imageAssetFromFile(file, uri) : videoAssetFromFile(file, uri);
      onError('');
      onSubmit(asset as never);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'O arquivo enviado não é válido.');
    }
  };
  return (
    <div className="rounded border border-dashed border-studio-border p-3">
      <label className="block text-xs text-studio-muted">
        {kind === 'image' ? 'Imagem gerada' : 'Vídeo gerado'}
        <input type="file" className="input-field mt-1" accept={kind === 'image' ? 'image/*' : 'video/*'}
          onChange={event => setFile(event.target.files?.[0])} />
      </label>
      <button type="button" className="btn-primary mt-2" disabled={!file} onClick={submit}>{cta}</button>
    </div>
  );
}

function ImageEvidenceForm({ busy, onSubmit }: { busy: boolean; onSubmit: (value: ImageEvidenceAnswers) => Promise<void> }) {
  const [value, setValue] = useState(INITIAL_IMAGE_EVIDENCE);
  return (
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); void onSubmit(value); }}>
      <div className="grid gap-2 md:grid-cols-2">
        <ReviewSelect label="Construção está correta?" value={value.construction} onChange={construction => setValue({ ...value, construction })} />
        <ReviewSelect label="Personagem está consistente?" value={value.character} onChange={character => setValue({ ...value, character })} />
        <ReviewSelect label="Roupa está correta?" value={value.clothing} onChange={clothing => setValue({ ...value, clothing })} />
        <ReviewSelect label="Ambiente está consistente?" value={value.environment} onChange={environment => setValue({ ...value, environment })} />
      </div>
      <BooleanCheck label="Existe elemento que apareceu antes da hora?" checked={value.futureElementPresent}
        onChange={futureElementPresent => setValue({ ...value, futureElementPresent })} />
      <BooleanCheck label="Falta algum elemento obrigatório?" checked={value.missingRequiredElement}
        onChange={missingRequiredElement => setValue({ ...value, missingRequiredElement })} />
      <Notes value={value.notes} onChange={notes => setValue({ ...value, notes })} />
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Validando…' : 'Validar imagem'}</button>
    </form>
  );
}

function VideoEvidenceForm({ busy, onSubmit }: { busy: boolean; onSubmit: (value: VideoEvidenceAnswers) => Promise<void> }) {
  const [value, setValue] = useState(INITIAL_VIDEO_EVIDENCE);
  return (
    <form className="space-y-3" onSubmit={event => { event.preventDefault(); void onSubmit(value); }}>
      <BooleanCheck label="A ação física está correta?" checked={value.actionCorrect}
        onChange={actionCorrect => setValue({ ...value, actionCorrect })} />
      <div className="grid gap-2 md:grid-cols-2">
        <ReviewSelect label="Personagem permaneceu igual?" value={value.character} onChange={character => setValue({ ...value, character })} />
        <ReviewSelect label="Roupa permaneceu igual?" value={value.clothing} onChange={clothing => setValue({ ...value, clothing })} />
        <ReviewSelect label="Construção mudou somente o permitido?" value={value.construction} onChange={construction => setValue({ ...value, construction })} />
        <ReviewSelect label="Câmera ficou coerente?" value={value.camera} onChange={camera => setValue({ ...value, camera })} />
        <ReviewSelect label="Ambiente permaneceu igual?" value={value.environment} onChange={environment => setValue({ ...value, environment })} />
      </div>
      <BooleanCheck label="Apareceu alguma ação futura?" checked={value.futureActionPresent}
        onChange={futureActionPresent => setValue({ ...value, futureActionPresent })} />
      <Notes value={value.notes} onChange={notes => setValue({ ...value, notes })} />
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Validando…' : 'Validar vídeo'}</button>
    </form>
  );
}

function ReviewSelect({ label, value, onChange }: { label: string; value: ReviewAnswer; onChange: (value: ReviewAnswer) => void }) {
  return (
    <label className="text-xs text-studio-muted">{label}
      <select className="select-field mt-1" value={value} onChange={event => onChange(event.target.value as ReviewAnswer)}>
        <option value="MATCH">Sim</option>
        <option value="MINOR_DIVERGENCE">Há uma pequena diferença</option>
        <option value="MAJOR_DIVERGENCE">Não</option>
      </select>
    </label>
  );
}

function BooleanCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-studio-muted">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function Notes({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs text-studio-muted">Observações opcionais
      <textarea className="input-field mt-1 h-20 resize-y" value={value} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function ValidationPanel({ run, kind, children }: { run: VisualPipelineRun; kind: 'image' | 'video'; children: React.ReactNode }) {
  const validation = kind === 'image' ? run.imageState.validation : run.videoState?.validation;
  return (
    <section className="panel p-4 space-y-3">
      <SectionHeading title={validation?.verdict === 'PASS' ? `${kind === 'image' ? 'Imagem' : 'Vídeo'} coerente`
        : 'Revisão necessária'} subtitle="Nenhuma aprovação é aplicada automaticamente." />
      <Verdict verdict={validation?.verdict} />
      <Findings findings={validation?.findings ?? []} />
      {children}
    </section>
  );
}

function CorrectionPanel({ title, run, kind, cta, onAction }: {
  title: string;
  run: VisualPipelineRun;
  kind: 'image' | 'video';
  cta: string;
  onAction: () => void;
}) {
  const validation = kind === 'image' ? run.imageState.validation : run.videoState?.validation;
  return (
    <section className="panel border-rose-500/40 p-4 space-y-3">
      <SectionHeading title={title} subtitle="A tentativa rejeitada não será oficial nem alterará a etapa física." />
      <Verdict verdict="FAIL" />
      <Findings findings={validation?.findings ?? []} />
      <button type="button" className="btn-primary" onClick={onAction}>{cta}</button>
    </section>
  );
}

function CorrectionInstructions({ change, preserve }: { change: readonly string[]; preserve: readonly string[] }) {
  return (
    <div className="grid gap-2 md:grid-cols-2 text-xs">
      <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="font-semibold text-amber-300">MUDAR</div>
        <ul className="mt-1 list-disc pl-4 text-studio-muted">{change.map(item => <li key={item}>{item}</li>)}</ul>
      </div>
      <div className="rounded border border-cyan-500/30 bg-cyan-500/5 p-3">
        <div className="font-semibold text-cyan-300">PRESERVAR</div>
        <ul className="mt-1 list-disc pl-4 text-studio-muted">{preserve.map(item => <li key={item}>{item}</li>)}</ul>
      </div>
    </div>
  );
}

function AssetPreview({ uri, kind, label }: { uri?: string; kind: 'image' | 'video'; label?: string }) {
  if (!isLocalPreviewUri(uri)) {
    return <div className="rounded border border-studio-border bg-studio-bg p-3 text-[10px] text-studio-muted">{label ?? 'Preview'} não disponível localmente.</div>;
  }
  return (
    <figure>
      {label && <figcaption className="mb-1 text-[10px] text-studio-muted">{label}</figcaption>}
      {kind === 'image'
        ? <img src={uri} alt={label ?? 'Imagem enviada'} className="max-h-56 w-full rounded border border-studio-border object-contain" />
        : <video src={uri} controls className="max-h-64 w-full rounded border border-studio-border" />}
    </figure>
  );
}

function Findings({ findings }: { findings: readonly { code: string; message: string }[] }) {
  if (findings.length === 0) return <p className="text-xs text-emerald-300">Nenhum problema encontrado.</p>;
  return (
    <ul className="space-y-1 text-xs text-studio-muted">
      {findings.map((finding, index) => <li key={`${finding.code}-${index}`}>• {humanFinding(finding.code, finding.message)}</li>)}
    </ul>
  );
}

function Verdict({ verdict }: { verdict?: 'PASS' | 'WARN' | 'FAIL' }) {
  const text = verdict === 'PASS' ? 'PASS · Coerente' : verdict === 'WARN' ? 'WARN · Revisão necessária' : 'FAIL · Correção necessária';
  const style = verdict === 'PASS' ? 'badge-success' : verdict === 'WARN' ? 'badge-warning' : 'badge-error';
  return <span className={`badge ${style}`}>{text}</span>;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h3 className="font-semibold text-studio-text">{title}</h3><p className="text-xs text-studio-muted">{subtitle}</p></div>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="panel flex min-h-48 items-center justify-center p-6 text-center text-xs text-studio-muted">{message}</div>;
}

function stepClass(status: ReturnType<typeof pipelineSteps>[number]['status']): string {
  if (status === 'completed') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (status === 'current') return 'border-studio-accent bg-studio-accent/10 text-studio-accent';
  if (status === 'warning') return 'border-amber-500/50 bg-amber-500/10 text-amber-300';
  if (status === 'failed') return 'border-rose-500/50 bg-rose-500/10 text-rose-300';
  return 'border-studio-border text-studio-muted';
}

function humanPhase(phase: VisualPipelineRun['currentPhase']): string {
  const labels: Record<VisualPipelineRun['currentPhase'], string> = {
    IMAGE_REQUEST_READY: 'Imagem pronta para gerar',
    IMAGE_MANUAL_ACTION_REQUIRED: 'Aguardando imagem',
    IMAGE_VALIDATION_REQUIRED: 'Validação da imagem',
    IMAGE_CORRECTION_REQUIRED: 'Correção da imagem',
    IMAGE_APPROVAL_REQUIRED: 'Aprovação da imagem',
    IMAGE_APPROVED: 'Imagem oficial',
    VIDEO_REQUEST_READY: 'Vídeo pronto para gerar',
    VIDEO_MANUAL_ACTION_REQUIRED: 'Aguardando vídeo',
    VIDEO_VALIDATION_REQUIRED: 'Validação do vídeo',
    VIDEO_CORRECTION_REQUIRED: 'Correção do vídeo',
    VIDEO_ACCEPTANCE_REQUIRED: 'Finalização do vídeo',
    COMPLETED: 'Concluído',
    FAILED: 'Interrompido',
  };
  return labels[phase];
}

function humanFinding(code: string, fallback: string): string {
  const labels: Record<string, string> = {
    FUTURE_ELEMENT_LEAK: 'Há um elemento que apareceu antes da hora.',
    REQUIRED_ELEMENT_MISSING: 'Falta um elemento visual obrigatório.',
    CHARACTER_CONTINUITY: 'O personagem não permaneceu consistente.',
    CLOTHING_CONTINUITY: 'A roupa não permaneceu consistente.',
    ENVIRONMENT_CONTINUITY: 'O ambiente mudou além do permitido.',
    CONSTRUCTION_CONTINUITY: 'A construção mudou além do permitido.',
    WRONG_PRIMARY_ACTION: 'A ação física observada não é a ação aprovada.',
    MISSING_PRIMARY_ACTION: 'A ação física obrigatória não aparece.',
    FUTURE_ACTION: 'Foi observada uma ação de etapa futura.',
    CAMERA_CONTINUITY: 'A câmera não respeitou as restrições previstas.',
    SOURCE_IMAGE_CONTINUITY: 'O vídeo não preservou a imagem oficial de origem.',
  };
  return labels[code] ?? fallback;
}
