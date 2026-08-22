import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { useSimulationStore } from '../../store/useSimulationStore';

export function TimelineView() {
  const project = useProjectStore(s => s.project);
  const selectedSceneId = useUIStore(s => s.selectedSceneId);
  const selectScene = useUIStore(s => s.selectScene);
  const selectStage = useUIStore(s => s.selectStage);
  const setRightPanelTab = useUIStore(s => s.setRightPanelTab);
  const setStep = useSimulationStore(s => s.setStep);

  if (!project) return null;

  const riskColors: Record<string, string> = { LOW: 'badge-success', MEDIUM: 'badge-warning', HIGH: 'badge-error' };

  return (
    <div className="h-full flex flex-col">
      <div className="panel-header">TIMELINE</div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-studio-border text-studio-muted">
              <th className="p-2 text-left">#</th>
              <th className="p-2 text-left">Timecode</th>
              <th className="p-2 text-left">Operação</th>
              <th className="p-2 text-left">Estágio</th>
              <th className="p-2 text-left">Câmera</th>
              <th className="p-2 text-left">Zona</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Risco</th>
            </tr>
          </thead>
          <tbody>
            {project.scenes.map((scene, sceneIndex) => (
              <tr
                key={scene.id}
                onClick={() => {
                  selectScene(scene.id);
                  selectStage(0);
                  setStep(1 + sceneIndex * 5);
                  setRightPanelTab('inspector');
                }}
                className={`border-b border-studio-border/50 hover:bg-studio-card/50 cursor-pointer ${selectedSceneId === scene.id ? 'bg-studio-card/70' : ''}`}
              >
                <td className="p-2 font-mono">{scene.number}</td>
                <td className="p-2 font-mono">{scene.timecodeStart}s–{scene.timecodeEnd}s</td>
                <td className="p-2">{scene.operationId || '—'}</td>
                <td className="p-2">{scene.stages.length > 0 ? `${scene.stages[0]?.percentage}%–${scene.stages[scene.stages.length - 1]?.percentage}%` : '—'}</td>
                <td className="p-2">{scene.camera}</td>
                <td className="p-2 font-mono">{scene.activeZones.join(', ') || '—'}</td>
                <td className="p-2"><span className={`badge ${scene.status === 'approved' ? 'badge-success' : scene.status === 'locked' ? 'badge-locked' : 'badge-info'}`}>{scene.status}</span></td>
                <td className="p-2"><span className={`badge ${riskColors[scene.riskLevel]}`}>{scene.riskLevel}</span></td>
              </tr>
            ))}
            {project.scenes.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-studio-muted">Nenhuma cena na timeline.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}