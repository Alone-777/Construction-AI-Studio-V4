import { useProjectStore } from '../../store/useProjectStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useUIStore } from '../../store/useUIStore';
import { useInspectorStore } from '../../store/useInspectorStore';
import { useZoneSelector } from '../../hooks/useWorkspaceSelection';
import { useComponentSelector } from '../../hooks/useWorkspaceSelection';

export function SpatialMapView() {
  const project = useProjectStore(s => s.project);
  const simulatedWorldState = useSimulationStore(s => s.worldState);
  const selectedSceneId = useUIStore(s => s.selectedSceneId);
  const selectedStagePercentage = useUIStore(s => s.selectedStagePercentage);
  const selectedZoneId = useUIStore(s => s.selectedZoneId);
  const selectZone = useZoneSelector();
  const selectComponent = useComponentSelector();
  const setSelectedZone = useInspectorStore(s => s.setSelectedZone);

  if (!project) return null;
  const { spatialMap } = project;
  const worldState = simulatedWorldState ?? project.worldState;
  const scene = project.scenes.find(s => s.id === selectedSceneId) ?? project.scenes[0];
  const stage = scene?.stages.find(s => s.percentage === selectedStagePercentage) ?? scene?.stages[0];

  const completedZones = new Set(
    scene?.stages
      .filter(s => s.percentage < (stage?.percentage ?? 0))
      .map(s => s.activeZone) ?? []
  );

  return (
    <div className="h-full flex flex-col">
      <div className="panel-header">MAPA ESPACIAL DA OBRA</div>
      <div className="flex-1 relative bg-studio-bg rounded-lg overflow-hidden m-1">
        <svg
          viewBox={`0 0 ${spatialMap.width} ${spatialMap.height}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
          onClick={() => { selectZone(null); selectComponent(null); }}
        >
          {/* Grid */}
          {Array.from({ length: Math.ceil(spatialMap.width / spatialMap.gridSize) + 1 }).map((_, i) => (
            <line key={`v${i}`} x1={i * spatialMap.gridSize} y1={0} x2={i * spatialMap.gridSize} y2={spatialMap.height} stroke="#27272a" strokeWidth={0.5} />
          ))}
          {Array.from({ length: Math.ceil(spatialMap.height / spatialMap.gridSize) + 1 }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * spatialMap.gridSize} x2={spatialMap.width} y2={i * spatialMap.gridSize} stroke="#27272a" strokeWidth={0.5} />
          ))}

          {/* Zones */}
          {spatialMap.zones.map(zone => {
            const statusColors: Record<string, string> = {
              pristine: '#3f3f46', active: '#f59e0b', partial: '#06b6d4', complete: '#10b981', blocked: '#f43f5e'
            };
            const protectedZone = project.dna.restrictions.some(rule => rule.includes(zone.id));
            const displayedStatus = protectedZone
              ? 'pristine'
              : zone.id === stage?.activeZone
                ? (stage.percentage === 100 ? 'complete' : 'active')
                : completedZones.has(zone.id) ? 'complete' : 'pristine';
            const fill = statusColors[displayedStatus] || '#3f3f46';
            const isActiveZone = worldState.activeZone === zone.id;
            const isSelected = selectedZoneId === zone.id;

            return (
              <g key={zone.id} onClick={(e) => { e.stopPropagation(); selectZone(zone.id); setSelectedZone(zone); }}>
                <rect
                  x={zone.bounds.x}
                  y={zone.bounds.y}
                  width={zone.bounds.width}
                  height={zone.bounds.height}
                  fill={fill}
                  fillOpacity={0.2}
                  stroke={isSelected ? '#06b6d4' : isActiveZone ? '#f59e0b' : fill}
                  strokeWidth={isSelected ? 3 : isActiveZone ? 2 : 1}
                  strokeDasharray={isSelected ? '4,2' : 'none'}
                  rx={2}
                  style={{ cursor: 'pointer' }}
                />
                <text
                  x={zone.bounds.x + zone.bounds.width / 2}
                  y={zone.bounds.y + zone.bounds.height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fafafa"
                  fontSize={6}
                  fontFamily="JetBrains Mono"
                  pointerEvents="none"
                >
                  {zone.id}
                </text>
                <text
                  x={zone.bounds.x + zone.bounds.width / 2}
                  y={zone.bounds.y + zone.bounds.height / 2 + 8}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={fill}
                  fontSize={4}
                  fontFamily="JetBrains Mono"
                  pointerEvents="none"
                >
                  {displayedStatus}
                </text>
              </g>
            );
          })}

          {/* Character position */}
          {(() => {
            const charZone = spatialMap.zones.find(z => z.id === worldState.character.currentZone);
            if (!charZone) return null;
            const cx = charZone.bounds.x + charZone.bounds.width / 2;
            const cy = charZone.bounds.y + charZone.bounds.height / 2 - 5;
            return (
              <g>
                <circle cx={cx} cy={cy} r={3} fill="#f59e0b" stroke="#000" strokeWidth={0.5} />
                <text x={cx} y={cy - 5} textAnchor="middle" fill="#f59e0b" fontSize={3}>👷</text>
              </g>
            );
          })()}

          {/* Orientation labels */}
          <text x={spatialMap.width / 2} y={4} textAnchor="middle" fill="#71717a" fontSize={4}>FUNDO</text>
          <text x={spatialMap.width / 2} y={spatialMap.height - 2} textAnchor="middle" fill="#71717a" fontSize={4}>FRENTE</text>
          <text x={3} y={spatialMap.height / 2} textAnchor="middle" fill="#71717a" fontSize={4} transform={`rotate(-90, 3, ${spatialMap.height / 2})`}>ESQ</text>
          <text x={spatialMap.width - 3} y={spatialMap.height / 2} textAnchor="middle" fill="#71717a" fontSize={4} transform={`rotate(90, ${spatialMap.width - 3}, ${spatialMap.height / 2})`}>DIR</text>
        </svg>
      </div>
    </div>
  );
}