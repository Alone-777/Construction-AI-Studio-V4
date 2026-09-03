import { useUIStore } from './store/useUIStore';
import { useProjectStore } from './store/useProjectStore';
import { useSimulationStore } from './store/useSimulationStore';
import { usePromptStore } from './store/usePromptStore';
import { useVisualEngineStore } from './store/useVisualEngineStore';
import { useEffect, useState } from 'react';
import { VisualWorkspace } from './components/workspace/VisualWorkspace';
import { importProjectJSON, listProjects, loadProject } from './db/repository';
import type { DetailLevel, EnvironmentPreset } from './core/types';
import { worldStateToVisualSceneState } from './core/visual/VisualSceneState';
import { optimizePrompt } from './core/prompts/optimizer';
import type { Project } from './core/types';
import type { VisualProviderDescriptor } from './core/providers/visual-provider';
import {
  fetchVisualProviderDescriptors,
  InternalApiVisualProvider,
} from './core/providers/internal-api-visual-provider';
import {
  compileVisualReviewToBlueprint,
  createProjectFromVisualReview,
  type VisualBlueprintResult,
} from './core/blueprints/visual-blueprint';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  VISUAL_CLAIM_FIELDS,
  validateImageMetadata,
} from '../shared/visual-schema.mjs';
import {
  confirmVisualClaim,
  createVisualReviewSession,
  editVisualClaim,
  formatVisualClaimValue,
  parseVisualClaimValue,
  removeVisualClaim,
  restoreVisualClaim,
  type VisualClaimField,
  type VisualReviewSession,
} from './core/review/visual-review';
import type { VisualEvaluationCategory } from './core/evaluation/visual-evaluation';
import { auditProjectStage } from './core/fiscals/fiscal-runner';
import { generateNanoBananaPrompt } from './core/prompts/nano-banana';
import { generateKlingPrompt } from './core/prompts/kling';

/* ─── Tela Inicial ─── */
function HomeScreen() {
  const setScreen = useUIStore(s => s.setScreen);
  const createDemoProject = useProjectStore(s => s.createDemoProject);
  const loadProj = useProjectStore(s => s.loadProject);
  const [projects, setProjects] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [showSetup, setShowSetup] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImageReconstruction, setShowImageReconstruction] = useState(false);
  const [showProjectsList, setShowProjectsList] = useState(true);

  useEffect(() => {
    listProjects().then(p => setProjects(p.map(r => ({ id: r.id, name: r.name, updatedAt: r.updatedAt }))));
  }, []);

  const handleLoadProject = async (id: string) => {
    const proj = await loadProject(id);
    if (proj) {
      loadProj(proj);
      setScreen('project');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const proj = await importProjectJSON(text);
      loadProj(proj);
      setScreen('project');
    } catch (err) {
      alert('Erro ao importar projeto: ' + (err as Error).message);
    }
  };

  const handleCreateDemo = () => {
    createDemoProject();
    setScreen('project');
  };

  if (showSetup) {
    return <ProjectSetupScreen onBack={() => setShowSetup(false)} />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-studio-bg p-4">
      {/* Logo */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-studio-accent tracking-tight">
          CONSTRUCTION AI STUDIO
        </h1>
        <p className="text-studio-muted mt-2 text-sm">V4 — Motor Determinístico de Construção Audiovisual</p>
      </div>

      {/* Menu principal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
        <button onClick={() => setShowSetup(true)}
          className="panel p-6 text-left hover:border-studio-accent transition-colors group">
          <div className="text-lg font-semibold text-studio-text group-hover:text-studio-accent">🏗️ CRIAR DO ZERO</div>
          <p className="text-xs text-studio-muted mt-1">Experiência de simulador/planejamento</p>
        </button>

        <button onClick={() => setShowImport(true)}
          className="panel p-6 text-left hover:border-studio-cyan transition-colors group">
          <div className="text-lg font-semibold text-studio-text group-hover:text-studio-cyan">📥 IMPORTAR PROJETO</div>
          <p className="text-xs text-studio-muted mt-1">Abrir um arquivo JSON do Construction AI Studio V4</p>
        </button>

        <button onClick={() => setShowImageReconstruction(true)}
          className="panel p-6 text-left hover:border-studio-cyan transition-colors group">
          <div className="text-lg font-semibold text-studio-text group-hover:text-studio-cyan">🖼️ RECONSTRUIR POR IMAGEM</div>
          <p className="text-xs text-studio-muted mt-1">Pipeline visual com provider externo configurável</p>
        </button>

        <button onClick={() => setShowProjectsList(value => !value)}
          className="panel p-6 text-left hover:border-studio-emerald transition-colors group">
          <div className="text-lg font-semibold text-studio-text group-hover:text-studio-emerald">📁 MEUS PROJETOS</div>
          <p className="text-xs text-studio-muted mt-1">{projects.length} projeto(s) salvo(s)</p>
          {showProjectsList && projects.length > 0 && (
            <div className="mt-3 space-y-1">
              {projects.slice(0, 5).map(p => (
                <div key={p.id}
                  onClick={(e) => { e.stopPropagation(); handleLoadProject(p.id); }}
                  className="text-xs text-studio-cyan hover:underline cursor-pointer truncate">
                  {p.name}
                </div>
              ))}
            </div>
          )}
        </button>

        <button onClick={handleCreateDemo}
          className="panel p-6 text-left hover:border-studio-purple transition-colors group">
          <div className="text-lg font-semibold text-studio-text group-hover:text-studio-purple">🎬 DEMO: CABANA DO RIACHO</div>
          <p className="text-xs text-studio-muted mt-1">Projeto de demonstração completo</p>
        </button>
      </div>

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowImport(false)}>
          <div className="panel p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Importar Projeto</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-studio-muted mb-2">Selecione um arquivo JSON:</label>
                <input type="file" accept=".json" onChange={handleImport} className="input-field" />
              </div>
              <p className="text-xs text-studio-muted">
                O importador valida arquivos da versão 4 e preserva cenas, snapshots e feedbacks.
              </p>
              <button onClick={() => setShowImport(false)} className="btn-secondary w-full">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showImageReconstruction && (
        <VisualReconstructionModal
          onClose={() => setShowImageReconstruction(false)}
          onProjectCreated={(project) => {
            loadProj(project);
            setShowImageReconstruction(false);
            setScreen('project');
          }}
        />
      )}

      {/* Aviso legal (§3) */}
      <p className="text-[10px] text-zinc-600 mt-12 max-w-xl text-center leading-relaxed">
        Planejamento conceitual e audiovisual. Não substitui projeto, sondagem, normas, cálculo técnico ou profissional habilitado.
      </p>
    </div>
  );
}

const VISUAL_FIELD_LABELS: Record<string, string> = {
  constructionType: 'Tipo provável', environment: 'Ambiente', terrain: 'Terreno',
  watercourse: 'Curso d’água', vegetation: 'Vegetação', visibleComponents: 'Componentes visíveis',
  apparentMaterials: 'Materiais aparentes', structure: 'Estrutura', foundation: 'Fundação',
  floor: 'Piso', walls: 'Paredes', roof: 'Cobertura', openings: 'Aberturas',
  externalAreas: 'Áreas externas', paths: 'Caminhos', drainage: 'Drenagem',
  spatialRelations: 'Relações espaciais', naturalElements: 'Elementos naturais',
  preservationElements: 'Elementos a preservar', apparentCompletion: 'Conclusão aparente',
};

const VISUAL_ORIGIN_LABELS = {
  PROVIDER: 'veio do provider',
  USER_EDITED: 'alterado pelo usuário',
  USER_CONFIRMED: 'confirmado pelo usuário',
} as const;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Não foi possível ler a imagem.'));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function VisualClaimReviewCard({
  field,
  session,
  onSessionChange,
}: {
  field: VisualClaimField;
  session: VisualReviewSession;
  onSessionChange: (session: VisualReviewSession) => void;
}) {
  const claim = session.reviewedInterpretation.claims[field];
  const [draftValue, setDraftValue] = useState(formatVisualClaimValue(claim.value));
  const [draftEvidence, setDraftEvidence] = useState(claim.evidence);
  const [draftClassification, setDraftClassification] = useState(claim.classification);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setDraftValue(formatVisualClaimValue(claim.value));
    setDraftEvidence(claim.evidence);
    setDraftClassification(claim.classification);
    setLocalError('');
  }, [claim]);

  const applyEdit = () => {
    try {
      const value = draftClassification === 'UNKNOWN' ? null : parseVisualClaimValue(field, draftValue);
      onSessionChange(editVisualClaim(session, field, {
        value: value as never,
        classification: draftClassification,
        evidence: draftEvidence,
      }));
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Correção inválida.');
    }
  };

  const originClass = claim.origin === 'PROVIDER'
    ? 'text-cyan-300 border-cyan-500/40'
    : claim.origin === 'USER_CONFIRMED'
      ? 'text-emerald-300 border-emerald-500/40'
      : 'text-amber-300 border-amber-500/40';

  return (
    <details className={`rounded border bg-studio-bg px-2 py-1.5 text-xs ${claim.removed ? 'border-rose-500/50 opacity-80' : 'border-studio-border'}`}>
      <summary className="cursor-pointer flex flex-wrap justify-between gap-2">
        <span>{VISUAL_FIELD_LABELS[field] ?? field}: {claim.removed ? 'removido da interpretação' : (formatVisualClaimValue(claim.value) || 'não verificável')}</span>
        <span className="flex flex-wrap gap-1">
          <span className={`rounded border px-1 ${originClass}`}>{VISUAL_ORIGIN_LABELS[claim.origin]}</span>
          <span className={claim.classification === 'FACT' ? 'text-emerald-400' : claim.classification === 'HYPOTHESIS' ? 'text-amber-400' : 'text-studio-muted'}>
            {claim.classification}
          </span>
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        <div className="rounded border border-cyan-500/20 bg-cyan-500/5 p-2 text-[10px] text-studio-muted">
          <div className="font-semibold text-cyan-300">Original do provider — preservado</div>
          <div>Valor: {formatVisualClaimValue(claim.originalValue) || 'não verificável'}</div>
          <div>Classe: {claim.originalClassification} · confiança original {Math.round(claim.originalConfidence * 100)}%</div>
          <div>Evidência: {claim.originalEvidence}</div>
        </div>
        {!claim.removed && (
          <>
            <label className="block text-[10px] text-studio-muted">Valor atual
              <input aria-label={`Valor de ${VISUAL_FIELD_LABELS[field] ?? field}`} value={draftValue}
                onChange={event => setDraftValue(event.target.value)} className="input-field mt-1" />
            </label>
            <label className="block text-[10px] text-studio-muted">Classificação atual
              <select aria-label={`Classificação de ${VISUAL_FIELD_LABELS[field] ?? field}`} value={draftClassification}
                onChange={event => setDraftClassification(event.target.value as typeof draftClassification)} className="input-field mt-1">
                <option value="FACT">FACT</option>
                <option value="HYPOTHESIS">HYPOTHESIS</option>
                <option value="UNKNOWN">UNKNOWN</option>
              </select>
            </label>
            <label className="block text-[10px] text-studio-muted">Descrição/evidência atual
              <textarea aria-label={`Evidência de ${VISUAL_FIELD_LABELS[field] ?? field}`} value={draftEvidence}
                onChange={event => setDraftEvidence(event.target.value)} className="input-field mt-1 h-16 resize-y" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={applyEdit} className="btn-secondary">Salvar correção</button>
              <button type="button" onClick={() => onSessionChange(confirmVisualClaim(session, field))}
                className="btn-secondary">Confirmar claim</button>
              <button type="button" onClick={() => onSessionChange(removeVisualClaim(session, field))}
                className="btn-secondary text-rose-300">Remover claim</button>
            </div>
          </>
        )}
        {claim.removed && (
          <button type="button" onClick={() => onSessionChange(restoreVisualClaim(session, field))} className="btn-secondary">
            Restaurar original do provider
          </button>
        )}
        {claim.changedAt && <p className="text-[10px] text-studio-muted">Alterado em {new Date(claim.changedAt).toLocaleString('pt-BR')}.</p>}
        {claim.humanConfirmed && <p className="text-[10px] text-emerald-300">Confirmação humana registrada.</p>}
        {localError && <p role="alert" className="text-[10px] text-rose-300">{localError}</p>}
      </div>
    </details>
  );
}

function VisualReconstructionModal({
  onClose,
  onProjectCreated,
}: {
  onClose: () => void;
  onProjectCreated: (project: Project) => void;
}) {
  const [providers, setProviders] = useState<VisualProviderDescriptor[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageData, setImageData] = useState('');
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [evaluationCategory, setEvaluationCategory] = useState<VisualEvaluationCategory>('cabana');
  const [reviewSession, setReviewSession] = useState<VisualReviewSession | null>(null);
  const [blueprint, setBlueprint] = useState<VisualBlueprintResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'reading' | 'analyzing' | 'analyzed' | 'blueprint' | 'creating'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchVisualProviderDescriptors()
      .then(items => {
        if (!active) return;
        setProviders(items);
        setSelectedProviderId(items.find(provider => provider.configured)?.id ?? items[0]?.id ?? '');
      })
      .catch(cause => active && setError(cause instanceof Error ? cause.message : 'Backend visual indisponível.'))
      .finally(() => active && setProvidersLoading(false));
    return () => { active = false; };
  }, []);

  const selectedProvider = providers.find(provider => provider.id === selectedProviderId);
  const request = imageFile ? {
    imageData,
    mimeType: imageFile.type,
    imageName: imageFile.name,
    imageSize: imageFile.size,
    userContext: context.trim() || undefined,
    name: name.trim() || undefined,
    providerModel: selectedProvider?.model,
    evaluationCategory,
  } : null;

  const handleImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setReviewSession(null);
    setBlueprint(null);
    setError('');
    if (!file) {
      setImageFile(null);
      setImageData('');
      return;
    }
    try {
      setStatus('reading');
      validateImageMetadata(file.type, file.size);
      setImageData(await fileToDataUrl(file));
      setImageFile(file);
      setStatus('idle');
    } catch (cause) {
      setImageFile(null);
      setImageData('');
      setStatus('idle');
      setError(cause instanceof Error ? cause.message : 'Imagem inválida.');
    }
  };

  const handleAnalyze = async () => {
    if (!selectedProvider || !request) return;
    setError('');
    setReviewSession(null);
    setBlueprint(null);
    setStatus('analyzing');
    try {
      const result = await new InternalApiVisualProvider(selectedProvider).analyze(request);
      setReviewSession(createVisualReviewSession(result));
      setStatus('analyzed');
    } catch (cause) {
      setStatus('idle');
      setError(cause instanceof Error ? cause.message : 'Falha na análise visual.');
    }
  };

  const handleBlueprint = () => {
    if (!reviewSession || !request) return;
    setError('');
    try {
      setBlueprint(compileVisualReviewToBlueprint(reviewSession, request));
      setStatus('blueprint');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível normalizar o blueprint.');
    }
  };

  const handleCreateProject = () => {
    if (!reviewSession || !blueprint || !request) return;
    setError('');
    setStatus('creating');
    try {
      onProjectCreated(createProjectFromVisualReview(reviewSession, request));
    } catch (cause) {
      setStatus('blueprint');
      setError(cause instanceof Error ? cause.message : 'Não foi possível orquestrar o projeto visual.');
    }
  };

  const handleReviewChange = (next: VisualReviewSession) => {
    setReviewSession(next);
    setBlueprint(null);
    setStatus('analyzed');
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="panel p-5 max-w-5xl w-full max-h-[94vh] overflow-auto" onClick={event => event.stopPropagation()}>
        <div className="flex justify-between gap-4 items-start mb-4">
          <div>
            <h3 className="text-xl font-semibold">Reconstrução visual real</h3>
            <p className="text-xs text-studio-muted mt-1">Imagem → backend seguro → provider → schema → blueprint → orquestrador.</p>
          </div>
          <button onClick={onClose} className="btn-secondary">Fechar</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="space-y-3">
            <div className="panel-header">1. IMAGEM ORIGINAL</div>
            <input aria-label="Imagem de referência" type="file" accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
              onChange={handleImage} className="input-field" />
            <p className="text-[10px] text-studio-muted">JPEG, PNG ou WebP; máximo {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.</p>
            {imageData && imageFile && (
              <div className="rounded border border-studio-border bg-studio-bg p-2">
                <img src={imageData} alt="Preview da imagem original" className="w-full max-h-64 object-contain rounded" />
                <div className="mt-2 text-[10px] text-studio-muted">{imageFile.name} · {imageFile.type} · {Math.ceil(imageFile.size / 1024)} KB</div>
              </div>
            )}
            <input value={name} onChange={event => setName(event.target.value)} className="input-field" placeholder="Nome do projeto reconstruído (opcional)" />
            <textarea value={context} onChange={event => setContext(event.target.value)} className="input-field h-20 resize-y"
              placeholder="Contexto adicional opcional; não será tratado como evidência visual." />
            <label className="block text-xs text-studio-muted">Categoria da avaliação supervisionada
              <select value={evaluationCategory} onChange={event => setEvaluationCategory(event.target.value as VisualEvaluationCategory)} className="input-field mt-1">
                <option value="cabana">Cabana</option>
                <option value="ponte">Ponte</option>
                <option value="abrigo">Abrigo</option>
                <option value="deck_plataforma">Deck/plataforma</option>
              </select>
            </label>

            <div className="panel-header">2. STATUS DOS PROVIDERS</div>
            <div className="space-y-1">
              {providersLoading && <p className="text-xs text-studio-muted">Consultando backend seguro…</p>}
              {providers.map(provider => (
                <label key={provider.id} className={`flex items-center justify-between rounded border p-2 text-xs ${selectedProviderId === provider.id ? 'border-studio-accent' : 'border-studio-border'}`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="visual-provider" value={provider.id}
                      checked={selectedProviderId === provider.id} onChange={() => setSelectedProviderId(provider.id)} />
                    {provider.name}
                  </span>
                  <span className={provider.configured ? 'text-emerald-400' : 'text-amber-400'}>
                    {provider.configured ? `configurado · ${provider.model ?? 'modelo do servidor'}` : 'não configurado'}
                  </span>
                </label>
              ))}
              {!providersLoading && providers.length === 0 && <p className="text-xs text-amber-400">Backend visual indisponível ou sem catálogo de providers.</p>}
            </div>
            {!selectedProvider?.configured && (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                Nenhum provider selecionado está configurado. Copie <code>.env.example</code> para <code>.env</code>, configure a chave somente no servidor e reinicie-o. Nenhuma análise será fabricada.
              </div>
            )}
            <button onClick={handleAnalyze}
              disabled={!request || !selectedProvider?.configured || status === 'analyzing' || status === 'reading'}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
              {status === 'analyzing' ? 'Analisando imagem no provider…' : '3. Iniciar análise visual'}
            </button>
          </section>

          <section className="space-y-3">
            <div className="panel-header">4–6. INTERPRETAÇÃO ORIGINAL E REVISÃO HUMANA</div>
            {!reviewSession ? (
              <p className="text-xs text-studio-muted p-3">A interpretação validada aparecerá aqui. Respostas fora do schema são bloqueadas.</p>
            ) : (
              <>
                <div className="rounded border border-cyan-500/30 bg-cyan-500/5 p-2">
                  <div className="text-[10px] font-semibold text-cyan-300">INTERPRETAÇÃO ORIGINAL DO PROVIDER — SOMENTE LEITURA</div>
                  <p className="mt-1 text-xs">{reviewSession.providerOriginal.summary}</p>
                </div>
                <p className="text-[10px] text-studio-muted">Edite, remova ou confirme cada claim. Toda correção fica separada do original e invalida o blueprint anterior.</p>
                <div className="max-h-[28rem] overflow-auto space-y-1 pr-1">
                  {VISUAL_CLAIM_FIELDS.map(field => {
                    return <VisualClaimReviewCard key={field} field={field} session={reviewSession} onSessionChange={handleReviewChange} />;
                  })}
                </div>
                <details className="text-xs text-studio-muted">
                  <summary className="cursor-pointer">Incertezas e limites técnicos</summary>
                  {[...reviewSession.reviewedInterpretation.uncertainties, ...reviewSession.reviewedInterpretation.technicalUnknowns].map(item => <div key={item}>• {item}</div>)}
                </details>
                <button onClick={handleBlueprint} className="btn-secondary w-full">7. Gerar blueprint normalizado</button>
              </>
            )}

            <div className="panel-header">8. BLUEPRINT DERIVADO</div>
            {!blueprint ? (
              <p className="text-xs text-studio-muted p-3">Revise a interpretação antes de gerar o blueprint.</p>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-studio-bg rounded p-2">{blueprint.blueprint.components.length}<br /><span className="text-studio-muted">componentes</span></div>
                  <div className="bg-studio-bg rounded p-2">{blueprint.blueprint.operations.length}<br /><span className="text-studio-muted">operações</span></div>
                  <div className="bg-studio-bg rounded p-2">{blueprint.blueprint.map.zones.length}<br /><span className="text-studio-muted">zonas</span></div>
                </div>
                <div className="max-h-36 overflow-auto space-y-1">
                  {blueprint.blueprint.operations.map(operation => (
                    <div key={operation.id} className="rounded bg-studio-bg p-2 flex justify-between gap-2">
                      <span>{operation.name}</span>
                      <span className={operation.visualBasis?.classification === 'FACT' ? 'text-emerald-400' : 'text-amber-400'}>{operation.visualBasis?.classification}</span>
                    </div>
                  ))}
                </div>
                <button onClick={handleCreateProject} disabled={status === 'creating'} className="btn-primary w-full disabled:opacity-50">
                  {status === 'creating' ? 'Orquestrando projeto…' : '9. Gerar projeto completo'}
                </button>
              </div>
            )}
          </section>
        </div>
        {error && <div role="alert" className="mt-4 rounded border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
      </div>
    </div>
  );
}

/* ─── Setup rápido ─── */
function ProjectSetupScreen({ onBack }: { onBack: () => void }) {
  const setScreen = useUIStore(s => s.setScreen);
  const createProjectFromDescription = useProjectStore(s => s.createProjectFromDescription);

  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<EnvironmentPreset | ''>('');
  const [construction, setConstruction] = useState('');
  const [form, setForm] = useState('');
  const [materials, setMaterials] = useState('');
  const [workers, setWorkers] = useState(1);
  const [totalDuration, setTotalDuration] = useState(120);
  const [sceneDuration, setSceneDuration] = useState(15);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('alto');
  const [error, setError] = useState('');

  const handleCreate = () => {
    setError('');
    try {
      createProjectFromDescription({
        description,
        name: name.trim() || undefined,
        environment: environment || undefined,
        construction: construction || undefined,
        approximateForm: form.trim() || undefined,
        materials: materials.split(',').map(material => material.trim()).filter(Boolean),
        workerCount: workers,
        totalDuration,
        sceneDuration,
        detailLevel,
      });
      setScreen('project');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível estruturar o projeto.');
    }
  };

  const environments = [
    'floresta_tropical', 'floresta_temperada', 'floresta_umida', 'pinheiros', 'clareira',
    'montanha', 'margem_rio', 'riacho', 'vale', 'area_rochosa', 'terreno_plano', 'terreno_inclinado', 'personalizado'
  ];
  const constructions = [
    'cabana', 'casa_rustica', 'casa_madeira', 'casa_pedra', 'casa_barro', 'abrigo',
    'casa_elevada', 'casa_arvore', 'ponte', 'torre', 'plataforma', 'piscina_natural', 'sauna', 'galpao'
  ];

  return (
    <div className="min-h-screen bg-studio-bg p-4 overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="text-studio-muted hover:text-studio-text text-sm mb-4">← Voltar</button>
        <h2 className="text-2xl font-bold text-studio-accent mb-6">Criar Novo Projeto</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-studio-muted mb-1">Descreva a construção *</label>
            <textarea value={description} onChange={event => setDescription(event.target.value)}
              className="input-field h-28 resize-y"
              placeholder="Ex: Cabana pequena off-grid à beira de um riacho, em madeira e pedra, retangular, com um trabalhador." />
            <p className="text-[10px] text-studio-muted mt-1">A descrição é interpretada deterministicamente; hipóteses e decisões ficam registradas no projeto.</p>
          </div>

          <div>
            <label className="block text-sm text-studio-muted mb-1">Nome do Projeto (opcional)</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Gerado a partir da tipologia e do ambiente" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-studio-muted mb-1">Ambiente</label>
              <select value={environment} onChange={e => setEnvironment(e.target.value as EnvironmentPreset | '')} className="select-field">
                <option value="">Inferir da descrição</option>
                {environments.map(env => <option key={env} value={env}>{env.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-studio-muted mb-1">Construção</label>
              <select value={construction} onChange={e => setConstruction(e.target.value)} className="select-field">
                <option value="">Inferir da descrição</option>
                {constructions.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-studio-muted mb-1">Forma Aproximada</label>
            <input value={form} onChange={e => setForm(e.target.value)} className="input-field" placeholder="Inferir; ou informar retangular, circular, irregular..." />
          </div>

          <div>
            <label className="block text-sm text-studio-muted mb-1">Materiais (separados por vírgula)</label>
            <input value={materials} onChange={e => setMaterials(e.target.value)} className="input-field" placeholder="Inferir; ou informar madeira, pedra, palha..." />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-studio-muted mb-1">Trabalhadores</label>
              <input type="number" min={1} max={10} value={workers} onChange={e => setWorkers(Number(e.target.value))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm text-studio-muted mb-1">Duração Total (s)</label>
              <input type="number" min={15} value={totalDuration} onChange={e => setTotalDuration(Number(e.target.value))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm text-studio-muted mb-1">Duração/Cena (s)</label>
              <input type="number" min={5} value={sceneDuration} onChange={e => setSceneDuration(Number(e.target.value))} className="input-field" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-studio-muted mb-1">Nível de Detalhamento</label>
            <select value={detailLevel} onChange={e => setDetailLevel(e.target.value as DetailLevel)} className="select-field">
              <option value="baixo">Baixo</option>
              <option value="medio">Médio</option>
              <option value="alto">Alto</option>
              <option value="ultra">Ultra</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={handleCreate} className="btn-primary flex-1">🚀 Gerar projeto completo</button>
            <button onClick={onBack} className="btn-secondary">Cancelar</button>
          </div>
          {error && <div role="alert" className="rounded border border-rose-500/50 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
        </div>
      </div>
    </div>
  );
}

/* ─── Tela do Projeto (3 painéis) ─── */
function ProjectScreen() {
  const project = useProjectStore(s => s.project);
  const isDirty = useProjectStore(s => s.isDirty);
  const setScreen = useUIStore(s => s.setScreen);
  const leftPanelOpen = useUIStore(s => s.leftPanelOpen);
  const rightPanelOpen = useUIStore(s => s.rightPanelOpen);
  const toggleLeftPanel = useUIStore(s => s.toggleLeftPanel);
  const toggleRightPanel = useUIStore(s => s.toggleRightPanel);
  const centerWorkspaceTab = useUIStore(s => s.centerWorkspaceTab);
  const setCenterWorkspaceTab = useUIStore(s => s.setCenterWorkspaceTab);
  const rightPanelTab = useUIStore(s => s.rightPanelTab);
  const setRightPanelTab = useUIStore(s => s.setRightPanelTab);
  const debugMode = useUIStore(s => s.debugMode);
  const toggleDebugMode = useUIStore(s => s.toggleDebugMode);
  const selectedSceneId = useUIStore(s => s.selectedSceneId);
  const selectedStagePercentage = useUIStore(s => s.selectedStagePercentage);
  const selectScene = useUIStore(s => s.selectScene);
  const selectStage = useUIStore(s => s.selectStage);
  const loadHistory = useSimulationStore(s => s.loadHistory);
  const setVisualSceneState = useVisualEngineStore(s => s.setVisualSceneState);

  useEffect(() => {
    if (!project) return;
    const stageStates = project.scenes.flatMap(scene =>
      scene.stages.map(stage => stage.worldStateAfter).filter(state => state != null)
    );
    const initialState = project.scenes[0]?.stages[0]?.worldStateBefore;
    loadHistory(initialState ? [initialState, ...stageStates] : stageStates);

    if (project.scenes.length > 0 && !project.scenes.some(scene => scene.id === selectedSceneId)) {
      selectScene(project.scenes[0].id);
      selectStage(0);
    }
  }, [project?.id, loadHistory, selectScene, selectStage]);

  // Auto-populate Visual Engine when scene or stage is selected
  useEffect(() => {
    if (!project || !selectedSceneId) return;

    const scene = project.scenes.find(s => s.id === selectedSceneId);
    if (!scene || scene.stages.length === 0) return;

    // Use the selected stage's worldStateBefore/After to populate the visual scene state
    const selectedStage = scene.stages.find(s => s.percentage === selectedStagePercentage) ?? scene.stages[0];
    const promptState = selectedStage.worldStateBefore ?? selectedStage.worldStateAfter;
    if (promptState) {
      const visualSceneState = worldStateToVisualSceneState(promptState);
      visualSceneState.scene.title = `Cena ${scene.number} — ${scene.operationId}`;
      visualSceneState.scene.description = selectedStage.physicalAction;
      visualSceneState.activeZone = selectedStage.activeZone;
      visualSceneState.timestamp = Date.now();
      // Include project's visualDNA for consistent prompt generation
      if (project.visualDNA) {
        (visualSceneState as any).visualDNA = project.visualDNA;
      }
      // Include stage-specific data: completed/partial/future elements
      visualSceneState.construction.existingComponents = selectedStage.physicalState?.completedElements || [];
      visualSceneState.construction.partialComponents = selectedStage.physicalState?.partialElements || [];
      visualSceneState.construction.futureComponents = selectedStage.futureElements || [];
      // Compute progress from completed elements count vs total elements
      const completedCount = selectedStage.physicalState?.completedElements?.length || 0;
      const partialCount = selectedStage.physicalState?.partialElements?.length || 0;
      const futureCount = selectedStage.futureElements?.length || 0;
      const totalElements = completedCount + partialCount + futureCount;
      visualSceneState.construction.progress = totalElements > 0 ? Math.round((completedCount + partialCount * 0.5) / totalElements * 100) : 0;
      setVisualSceneState(visualSceneState);
    }
  }, [project?.id, selectedSceneId, selectedStagePercentage, setVisualSceneState]);

  if (!project) return null;

  return (
    <div className="h-screen flex flex-col bg-studio-bg overflow-hidden">
      {/* Header */}
      <header className="h-10 bg-studio-surface border-b border-studio-border flex items-center px-3 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => { setScreen('home'); }} className="text-studio-muted hover:text-studio-text text-xs">← Início</button>
          <span className="text-sm font-semibold text-studio-accent">{project.name}</span>
          <span className="badge-info text-[10px]">{project.constructionState.progress === 100 ? 'completo' : project.constructionState.progress + '%'}</span>
          <span className="text-[9px] text-emerald-400">{isDirty ? 'salvando…' : 'autosave ativo'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleDebugMode} className={`text-xs px-2 py-0.5 rounded ${debugMode ? 'bg-studio-accent text-black' : 'text-studio-muted hover:text-studio-text'}`}>
            DEBUG
          </button>
          <button onClick={toggleLeftPanel} className="text-studio-muted hover:text-studio-text text-xs">◧</button>
          <button onClick={toggleRightPanel} className="text-studio-muted hover:text-studio-text text-xs">◨</button>
        </div>
      </header>

      {/* Main 3-panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        {leftPanelOpen && (
          <aside className="w-64 bg-studio-surface border-r border-studio-border flex flex-col overflow-hidden shrink-0">
            <LeftPanel />
          </aside>
        )}

        {/* Center Panel */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex border-b border-studio-border shrink-0">
            {(['map', 'dependencies', 'scenes', 'stages', 'pipeline'] as const).map(tab => (
              <button key={tab} onClick={() => setCenterWorkspaceTab(tab)}
                className={centerWorkspaceTab === tab ? 'tab-active' : 'tab'}>
                {tab === 'map' ? '🗺️ Mapa' : tab === 'dependencies' ? '📊 Grafo' : tab === 'scenes' ? '🎬 Cenas' : tab === 'stages' ? '⚙️ Stages' : 'Pipeline Visual'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-2">
            <VisualWorkspace />
          </div>
        </main>

        {/* Right Panel */}
        {rightPanelOpen && (
          <aside className="w-72 bg-studio-surface border-l border-studio-border flex flex-col overflow-hidden shrink-0">
            <div className="flex border-b border-studio-border shrink-0">
              {(['inspector', 'fiscal', 'prompts'] as const).map(tab => (
                <button key={tab} onClick={() => setRightPanelTab(tab)}
                  className={rightPanelTab === tab ? 'tab-active' : 'tab'}>
                  {tab === 'inspector' ? '🔍' : tab === 'fiscal' ? '✅' : '📝'}
                  <span className="ml-1 text-xs">{tab === 'inspector' ? 'Inspetor' : tab === 'fiscal' ? 'Fiscal' : 'Prompts'}</span>
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-auto p-2">
              <RightContent tab={rightPanelTab} />
            </div>
          </aside>
        )}
      </div>

      {/* Aviso */}
      <footer className="h-5 bg-studio-bg border-t border-studio-border flex items-center justify-center">
        <p className="text-[9px] text-zinc-600">
          Planejamento conceitual e audiovisual. Não substitui projeto técnico ou profissional habilitado.
        </p>
      </footer>
    </div>
  );
}

/* ─── Left Panel Content ─── */
function LeftPanel() {
  const project = useProjectStore(s => s.project);
  const updateVisualEvaluation = useProjectStore(s => s.updateVisualEvaluation);
  const simulatedWorldState = useSimulationStore(s => s.worldState);
  const selectedSceneId = useUIStore(s => s.selectedSceneId);
  const selectScene = useUIStore(s => s.selectScene);
  const selectStage = useUIStore(s => s.selectStage);
  const setRightPanelTab = useUIStore(s => s.setRightPanelTab);
  const setStep = useSimulationStore(s => s.setStep);
  const leftTab = useUIStore(s => s.leftPanelTab);
  const setLeftTab = useUIStore(s => s.setLeftPanelTab);

  if (!project) return null;
  const displayedWorldState = simulatedWorldState ?? project.worldState;

  return (
    <>
      <div className="flex border-b border-studio-border shrink-0">
        {(['project', 'dna', 'libraries'] as const).map(tab => (
          <button key={tab} onClick={() => setLeftTab(tab)}
            className={leftTab === tab ? 'tab-active' : 'tab'}>
            {tab === 'project' ? 'Projeto' : tab === 'dna' ? 'DNA' : 'Biblioteca'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2 text-xs space-y-2">
        {leftTab === 'project' && (
          <div className="space-y-2">
            <div className="panel-header">PROJETO</div>
            <div className="p-2 space-y-1">
              <div><span className="text-studio-muted">Nome:</span> {project.name}</div>
              <div><span className="text-studio-muted">Ambiente:</span> {project.dna.environment}</div>
              <div><span className="text-studio-muted">Construção:</span> {project.dna.finalConstruction}</div>
              <div><span className="text-studio-muted">Materiais:</span> {project.dna.materials.join(', ')}</div>
              <div><span className="text-studio-muted">Duração:</span> {project.dna.config.totalDuration}s</div>
              <div><span className="text-studio-muted">Cenas:</span> {project.scenes.length}</div>
              <div><span className="text-studio-muted">Operações:</span> {project.operations.length}</div>
            </div>

            {project.planning && (
              <>
                <div className="panel-header">INTERPRETAÇÃO DO PLANEJAMENTO</div>
                <div className="p-2 space-y-1 text-[10px]">
                  <div><span className="text-studio-muted">Origem:</span> {project.planning.source}</div>
                  {project.planning.interpretation.map(item => <div key={item}>• {item}</div>)}
                  <details className="text-studio-muted">
                    <summary className="cursor-pointer">Hipóteses explícitas</summary>
                    {project.planning.assumptions.map(item => <div key={item} className="mt-1">• {item}</div>)}
                  </details>
                </div>
              </>
            )}

            {project.visualReconstruction && (
              <>
                <div className="panel-header">RECONSTRUÇÃO VISUAL</div>
                <div className="p-2 space-y-2 text-[10px]">
                  <img src={project.visualReconstruction.referenceImage.dataUrl}
                    alt="Imagem original da reconstrução" className="w-full max-h-36 object-contain rounded border border-studio-border bg-studio-bg" />
                  <div className="text-studio-muted">
                    Original preservado: {project.visualReconstruction.referenceImage.name} · {Math.ceil(project.visualReconstruction.referenceImage.size / 1024)} KB
                  </div>
                  <div className="text-studio-muted">
                    Provider/modelo: {project.visualReconstruction.providerOriginal?.providerId ?? project.visualReconstruction.analysis.providerId} / {project.visualReconstruction.providerModel ?? 'não informado'}
                  </div>
                  <details>
                    <summary className="cursor-pointer text-studio-cyan">Consultar interpretação original</summary>
                    <div className="mt-1 space-y-1">
                      <div>{project.visualReconstruction.providerOriginal?.summary ?? project.visualReconstruction.analysis.summary}</div>
                      {VISUAL_CLAIM_FIELDS.map(field => {
                        const claim = (project.visualReconstruction?.providerOriginal ?? project.visualReconstruction?.analysis)?.claims[field];
                        if (!claim) return null;
                        return <div key={field}><span className={claim.classification === 'FACT' ? 'text-emerald-400' : claim.classification === 'HYPOTHESIS' ? 'text-amber-400' : 'text-studio-muted'}>{claim.classification}</span> · {VISUAL_FIELD_LABELS[field]}</div>;
                      })}
                    </div>
                  </details>
                  <details>
                    <summary className="cursor-pointer text-studio-cyan">Consultar revisão humana</summary>
                    <div className="mt-1 space-y-1">
                      {VISUAL_CLAIM_FIELDS.map(field => {
                        const claim = project.visualReconstruction?.analysis.claims[field];
                        const reviewed = project.visualReconstruction?.reviewedInterpretation?.claims[field];
                        if (!claim) return null;
                        return <div key={field}>
                          <span className={claim.classification === 'FACT' ? 'text-emerald-400' : claim.classification === 'HYPOTHESIS' ? 'text-amber-400' : 'text-studio-muted'}>{claim.classification}</span>
                          {' · '}{VISUAL_FIELD_LABELS[field]} · {reviewed ? VISUAL_ORIGIN_LABELS[reviewed.origin] : 'legado do provider'}
                        </div>;
                      })}
                    </div>
                  </details>
                  <details>
                    <summary className="cursor-pointer text-studio-cyan">Consultar blueprint e origem</summary>
                    <div className="mt-1 space-y-1">
                      {project.operations.map(operation => <div key={operation.id}>• {operation.name}: <span className={operation.visualBasis?.classification === 'FACT' ? 'text-emerald-400' : 'text-amber-400'}>{operation.visualBasis?.classification ?? '—'}</span>{operation.visualBasis ? ` · ${operation.visualBasis.sourceOrigin ?? 'PROVIDER'}${operation.visualBasis.humanConfirmed ? ' · confirmado' : ''}` : ''}</div>)}
                    </div>
                  </details>
                  {project.visualReconstruction.evaluation && (
                    <div className="rounded border border-studio-border bg-studio-bg p-2 space-y-2">
                      <div className="font-semibold text-studio-cyan">AVALIAÇÃO SUPERVISIONADA</div>
                      <div>Categoria: {project.visualReconstruction.evaluation.category}</div>
                      <div>Fiscal: {project.visualReconstruction.evaluation.fiscal.approved ? 'aprovado' : 'reprovado'} · {project.visualReconstruction.evaluation.fiscal.approvedStages}/{project.visualReconstruction.evaluation.fiscal.stageCount} estágios</div>
                      <select aria-label="Decisão da avaliação visual" value={project.visualReconstruction.evaluation.decision}
                        onChange={event => updateVisualEvaluation({ decision: event.target.value as 'pending' | 'approved' | 'rejected' })}
                        className="input-field">
                        <option value="pending">Pendente de revisão</option>
                        <option value="approved">Aprovado</option>
                        <option value="rejected">Reprovado</option>
                      </select>
                      <textarea aria-label="Observações da avaliação visual" value={project.visualReconstruction.evaluation.observations}
                        onChange={event => updateVisualEvaluation({ observations: event.target.value })}
                        placeholder="Observações da revisão humana" className="input-field h-20 resize-y" />
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="panel-header">OPERAÇÕES</div>
            <div className="space-y-1 p-1">
              {project.operations.map((operation, operationIndex) => {
                const scene = project.scenes.find(item => item.operationId === operation.id);
                return (
                  <button key={operation.id} disabled={!scene}
                    onClick={() => {
                      if (!scene) return;
                      const sceneIndex = project.scenes.findIndex(item => item.id === scene.id);
                      selectScene(scene.id);
                      selectStage(0);
                      setStep(1 + sceneIndex * 5);
                      setRightPanelTab('inspector');
                    }}
                    className={`w-full rounded border px-2 py-1.5 text-left disabled:opacity-50 ${selectedSceneId === scene?.id ? 'border-studio-accent bg-studio-accent/10' : 'border-studio-border bg-studio-bg hover:border-studio-cyan'}`}>
                    <div className="font-mono text-[10px]">{operationIndex + 1}. {operation.name}</div>
                    <div className="text-[9px] text-studio-muted">{operation.topology} · {operation.stages.join('/')}%{operation.visualBasis ? ` · ${operation.visualBasis.classification}` : ''}</div>
                  </button>
                );
              })}
            </div>

            <div className="panel-header">WORLD STATE</div>
            <div className="p-2 space-y-1">
              <div><span className="text-studio-muted">Progresso:</span> {displayedWorldState.construction.progress}%</div>
              <div><span className="text-studio-muted">Zona Ativa:</span> {displayedWorldState.activeZone}</div>
              <div><span className="text-studio-muted">Clima:</span> {displayedWorldState.climate}</div>
              <div><span className="text-studio-muted">Câmera:</span> {displayedWorldState.camera}</div>
              <div><span className="text-studio-muted">Componentes:</span> {displayedWorldState.existingComponents.length} existentes, {displayedWorldState.futureComponents.length} futuros</div>
              <div><span className="text-studio-muted">Materiais:</span> {displayedWorldState.materials.length}</div>
              <div><span className="text-studio-muted">Resíduos:</span> {displayedWorldState.residues.length}</div>
            </div>

            <div className="panel-header">PERSONAGEM</div>
            <div className="p-2 space-y-1">
              <div><span className="text-studio-muted">Nome:</span> {project.dna.character.name}</div>
              <div><span className="text-studio-muted">Zona:</span> {displayedWorldState.character.currentZone}</div>
              <div><span className="text-studio-muted">Ação:</span> {displayedWorldState.character.currentAction || '—'}</div>
              <div><span className="text-studio-muted">Ferramenta:</span> {displayedWorldState.character.currentTool || '—'}</div>
            </div>
          </div>
        )}
        {leftTab === 'dna' && (
          <div className="space-y-2">
            <div className="panel-header">PROJECT DNA</div>
            <pre className="bg-studio-bg p-2 rounded text-[10px] text-studio-muted overflow-auto max-h-[70vh] font-mono">
              {JSON.stringify(project.dna, null, 2)}
            </pre>
          </div>
        )}
        {leftTab === 'libraries' && (
          <div className="space-y-2">
            <div className="panel-header">BIBLIOTECAS</div>
            <p className="text-studio-muted p-2">Personagens, terrenos, construções, materiais, câmeras e presets.</p>
          </div>
        )}
      </div>
    </>
  );
}


/* ─── Right Content ─── */
function RightContent({ tab }: { tab: string }) {
  if (tab === 'inspector') return <InspectorView />;
  if (tab === 'fiscal') return <FiscalView />;
  if (tab === 'prompts') return <PromptView />;
  return null;
}

function useSelectedSceneAndStage() {
  const project = useProjectStore(s => s.project);
  const selectedSceneId = useUIStore(s => s.selectedSceneId);
  const selectedStagePercentage = useUIStore(s => s.selectedStagePercentage);
  const scene = project?.scenes.find(item => item.id === selectedSceneId) ?? project?.scenes[0];
  const stage = scene?.stages.find(item => item.percentage === selectedStagePercentage) ?? scene?.stages[0];
  return { project, scene, stage };
}

/* ─── Inspector View ─── */
function InspectorView() {
  const { project, scene, stage } = useSelectedSceneAndStage();
  const debugMode = useUIStore(s => s.debugMode);
  const selectStage = useUIStore(s => s.selectStage);
  const setStep = useSimulationStore(s => s.setStep);
  const [snapshotNotice, setSnapshotNotice] = useState('');

  if (!project) return null;
  const sceneIndex = scene ? project.scenes.findIndex(item => item.id === scene.id) : -1;

  return (
    <div className="space-y-2 text-xs">
      <div className="panel-header">INSPETOR DE CENA</div>
      {!scene || !stage ? (
        <p className="text-studio-muted p-2">Selecione uma cena na timeline para inspecionar.</p>
      ) : (
        <div className="p-2 space-y-3">
          <div className="space-y-1">
            <div><span className="text-studio-muted">Cena:</span> {scene.number} — {scene.operationId}</div>
            <div><span className="text-studio-muted">Zona:</span> {stage.activeZone}</div>
            <div><span className="text-studio-muted">Ação:</span> {stage.physicalAction}</div>
            <div><span className="text-studio-muted">Ferramenta:</span> {stage.tool || 'marcação/inspeção'}</div>
          </div>

          <div>
            <div className="text-studio-muted mb-1">Progressão</div>
            <div className="grid grid-cols-5 gap-1">
              {scene.stages.map((item, stageIndex) => (
                <button key={item.percentage}
                  onClick={() => {
                    selectStage(item.percentage);
                    setStep(1 + sceneIndex * 5 + stageIndex);
                  }}
                  className={`rounded px-1 py-1 font-mono ${stage.percentage === item.percentage ? 'bg-studio-accent text-black' : 'bg-studio-card text-studio-muted'}`}>
                  {item.percentage}%
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <div><span className="text-studio-muted">Rota:</span> {stage.workRoute?.join(' → ') || 'sem deslocamento'}</div>
            <div><span className="text-studio-muted">Mudanças permitidas:</span> {stage.allowedChanges.join(', ') || 'nenhuma'}</div>
            <div><span className="text-studio-muted">Elementos futuros:</span> {stage.futureElements.join(', ') || 'nenhum'}</div>
            <div><span className="text-studio-muted">Elementos completos:</span> {stage.physicalState?.completedElements.join(', ') || 'nenhum'}</div>
            <div><span className="text-studio-muted">Elementos parciais:</span> {stage.physicalState?.partialElements.join(', ') || 'nenhum'}</div>
          </div>

          <button onClick={() => {
            setStep(1 + sceneIndex * 5 + scene.stages.findIndex(item => item.percentage === stage.percentage));
            setSnapshotNotice(`Snapshot da cena ${scene.number} em ${stage.percentage}% restaurado na simulação.`);
          }} className="btn-secondary w-full">
            ↺ Restaurar snapshot na simulação
          </button>
          {snapshotNotice && <p role="status" className="text-[10px] text-emerald-400">{snapshotNotice}</p>}

          <div>
            <div className="text-studio-muted mb-1">Execution Proof</div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              {stage.executionProof && Object.entries(stage.executionProof).map(([key, value]) => (
                <div key={key} className="flex justify-between bg-studio-bg rounded px-1 py-0.5">
                  <span>{key}</span>
                  <span className={value ? 'text-emerald-400' : stage.percentage === 0 ? 'text-studio-muted' : 'text-rose-400'}>{value ? '✓' : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {debugMode && (
        <div className="mt-4">
          <div className="panel-header">🛠 SYSTEM INSPECTOR</div>
          <div className="p-2 space-y-2">
            <details>
              <summary className="cursor-pointer text-studio-accent">Project DNA</summary>
              <pre className="text-[9px] bg-studio-bg p-1 rounded mt-1 overflow-auto max-h-40 font-mono text-studio-muted">
                {JSON.stringify(project.dna, null, 2)}
              </pre>
            </details>
            <details>
              <summary className="cursor-pointer text-studio-accent">World State</summary>
              <pre className="text-[9px] bg-studio-bg p-1 rounded mt-1 overflow-auto max-h-40 font-mono text-studio-muted">
                {JSON.stringify(stage?.worldStateAfter ?? project.worldState, null, 2)}
              </pre>
            </details>
            <details>
              <summary className="cursor-pointer text-studio-accent">Spatial Map</summary>
              <pre className="text-[9px] bg-studio-bg p-1 rounded mt-1 overflow-auto max-h-40 font-mono text-studio-muted">
                {JSON.stringify(project.spatialMap, null, 2)}
              </pre>
            </details>
            <details>
              <summary className="cursor-pointer text-studio-accent">Dependency Graph</summary>
              <pre className="text-[9px] bg-studio-bg p-1 rounded mt-1 overflow-auto max-h-40 font-mono text-studio-muted">
                {JSON.stringify(project.dependencyGraph, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Fiscal View ─── */
function FiscalView() {
  const { project, scene, stage } = useSelectedSceneAndStage();
  const lockScene = useProjectStore(s => s.lockScene);
  const updateScene = useProjectStore(s => s.updateScene);
  const [auditNotice, setAuditNotice] = useState('');
  const checks = [
    ['Dependências', 'dependencies'],
    ['Temporal', 'temporal'],
    ['Espacial', 'spatial'],
    ['Causalidade', 'causality'],
    ['Conservação', 'conservation'],
    ['Personagem', 'character'],
    ['Ferramentas', 'tools'],
    ['Visibilidade', 'visibility'],
    ['Progressão', 'progression'],
  ] as const;

  return (
    <div className="space-y-2 text-xs">
      <div className="panel-header">PAINEL FISCAL</div>
      {!scene || !stage ? (
        <p className="text-studio-muted p-2">Selecione uma cena e um estágio.</p>
      ) : (
        <div className="p-2 space-y-1.5">
          <div className="text-[10px] text-studio-muted mb-2">Cena {scene.number} · estágio {stage.percentage}%</div>
          {checks.map(([label, key]) => (
            <div key={key} className="flex justify-between items-center py-0.5">
              <span className="text-studio-muted">{label}</span>
              <span className={stage.validations[key] ? 'text-emerald-400' : 'text-rose-400'}>
                {stage.validations[key] ? '✓ OK' : '✕ Falha'}
              </span>
            </div>
          ))}
        </div>
      )}

      {scene && stage && project && (
        <button onClick={() => {
          try {
            const report = auditProjectStage(project, scene, stage);
            updateScene(scene.id, {
              stages: scene.stages.map(item => item.percentage === stage.percentage ? {
                ...item,
                validations: report.results,
                qualityScore: report.qualityScore,
                jumpRisk: report.jumpRisk,
              } : item),
              status: report.approved ? 'validated' : 'draft',
              riskLevel: report.jumpRisk,
            });
            setAuditNotice(`Fiscal executado: ${report.status.toUpperCase()} · score ${report.qualityScore.overall}.`);
          } catch (cause) {
            setAuditNotice(cause instanceof Error ? cause.message : 'Falha ao executar o Fiscal.');
          }
        }} disabled={scene.status === 'locked'} className="btn-secondary w-full disabled:opacity-50">
          ▶ Executar Fiscal novamente
        </button>
      )}
      {auditNotice && <p role="status" className="text-[10px] text-studio-cyan px-2">{auditNotice}</p>}

      <div className="panel-header">RASTREIO POR REGRA</div>
      <div className="p-2 space-y-1 max-h-56 overflow-auto">
        {stage?.validations.checks?.map(check => (
          <details key={check.ruleId} className="rounded border border-studio-border bg-studio-bg px-2 py-1">
            <summary className="cursor-pointer flex items-center justify-between gap-2">
              <span>{check.rule}</span>
              <span className={check.status === 'PASS' ? 'text-emerald-400' : check.status === 'WARNING' ? 'text-amber-400' : 'text-rose-400'}>
                {check.status}
              </span>
            </summary>
            <p className="text-[10px] text-studio-muted mt-1">{check.explanation}</p>
          </details>
        )) ?? <p className="text-studio-muted">Projeto legado sem rastreio por regra; execute o Fiscal para gerar.</p>}
      </div>

      <div className="panel-header">OCORRÊNCIAS</div>
      <div className="p-2 space-y-1 max-h-36 overflow-auto">
        {!stage || stage.validations.errors.length === 0 ? (
          <p className="text-emerald-400">Nenhum erro automático.</p>
        ) : stage.validations.errors.map((error, index) => (
          <div key={`${error.code}-${index}`} className={error.severity === 'ERROR' ? 'text-rose-400' : 'text-studio-muted'}>
            <span className="font-mono">{error.code}</span> · {error.message}
          </div>
        ))}
      </div>

      <div className="panel-header">SCORE DE QUALIDADE</div>
      <div className="p-2">
        {stage?.qualityScore ? (
          <div className="flex items-end justify-between">
            <span className="text-3xl font-mono text-studio-accent">{stage.qualityScore.overall}</span>
            <span className={`badge ${stage.jumpRisk === 'HIGH' ? 'badge-error' : stage.jumpRisk === 'MEDIUM' ? 'badge-warning' : 'badge-success'}`}>
              risco {stage.jumpRisk}
            </span>
          </div>
        ) : <p className="text-studio-muted">Sem score.</p>}
      </div>

      <div className="panel-header">APROVAÇÃO</div>
      <button
        disabled={!scene || !stage?.validations.approved || scene.status === 'locked'}
        onClick={() => scene && lockScene(scene.id)}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed mt-1">
        ✅ APROVAR E BLOQUEAR
      </button>
      <p className="text-[10px] text-studio-muted px-2">
        {scene?.status === 'locked' ? 'Cena aprovada e bloqueada.' : 'Disponível quando todos os fiscais automáticos aprovarem.'}
      </p>
    </div>
  );
}

/* ─── Prompt View ─── */
function PromptView() {
  const { project, scene, stage } = useSelectedSceneAndStage();
  const updateScene = useProjectStore(s => s.updateScene);
  const config = usePromptStore(s => s.config);
  const setConfig = usePromptStore(s => s.setConfig);
  const editedText = usePromptStore(s => s.editedText);
  const startEditing = usePromptStore(s => s.startEditing);
  const updateEditedText = usePromptStore(s => s.updateEditedText);
  const copyToClipboard = usePromptStore(s => s.copyToClipboard);
  const [promptNotice, setPromptNotice] = useState('');
  const rawPrompt = config.platform === 'nano_banana'
    ? stage?.prompts?.nanoBanana ?? ''
    : stage?.prompts?.kling ?? '';

  useEffect(() => {
    startEditing(rawPrompt);
  }, [rawPrompt, startEditing]);

  return (
    <div className="space-y-2 text-xs">
      <div className="panel-header">GERADOR DE PROMPTS</div>
      <div className="p-2 space-y-3">
        {scene && stage && <div className="text-[10px] text-studio-muted">Cena {scene.number} · {stage.percentage}% · zona {stage.activeZone}</div>}
        <div>
          <label className="text-studio-muted block mb-1">Plataforma</label>
          <select value={config.platform}
            onChange={event => {
              const platform = event.target.value as 'kling' | 'nano_banana';
              setConfig({ platform, maxCharacters: platform === 'kling' ? 1400 : 3000 });
            }}
            className="select-field">
            <option value="kling">Kling (1400 chars)</option>
            <option value="nano_banana">Nano Banana</option>
          </select>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-studio-muted">Prompt Gerado</label>
            <span className={`font-mono ${editedText.length <= config.maxCharacters ? 'text-studio-muted' : 'text-rose-400'}`}>
              {editedText.length} / {config.maxCharacters}
            </span>
          </div>
          <textarea value={editedText} onChange={event => updateEditedText(event.target.value)}
            className="input-field h-56 resize-none font-mono text-[10px]"
            placeholder="Selecione uma cena para gerar o prompt..." />
        </div>

        <button disabled={!project || !scene || !stage?.worldStateBefore}
          onClick={() => {
            if (!project || !scene || !stage?.worldStateBefore) return;
            const previousScene = project.scenes[project.scenes.findIndex(item => item.id === scene.id) - 1];
            const nanoBanana = generateNanoBananaPrompt(
              scene, stage, stage.worldStateBefore, project.dna, project.spatialMap, previousScene,
            ).fullText;
            const kling = generateKlingPrompt(scene, stage, stage.worldStateBefore, project.dna).fullText;
            updateScene(scene.id, {
              stages: scene.stages.map(item => item.percentage === stage.percentage
                ? { ...item, prompts: { visual: '', nanoBanana, kling } }
                : item),
            });
            startEditing(config.platform === 'nano_banana' ? nanoBanana : kling);
            setPromptNotice(`Prompt ${config.platform === 'nano_banana' ? 'Nano Banana' : 'Kling'} regenerado do snapshot auditado.`);
          }} className="btn-secondary w-full disabled:opacity-50">
          ↻ Gerar novamente do estágio real
        </button>
        {promptNotice && <p role="status" className="text-[10px] text-emerald-400">{promptNotice}</p>}

        <div className="flex gap-2">
          <button disabled={!editedText} onClick={() => copyToClipboard(editedText)}
            className="btn-secondary flex-1 disabled:opacity-50">📋 Copiar</button>
          <button disabled={!editedText}
            onClick={() => updateEditedText(optimizePrompt(editedText, config.maxCharacters, config.platform).text)}
            className="btn-primary flex-1 disabled:opacity-50">⚡ Otimizar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── App Root ─── */
export default function App() {
  const currentScreen = useUIStore(s => s.currentScreen);

  return currentScreen === 'home' || currentScreen === 'setup'
    ? <HomeScreen />
    : <ProjectScreen />;
}
