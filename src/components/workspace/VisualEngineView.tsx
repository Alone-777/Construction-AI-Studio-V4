import { useVisualEngineStore } from '../../store/useVisualEngineStore';
import { useUIStore } from '../../store/useUIStore';
import { useState } from 'react';
import type { VisualElement, Point, SceneMetadata, SceneAction, CameraConfig, LightingConfig, VisualSceneState } from '../../core/visual/VisualSceneState';
import type { VisualDNA } from '../../core/types/project';
import { compileVisualScene, compileVisualSceneCompositionOnly, type VisualPromptResult } from '../../core/visual/VisualPromptCompiler';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function createDefaultElement(type: VisualElement['type']): VisualElement {
  const baseElement: VisualElement = {
    id: generateId(),
    type,
    name: '',
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: 1,
    visible: true,
    layer: 0,
    metadata: {}
  };

  switch (type) {
    case 'character':
      return { ...baseElement, name: 'Personagem', layer: 10 };
    case 'construction':
      return { ...baseElement, name: 'Construção', layer: 5 };
    case 'material':
      return { ...baseElement, name: 'Material', layer: 3 };
    case 'tool':
      return { ...baseElement, name: 'Ferramenta', layer: 4 };
    case 'prop':
      return { ...baseElement, name: 'Objeto', layer: 2 };
    case 'effect':
      return { ...baseElement, name: 'Efeito', layer: 15 };
    default:
      return baseElement;
  }
}

export function VisualEngineView() {
  const visualSceneState = useVisualEngineStore(s => s.visualSceneState);
  const isGenerating = useVisualEngineStore(s => s.isGenerating);
  const generationProgress = useVisualEngineStore(s => s.generationProgress);
  const generationError = useVisualEngineStore(s => s.generationError);
  const lastGeneratedPrompt = useVisualEngineStore(s => s.lastGeneratedPrompt);
  const rightPanelTab = useUIStore(s => s.rightPanelTab);
  const setRightPanelTab = useUIStore(s => s.setRightPanelTab);

  const updateSceneMetadata = useVisualEngineStore(s => s.updateSceneMetadata);
  const updateVisualSceneState = useVisualEngineStore(s => s.updateVisualSceneState);
  const addVisualElement = useVisualEngineStore(s => s.addVisualElement);
  const removeVisualElement = useVisualEngineStore(s => s.removeVisualElement);
  const updateVisualElement = useVisualEngineStore(s => s.updateVisualElement);
  const updateCameraConfig = useVisualEngineStore(s => s.updateCameraConfig);
  const updateLens = useVisualEngineStore(s => s.updateLens);
  const updateLighting = useVisualEngineStore(s => s.updateLighting);
  const updateAction = useVisualEngineStore(s => s.updateAction);

  const [showAddElementModal, setShowAddElementModal] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingElement, setEditingElement] = useState<VisualElement | null>(null);
  const [compiledPrompt, setCompiledPrompt] = useState<VisualPromptResult | null>(null);
  const [showPromptOutput, setShowPromptOutput] = useState(false);

  if (!visualSceneState) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-studio-muted">
        <div className="text-center">
          <div className="text-4xl mb-4">🎬</div>
          <p className="text-lg">Nenhuma cena carregada no Visual Engine</p>
          <p className="text-sm mt-2">Selecione um projeto e uma cena para começar</p>
        </div>
      </div>
    );
  }

  const { scene, cameraConfig, lens, lighting, elements, action, environment, construction, renderStatus, activeZone } = visualSceneState;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const parsedValue = type === 'number' ? parseFloat(value) : value;
    return parsedValue;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="panel-header">
        <div className="flex items-center justify-between">
          <span>VISUAL SCENE COMPOSER</span>
          <div className="flex items-center gap-2">
            {isGenerating && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-studio-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-studio-accent transition-all duration-300"
                    style={{ width: `${generationProgress * 100}%` }}
                  />
                </div>
                <span className="text-xs text-studio-muted">{Math.round(generationProgress * 100)}%</span>
              </div>
            )}
            {generationError && (
              <span className="badge badge-error text-xs" title={generationError}>
                Erro: {generationError.slice(0, 30)}...
              </span>
            )}
            <button
              onClick={() => {
                if (visualSceneState) {
                  // Extract visualDNA if present (from project.visualDNA)
                  const visualDNA = (visualSceneState as any).visualDNA as VisualDNA | undefined;
                  const result = compileVisualScene(visualSceneState, visualDNA);
                  setCompiledPrompt(result);
                  setShowPromptOutput(true);
                }
              }}
              className="btn-sm btn-primary"
              title="Gerar Prompt Visual"
              disabled={!visualSceneState}
            >
              🎬 Gerar Prompt Visual
            </button>
            <button
              onClick={() => setRightPanelTab('prompts')}
              className={`btn-sm ${rightPanelTab === 'prompts' ? 'btn-primary' : ''}`}
              title="Ver Prompts"
            >
              📝 Prompts
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* PAINEL ESQUERDO - PAINEL CENA */}
        <div className="w-72 border-r border-studio-border flex flex-col bg-studio-bg/50">
          <div className="p-3 border-b border-studio-border bg-studio-card">
            <h4 className="font-semibold text-studio-text flex items-center gap-2">
              <span>🎬</span> PAINEL CENA
            </h4>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-4">
            {/* Título e Descrição */}
            <div className="panel space-y-3">
              <h5 className="font-mono text-xs text-studio-muted uppercase tracking-wide">METADADOS</h5>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-studio-muted mb-1">Título</label>
                  <input
                    type="text"
                    name="title"
                    value={scene.title}
                    onChange={(e) => updateSceneMetadata({ title: e.target.value })}
                    className="w-full input-sm"
                    placeholder="Título da cena"
                  />
                </div>
                <div>
                  <label className="block text-xs text-studio-muted mb-1">Descrição</label>
                  <textarea
                    name="description"
                    value={scene.description}
                    onChange={(e) => updateSceneMetadata({ description: e.target.value })}
                    className="w-full input-sm h-16 resize-none"
                    placeholder="Descrição da cena..."
                  />
                </div>
                <div>
                  <label className="block text-xs text-studio-muted mb-1">Tipo de Local</label>
                  <input
                    type="text"
                    name="locationType"
                    value={scene.locationType}
                    onChange={(e) => updateSceneMetadata({ locationType: e.target.value })}
                    className="w-full input-sm"
                    placeholder="Ex: Floresta, Urbano, Interior, etc."
                  />
                </div>
              </div>
            </div>

            {/* Ambiente */}
            <div className="panel space-y-3">
              <h5 className="font-mono text-xs text-studio-muted uppercase tracking-wide">AMBIENTE</h5>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-studio-muted mb-1">Horário</label>
                  <select
                    name="timeOfDay"
                    value={scene.timeOfDay}
                    onChange={(e) => updateSceneMetadata({ timeOfDay: e.target.value as SceneMetadata['timeOfDay'] })}
                    className="w-full input-sm"
                  >
                    <option value="dawn">Amanhecer</option>
                    <option value="day">Dia</option>
                    <option value="dusk">Entardecer</option>
                    <option value="night">Noite</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-studio-muted mb-1">Clima</label>
                  <select
                    name="weather"
                    value={scene.weather}
                    onChange={(e) => updateSceneMetadata({ weather: e.target.value as SceneMetadata['weather'] })}
                    className="w-full input-sm"
                  >
                    <option value="clear">Limpo</option>
                    <option value="cloudy">Nublado</option>
                    <option value="rain">Chuva</option>
                    <option value="storm">Tempestade</option>
                    <option value="fog">Névoa</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Terreno</label>
                    <input
                      type="text"
                      name="terrainType"
                      value={environment.terrain.type}
                      onChange={(e) => updateVisualSceneState({ environment: { ...environment, terrain: { ...environment.terrain, type: e.target.value } } })}
                      className="w-full input-sm"
                      placeholder="Tipo"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Inclinação</label>
                    <input
                      type="text"
                      name="terrainSlope"
                      value={environment.terrain.slope}
                      onChange={(e) => updateVisualSceneState({ environment: { ...environment, terrain: { ...environment.terrain, slope: e.target.value } } })}
                      className="w-full input-sm"
                      placeholder="Inclinação"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Ação */}
            <div className="panel space-y-3">
              <h5 className="font-mono text-xs text-studio-muted uppercase tracking-wide">AÇÃO</h5>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-studio-muted mb-1">Tipo de Ação</label>
                  <select
                    name="actionType"
                    value={action.type}
                    onChange={(e) => updateAction({ type: e.target.value as SceneAction['type'] })}
                    className="w-full input-sm"
                  >
                    <option value="idle">Ocioso</option>
                    <option value="walk">Caminhar</option>
                    <option value="build">Construir</option>
                    <option value="craft">Artesanato</option>
                    <option value="inspect">Inspecionar</option>
                    <option value="move_object">Mover Objeto</option>
                    <option value="custom">Personalizado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-studio-muted mb-1">Descrição</label>
                  <input
                    type="text"
                    name="actionDescription"
                    value={action.description}
                    onChange={(e) => updateAction({ description: e.target.value })}
                    className="w-full input-sm"
                    placeholder="Descrição da ação"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Início (s)</label>
                    <input
                      type="number"
                      name="actionStartTime"
                      value={action.startTime}
                      onChange={(e) => updateAction({ startTime: parseFloat(e.target.value) })}
                      className="w-full input-sm"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Duração (s)</label>
                    <input
                      type="number"
                      name="actionDuration"
                      value={action.duration}
                      onChange={(e) => updateAction({ duration: parseFloat(e.target.value) })}
                      className="w-full input-sm"
                      step="0.1"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PAINEL CENTRAL - PAINEL CÂMERA E LENTE */}
        <div className="w-72 border-r border-studio-border flex flex-col bg-studio-bg/50">
          <div className="p-3 border-b border-studio-border bg-studio-card">
            <h4 className="font-semibold text-studio-text flex items-center gap-2">
              <span>📷</span> PAINEL CÂMERA
            </h4>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-4">
            {/* Posição da Câmera */}
            <div className="panel space-y-3">
              <h5 className="font-mono text-xs text-studio-muted uppercase tracking-wide">POSIÇÃO E MOVIMENTO</h5>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Pos X</label>
                    <input
                      type="number"
                      name="camPosX"
                      value={cameraConfig.position.x}
                      onChange={(e) => updateCameraConfig({ position: { ...cameraConfig.position, x: parseFloat(e.target.value) } })}
                      className="w-full input-sm"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Pos Y</label>
                    <input
                      type="number"
                      name="camPosY"
                      value={cameraConfig.position.y}
                      onChange={(e) => updateCameraConfig({ position: { ...cameraConfig.position, y: parseFloat(e.target.value) } })}
                      className="w-full input-sm"
                      step="0.1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Target X</label>
                    <input
                      type="number"
                      name="camTargetX"
                      value={cameraConfig.target.x}
                      onChange={(e) => updateCameraConfig({ target: { ...cameraConfig.target, x: parseFloat(e.target.value) } })}
                      className="w-full input-sm"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Target Y</label>
                    <input
                      type="number"
                      name="camTargetY"
                      value={cameraConfig.target.y}
                      onChange={(e) => updateCameraConfig({ target: { ...cameraConfig.target, y: parseFloat(e.target.value) } })}
                      className="w-full input-sm"
                      step="0.1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-studio-muted mb-1">Tipo de Movimento</label>
                  <select
                    name="camMovement"
                    value={cameraConfig.movement}
                    onChange={(e) => updateCameraConfig({ movement: e.target.value as CameraConfig['movement'] })}
                    className="w-full input-sm"
                  >
                    <option value="FIXA">Fixa</option>
                    <option value="FOLLOW">Follow</option>
                    <option value="CUT">Cut</option>
                    <option value="DOLLY">Dolly</option>
                    <option value="PAN">Pan</option>
                    <option value="TILT">Tilt</option>
                    <option value="CRANE">Crane</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">FOV</label>
                    <input
                      type="number"
                      name="camFov"
                      value={cameraConfig.fov}
                      onChange={(e) => updateCameraConfig({ fov: parseFloat(e.target.value) })}
                      className="w-full input-sm"
                      step="1"
                      min="10"
                      max="180"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Aspect Ratio</label>
                    <input
                      type="number"
                      name="camAspect"
                      value={cameraConfig.aspectRatio}
                      onChange={(e) => updateCameraConfig({ aspectRatio: parseFloat(e.target.value) })}
                      className="w-full input-sm"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Lente */}
            <div className="panel space-y-3">
              <h5 className="font-mono text-xs text-studio-muted uppercase tracking-wide">LENTE</h5>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Focal Length (mm)</label>
                    <input
                      type="number"
                      name="lensFocal"
                      value={lens.focalLength}
                      onChange={(e) => updateLens({ focalLength: parseFloat(e.target.value) })}
                      className="w-full input-sm"
                      step="1"
                      min="8"
                      max="600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Abertura</label>
                    <input
                      type="text"
                      name="lensAperture"
                      value={lens.aperture}
                      onChange={(e) => updateLens({ aperture: e.target.value })}
                      className="w-full input-sm"
                      placeholder="f/2.8"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Dist. Foco</label>
                    <input
                      type="number"
                      name="lensFocus"
                      value={lens.focusDistance}
                      onChange={(e) => updateLens({ focusDistance: parseFloat(e.target.value) })}
                      className="w-full input-sm"
                      step="0.1"
                      min="0.1"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        name="lensDof"
                        checked={lens.depthOfField}
                        onChange={(e) => updateLens({ depthOfField: e.target.checked })}
                        className="checkbox checkbox-sm"
                      />
                      <span className="text-xs text-studio-text">Depth of Field</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Iluminação */}
            <div className="panel space-y-3">
              <h5 className="font-mono text-xs text-studio-muted uppercase tracking-wide">ILUMINAÇÃO</h5>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-studio-muted mb-1">Tipo</label>
                  <select
                    name="lightType"
                    value={lighting.type}
                    onChange={(e) => updateLighting({ type: e.target.value as LightingConfig['type'] })}
                    className="w-full input-sm"
                  >
                    <option value="natural">Natural</option>
                    <option value="artificial">Artificial</option>
                    <option value="mixed">Misto</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Key Intensity</label>
                    <input
                      type="number"
                      name="keyIntensity"
                      value={lighting.keyLight.intensity}
                      onChange={(e) => updateLighting({ keyLight: { ...lighting.keyLight, intensity: parseFloat(e.target.value) } })}
                      className="w-full input-sm"
                      step="0.1"
                      min="0"
                      max="5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Key Temp (K)</label>
                    <input
                      type="number"
                      name="keyTemp"
                      value={lighting.keyLight.temperature}
                      onChange={(e) => updateLighting({ keyLight: { ...lighting.keyLight, temperature: parseFloat(e.target.value) } })}
                      className="w-full input-sm"
                      step="100"
                      min="1000"
                      max="10000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Fill Intensity</label>
                    <input
                      type="number"
                      name="fillIntensity"
                      value={lighting.fillLight?.intensity || 0}
                      onChange={(e) => updateLighting({ fillLight: { ...(lighting.fillLight || { direction: { x: -1, y: -0.5 }, intensity: 0, color: '#ffffff' }), intensity: parseFloat(e.target.value) } })}
                      className="w-full input-sm"
                      step="0.1"
                      min="0"
                      max="2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-studio-muted mb-1">Ambient Intensity</label>
                    <input
                      type="number"
                      name="ambientIntensity"
                      value={lighting.ambientLight?.intensity || 0}
                      onChange={(e) => updateLighting({ ambientLight: { ...(lighting.ambientLight || { intensity: 0, color: '#ffffff' }), intensity: parseFloat(e.target.value) } })}
                      className="w-full input-sm"
                      step="0.1"
                      min="0"
                      max="1"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      name="lightShadows"
                      checked={lighting.shadows}
                      onChange={(e) => updateLighting({ shadows: e.target.checked })}
                      className="checkbox checkbox-sm"
                    />
                    <span className="text-xs text-studio-text">Sombras</span>
                  </label>
                  <div className="flex-1">
                    <label className="block text-xs text-studio-muted mb-1">Softness</label>
                    <input
                      type="range"
                      name="shadowSoftness"
                      value={lighting.shadowSoftness}
                      onChange={(e) => updateLighting({ shadowSoftness: parseFloat(e.target.value) })}
                      className="w-full"
                      min="0"
                      max="1"
                      step="0.05"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PAINEL DIREITO - PAINEL ELEMENTOS */}
        <div className="w-72 flex flex-col bg-studio-bg/50">
          <div className="p-3 border-b border-studio-border bg-studio-card flex items-center justify-between">
            <h4 className="font-semibold text-studio-text flex items-center gap-2">
              <span>🧱</span> PAINEL ELEMENTOS
            </h4>
            <button
              onClick={() => { setShowAddElementModal(true); setEditingElement(null); }}
              className="btn-sm btn-primary"
            >
              + Adicionar
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {elements.length === 0 ? (
              <div className="text-center text-studio-muted py-8">
                <p className="text-sm">Nenhum elemento visual</p>
                <p className="text-xs mt-1">Clique em "Adicionar" para criar</p>
              </div>
            ) : (
              <div className="space-y-2">
                {elements.map((element, index) => (
                  <div
                    key={element.id}
                    className={`panel p-2 ${selectedElementId === element.id ? 'ring-2 ring-studio-accent' : ''}`}
                    onClick={() => setSelectedElementId(selectedElementId === element.id ? null : element.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {element.type === 'character' && '👤'}
                          {element.type === 'construction' && '🏗️'}
                          {element.type === 'material' && '📦'}
                          {element.type === 'tool' && '🔨'}
                          {element.type === 'prop' && '📦'}
                          {element.type === 'effect' && '✨'}
                        </span>
                        <div>
                          <div className="font-mono text-xs">{element.name || 'Sem nome'}</div>
                          <div className="text-[10px] text-studio-muted">
                            {element.type} · Layer {element.layer} · {element.visible ? '👁️' : '🙈'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingElement(element); setShowAddElementModal(true); }}
                          className="btn-ghost btn-xs p-1"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeVisualElement(element.id); }}
                          className="btn-ghost btn-xs p-1 text-rose-400 hover:text-rose-300"
                          title="Remover"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    {selectedElementId === element.id && (
                      <div className="mt-2 pt-2 border-t border-studio-border space-y-1 text-xs">
                        <div className="grid grid-cols-2 gap-1">
                          <div>
                            <label className="text-[10px] text-studio-muted">Pos X</label>
                            <input
                              type="number"
                              value={element.position.x}
                              onChange={(e) => updateVisualElement(element.id, { position: { ...element.position, x: parseFloat(e.target.value) } })}
                              className="w-full input-sm h-6 text-xs"
                              step="0.1"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-studio-muted">Pos Y</label>
                            <input
                              type="number"
                              value={element.position.y}
                              onChange={(e) => updateVisualElement(element.id, { position: { ...element.position, y: parseFloat(e.target.value) } })}
                              className="w-full input-sm h-6 text-xs"
                              step="0.1"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-studio-muted">Rotation</label>
                            <input
                              type="number"
                              value={element.rotation}
                              onChange={(e) => updateVisualElement(element.id, { rotation: parseFloat(e.target.value) })}
                              className="w-full input-sm h-6 text-xs"
                              step="1"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-studio-muted">Scale</label>
                            <input
                              type="number"
                              value={element.scale}
                              onChange={(e) => updateVisualElement(element.id, { scale: parseFloat(e.target.value) })}
                              className="w-full input-sm h-6 text-xs"
                              step="0.1"
                              min="0.1"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-studio-muted">Layer</label>
                            <input
                              type="number"
                              value={element.layer}
                              onChange={(e) => updateVisualElement(element.id, { layer: parseInt(e.target.value) })}
                              className="w-full input-sm h-6 text-xs"
                            />
                          </div>
                          <div className="flex items-end">
                            <label className="flex items-center gap-1 cursor-pointer w-full">
                              <input
                                type="checkbox"
                                checked={element.visible}
                                onChange={(e) => updateVisualElement(element.id, { visible: e.target.checked })}
                                className="checkbox checkbox-sm"
                              />
                              <span className="text-[10px] text-studio-text">Visível</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Adicionar/Editar Elemento */}
          {showAddElementModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-studio-card rounded-lg border border-studio-border w-full max-w-md max-h-[80vh] overflow-auto">
                <div className="p-4 border-b border-studio-border flex items-center justify-between">
                  <h4 className="font-semibold">{editingElement ? 'Editar Elemento' : 'Adicionar Elemento'}</h4>
                  <button
                    onClick={() => { setShowAddElementModal(false); setEditingElement(null); }}
                    className="btn-ghost btn-sm"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  {!editingElement && (
                    <div className="grid grid-cols-2 gap-2">
                      {(['character', 'construction', 'material', 'tool', 'prop', 'effect'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => {
                            const newElement = createDefaultElement(type);
                            addVisualElement(newElement);
                            setShowAddElementModal(false);
                          }}
                          className="panel p-3 text-center hover:bg-studio-border/50"
                        >
                          <div className="text-2xl mb-1">
                            {type === 'character' && '👤'}
                            {type === 'construction' && '🏗️'}
                            {type === 'material' && '📦'}
                            {type === 'tool' && '🔨'}
                            {type === 'prop' && '📦'}
                            {type === 'effect' && '✨'}
                          </div>
                          <div className="text-xs font-mono capitalize">{type}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {editingElement && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-studio-muted mb-1">Nome</label>
                        <input
                          type="text"
                          value={editingElement.name}
                          onChange={(e) => updateVisualElement(editingElement.id, { name: e.target.value })}
                          className="w-full input-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-studio-muted mb-1">Pos X</label>
                          <input
                            type="number"
                            value={editingElement.position.x}
                            onChange={(e) => updateVisualElement(editingElement.id, { position: { ...editingElement.position, x: parseFloat(e.target.value) } })}
                            className="w-full input-sm"
                            step="0.1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-studio-muted mb-1">Pos Y</label>
                          <input
                            type="number"
                            value={editingElement.position.y}
                            onChange={(e) => updateVisualElement(editingElement.id, { position: { ...editingElement.position, y: parseFloat(e.target.value) } })}
                            className="w-full input-sm"
                            step="0.1"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-studio-muted mb-1">Rotation</label>
                          <input
                            type="number"
                            value={editingElement.rotation}
                            onChange={(e) => updateVisualElement(editingElement.id, { rotation: parseFloat(e.target.value) })}
                            className="w-full input-sm"
                            step="1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-studio-muted mb-1">Scale</label>
                          <input
                            type="number"
                            value={editingElement.scale}
                            onChange={(e) => updateVisualElement(editingElement.id, { scale: parseFloat(e.target.value) })}
                            className="w-full input-sm"
                            step="0.1"
                            min="0.1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-studio-muted mb-1">Layer</label>
                          <input
                            type="number"
                            value={editingElement.layer}
                            onChange={(e) => updateVisualElement(editingElement.id, { layer: parseInt(e.target.value) })}
                            className="w-full input-sm"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingElement.visible}
                            onChange={(e) => updateVisualElement(editingElement.id, { visible: e.target.checked })}
                            className="checkbox checkbox-sm"
                          />
                          <span className="text-xs text-studio-text">Visível</span>
                        </label>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => { setShowAddElementModal(false); setEditingElement(null); }}
                          className="btn-sm"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de saída do prompt compilado */}
      {showPromptOutput && compiledPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-studio-card rounded-lg border border-studio-border w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="p-4 border-b border-studio-border flex items-center justify-between">
              <h4 className="font-semibold">Prompt Visual Compilado</h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(compiledPrompt.prompt)}
                  className="btn-sm btn-primary"
                  title="Copiar prompt completo"
                >
              📋 Copiar
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(compileVisualSceneCompositionOnly(visualSceneState!))}
                  className="btn-sm"
                  title="Copiar apenas composição (sem ação)"
                >
              📋 Composição
                </button>
                <button
                  onClick={() => { setShowPromptOutput(false); setCompiledPrompt(null); }}
                  className="btn-ghost btn-sm"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
              <div className="panel p-4 font-mono text-xs whitespace-pre-wrap bg-studio-bg/50 border border-studio-border rounded max-h-[50vh] overflow-auto">
                {compiledPrompt.prompt}
              </div>

              <details className="panel p-4">
                <summary className="font-mono text-xs text-studio-muted cursor-pointer">Metadados da Compilação</summary>
                <div className="mt-2 font-mono text-xs text-studio-text space-y-1">
                  <div>Timestamp: {new Date(compiledPrompt.metadata.timestamp).toLocaleString()}</div>
                  <div>Elementos: {compiledPrompt.metadata.elementCount}</div>
                  <div>Movimento de Câmera: {compiledPrompt.metadata.hasCameraMovement ? 'Sim' : 'Não'}</div>
                  <div>Depth of Field: {compiledPrompt.metadata.hasDepthOfField ? 'Sim' : 'Não'}</div>
                  <div>Iluminação Customizada: {compiledPrompt.metadata.hasCustomLighting ? 'Sim' : 'Não'}</div>
                </div>
              </details>

              <details className="panel p-4">
                <summary className="font-mono text-xs text-studio-muted cursor-pointer">Seções Individuais</summary>
                <div className="mt-2 font-mono text-xs text-studio-text space-y-2">
                  {Object.entries(compiledPrompt.sections).map(([key, value]) => (
                    <div key={key} className="border-t border-studio-border pt-2">
                      <div className="font-semibold text-studio-accent">{key.toUpperCase()}</div>
                      <div className="whitespace-pre-wrap text-studio-muted">{value}</div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}