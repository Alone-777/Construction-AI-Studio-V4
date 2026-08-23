import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useVisualEngineStore } from '../../store/useVisualEngineStore';
import { worldStateToVisualSceneState } from '../../core/visual/VisualSceneState';

export function StagesView() {
  const project = useProjectStore(s => s.project);
  const selectedSceneId = useUIStore(s => s.selectedSceneId);
  const selectScene = useUIStore(s => s.selectScene);
  const selectStage = useUIStore(s => s.selectStage);
  const setRightPanelTab = useUIStore(s => s.setRightPanelTab);
  const setStep = useSimulationStore(s => s.setStep);
  const setVisualSceneState = useVisualEngineStore(s => s.setVisualSceneState);

  if (!project) return null;
  const scene = project.scenes.find(s => s.id === selectedSceneId) ?? project.scenes[0];

  if (!scene) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-studio-muted">
        <p>Nenhuma cena selecionada.</p>
      </div>
    );
  }

  const riskColors: Record<string, string> = { LOW: 'badge-success', MEDIUM: 'badge-warning', HIGH: 'badge-error' };

  const handleStageSelect = (stage: any, stageIndex: number) => {
    selectScene(scene.id);
    selectStage(stage.percentage);
    setStep(1 + project.scenes.findIndex(s => s.id === scene.id) * 5 + stageIndex);
    setRightPanelTab('inspector');

    // Populate Visual Engine with selected stage data
    const promptState = stage.worldStateBefore ?? stage.worldStateAfter;
    if (promptState) {
      const visualSceneState = worldStateToVisualSceneState(promptState);
      visualSceneState.scene.title = `Cena ${scene.number} — ${scene.operationId}`;
      visualSceneState.scene.description = stage.physicalAction;
      visualSceneState.activeZone = stage.activeZone;
      visualSceneState.timestamp = Date.now();
      setVisualSceneState(visualSceneState);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="panel-header">STAGES — Cena {scene.number} ({scene.operationId})</div>
      <div className="flex-1 overflow-auto p-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-studio-border text-studio-muted">
              <th className="p-2 text-left">%</th>
              <th className="p-2 text-left">Zona</th>
              <th className="p-2 text-left">Ação</th>
              <th className="p-2 text-left">Ferramenta</th>
              <th className="p-2 text-left">Score</th>
              <th className="p-2 text-left">Risco</th>
              <th className="p-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {scene.stages.map((stage, stageIndex) => (
              <tr
                key={stage.percentage}
                onClick={() => handleStageSelect(stage, stageIndex)}
                className="border-b border-studio-border/50 hover:bg-studio-card/50 cursor-pointer"
              >
                <td className="p-2 font-mono">{stage.percentage}%</td>
                <td className="p-2 font-mono">{stage.activeZone}</td>
                <td className="p-2">{stage.physicalAction}</td>
                <td className="p-2">{stage.tool || 'marcação/inspeção'}</td>
                <td className="p-2">
                  {stage.qualityScore ? (
                    <span className="font-mono text-studio-accent">{stage.qualityScore.overall}</span>
                  ) : (
                    <span className="text-studio-muted">—</span>
                  )}
                </td>
                <td className="p-2">
                  <span className={`badge ${riskColors[stage.jumpRisk ?? 'LOW']}`}>{stage.jumpRisk ?? 'LOW'}</span>
                </td>
                <td className="p-2">
                  <span className={stage.validations?.approved ? 'text-emerald-400' : 'text-amber-400'}>
                    {stage.validations?.approved ? '✓' : '⏳'}
                  </span>
                </td>
              </tr>
            ))}
            {scene.stages.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-studio-muted">Nenhum estágio nesta cena.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}