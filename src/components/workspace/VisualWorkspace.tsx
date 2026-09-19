import { useUIStore } from '../../store/useUIStore';
import { useProjectStore } from '../../store/useProjectStore';
import { downloadFireflyPlanJson } from '../../core/construction-brain';
import { SpatialMapView } from './SpatialMapView';
import { DependencyGraphView } from './DependencyGraphView';
import { StoryboardView } from './StoryboardView';
import { StagesView } from './StagesView';
import { VisualEngineView } from './VisualEngineView';
import { VisualPipelineWorkspace } from '../visual-pipeline/VisualPipelineWorkspace';

const TABS = [
  { id: 'map', label: '🗺️ MAPA', shortLabel: 'MAPA' },
  { id: 'dependencies', label: '📊 DEPENDÊNCIAS', shortLabel: 'DEPENDÊNCIAS' },
  { id: 'scenes', label: '🎬 CENAS', shortLabel: 'CENAS' },
  { id: 'stages', label: '⚙️ STAGES', shortLabel: 'STAGES' },
  { id: 'visual', label: '🎬 VISUAL', shortLabel: 'VISUAL' },
  { id: 'pipeline', label: 'PIPELINE VISUAL', shortLabel: 'PIPELINE' },
] as const;

type WorkspaceTab = typeof TABS[number]['id'];

export function VisualWorkspace() {
  const centerWorkspaceTab = useUIStore(s => s.centerWorkspaceTab);
  const setCenterWorkspaceTab = useUIStore(s => s.setCenterWorkspaceTab);
  const project = useProjectStore(s => s.project);

  const exportFireflyPlan = () => {
    if (!project) return;

    try {
      const summary = downloadFireflyPlanJson(project);
      window.alert(
        [
          'firefly_plan.json exportado com sucesso.',
          `Cenas: ${summary.sceneCount}`,
          `Jobs: ${summary.fireflyJobCount}`,
          `Kling: ${summary.klingJobCount}`,
          `Veo Fast: ${summary.veoFastJobCount}`,
        ].join('\n'),
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : 'Falha ao exportar firefly_plan.json.',
      );
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-studio-border shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setCenterWorkspaceTab(tab.id as WorkspaceTab)}
            className={centerWorkspaceTab === tab.id ? 'tab-active' : 'tab'}
          >
            {tab.shortLabel}
          </button>
        ))}
        <div className="ml-auto flex items-center px-2">
          <button
            type="button"
            onClick={exportFireflyPlan}
            disabled={!project}
            title={project
              ? 'Exportar plano validado para o runner local do Firefly'
              : 'Abra um projeto para exportar o plano Firefly'}
            className="px-3 py-1.5 text-xs font-semibold rounded border border-studio-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/5"
          >
            EXPORTAR FIREFLY
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {centerWorkspaceTab === 'map' && <SpatialMapView />}
        {centerWorkspaceTab === 'dependencies' && <DependencyGraphView />}
        {centerWorkspaceTab === 'scenes' && <StoryboardView />}
        {centerWorkspaceTab === 'stages' && <StagesView />}
        {centerWorkspaceTab === 'visual' && <VisualEngineView />}
        {centerWorkspaceTab === 'pipeline' && <VisualPipelineWorkspace />}
      </div>
    </div>
  );
}
