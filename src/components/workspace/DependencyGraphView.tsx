import { useProjectStore } from '../../store/useProjectStore';
import { useUIStore } from '../../store/useUIStore';
import { useComponentSelector } from '../../hooks/useWorkspaceSelection';

export function DependencyGraphView() {
  const project = useProjectStore(s => s.project);
  const selectedZoneId = useUIStore(s => s.selectedZoneId);
  const selectedComponentId = useUIStore(s => s.selectedComponentId);
  const selectComponent = useComponentSelector();

  if (!project) return null;
  const { dependencyGraph } = project;

  const statusColors: Record<string, string> = {
    READY: 'border-emerald-500 text-emerald-400',
    BLOCKED: 'border-rose-500 text-rose-400',
    ACTIVE: 'border-amber-500 text-amber-400',
    PARTIAL: 'border-cyan-500 text-cyan-400',
    COMPLETE: 'border-emerald-500 bg-emerald-500/10 text-emerald-400',
    LOCKED: 'border-purple-500 text-purple-400',
  };

  const getNodeStatus = (node: { zones: string[]; status: string }): string => {
    if (node.status === 'COMPLETE' || node.status === 'LOCKED') return node.status;
    if (node.zones.includes(selectedZoneId ?? '')) return 'ACTIVE';
    return node.status;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="panel-header">GRAFO DE DEPENDÊNCIAS</div>
      <div className="flex-1 overflow-auto p-4">
        {dependencyGraph.nodes.length === 0 ? (
          <p className="text-studio-muted text-sm text-center py-8">Nenhum componente definido. Adicione componentes ao projeto.</p>
        ) : (
          <div className="space-y-3">
            {dependencyGraph.nodes.map(node => {
              const effectiveStatus = getNodeStatus(node);
              const statusColor = statusColors[effectiveStatus] || 'border-zinc-500';
              const isSelected = selectedZoneId && node.zones.includes(selectedZoneId);

              return (
                <div
                  key={node.id}
                  className={`panel p-3 border-l-4 ${statusColor} ${isSelected ? 'ring-2 ring-studio-accent' : ''}`}
                  onClick={() => selectComponent(node.id, node.zones[0] || null)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-sm font-semibold">{node.name}</span>
                    <span className={`badge ${effectiveStatus === 'COMPLETE' ? 'badge-success' : effectiveStatus === 'BLOCKED' ? 'badge-error' : effectiveStatus === 'ACTIVE' ? 'badge-warning' : effectiveStatus === 'LOCKED' ? 'badge-locked' : 'badge-info'}`}>
                      {effectiveStatus}
                    </span>
                  </div>
                  {node.dependencies.length > 0 && (
                    <div className="text-[10px] text-studio-muted mt-1">
                      Depende de: {node.dependencies.join(', ')}
                    </div>
                  )}
                  {node.zones.length > 0 && (
                    <div className="text-[10px] text-studio-muted">Zonas: {node.zones.join(', ')}</div>
                  )}
                </div>
              );
            })}

            {dependencyGraph.edges.length > 0 && (
              <div className="mt-4">
                <div className="panel-header">ARESTAS</div>
                <div className="p-2 space-y-1">
                  {dependencyGraph.edges.map((edge, i) => (
                    <div key={i} className="text-[10px] text-studio-muted font-mono">
                      {edge.from} → {edge.to} {edge.required ? '(obrigatório)' : '(opcional)'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}