import { useUIStore } from '../../store/useUIStore';
import { SpatialMapView } from './SpatialMapView';
import { DependencyGraphView } from './DependencyGraphView';
import { StoryboardView } from './StoryboardView';
import { StagesView } from './StagesView';
import { VisualEngineView } from './VisualEngineView';

const TABS = [
  { id: 'map', label: '🗺️ MAPA', shortLabel: 'MAPA' },
  { id: 'dependencies', label: '📊 DEPENDÊNCIAS', shortLabel: 'DEPENDÊNCIAS' },
  { id: 'scenes', label: '🎬 CENAS', shortLabel: 'CENAS' },
  { id: 'stages', label: '⚙️ STAGES', shortLabel: 'STAGES' },
  { id: 'visual', label: '🎬 VISUAL', shortLabel: 'VISUAL' },
] as const;

type WorkspaceTab = typeof TABS[number]['id'];

export function VisualWorkspace() {
  const centerWorkspaceTab = useUIStore(s => s.centerWorkspaceTab);
  const setCenterWorkspaceTab = useUIStore(s => s.setCenterWorkspaceTab);

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
      </div>
      <div className="flex-1 overflow-auto">
        {centerWorkspaceTab === 'map' && <SpatialMapView />}
        {centerWorkspaceTab === 'dependencies' && <DependencyGraphView />}
        {centerWorkspaceTab === 'scenes' && <StoryboardView />}
        {centerWorkspaceTab === 'stages' && <StagesView />}
        {centerWorkspaceTab === 'visual' && <VisualEngineView />}
      </div>
    </div>
  );
}