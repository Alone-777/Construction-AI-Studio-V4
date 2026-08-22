import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { useSimulationStore } from '../../store/useSimulationStore';

export function StoryboardView() {
  const project = useProjectStore(s => s.project);
  const selectScene = useUIStore(s => s.selectScene);
  const selectStage = useUIStore(s => s.selectStage);
  const setRightPanelTab = useUIStore(s => s.setRightPanelTab);
  const setStep = useSimulationStore(s => s.setStep);

  if (!project) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="panel-header">STORYBOARD — 0% → 25% → 50% → 75% → 100%</div>
      <div className="flex-1 overflow-auto p-2">
        {project.scenes.length === 0 ? (
          <p className="text-studio-muted text-sm text-center py-8">
            Nenhuma cena criada. Adicione operações para gerar o storyboard.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {project.storyboard.map(entry => {
              const scene = project.scenes.find(s => s.id === entry.sceneId);
              if (!scene) return null;
              return (
                <div
                  key={entry.sceneId}
                  onClick={() => {
                    const sceneIndex = project.scenes.findIndex(item => item.id === entry.sceneId);
                    selectScene(entry.sceneId);
                    selectStage(100);
                    setStep(1 + sceneIndex * 5 + 4);
                    setRightPanelTab('inspector');
                  }}
                  className={`panel p-3 cursor-pointer hover:border-studio-accent ${entry.locked ? 'border-purple-500' : ''}`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-mono text-xs font-semibold">Cena {scene.number}</span>
                    <div className="flex gap-1">
                      {entry.locked && <span className="badge-locked">🔒</span>}
                      <span className={`badge ${scene.status === 'approved' ? 'badge-success' : scene.status === 'locked' ? 'badge-locked' : 'badge-info'}`}>
                        {scene.status}
                      </span>
                    </div>
                  </div>
                  <div className="bg-studio-bg rounded h-24 flex items-center justify-center text-studio-muted text-xs">
                    {entry.thumbnail ? <img src={entry.thumbnail} alt="" className="w-full h-full object-cover rounded" /> : '📷 Sem miniatura'}
                  </div>
                  <p className="text-[10px] text-studio-muted mt-2">{entry.description}</p>
                  <div className="text-[10px] text-studio-muted mt-1">
                    ⏱ {scene.timecodeStart}s — {scene.timecodeEnd}s | 🎥 Câmera {scene.camera}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}