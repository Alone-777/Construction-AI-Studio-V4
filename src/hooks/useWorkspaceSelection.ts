import { useProjectStore } from '../store/useProjectStore';
import { useUIStore } from '../store/useUIStore';
import { useInspectorStore } from '../store/useInspectorStore';
import type { Zone, ConstructionComponent } from '../core/types';

/**
 * Hook que conecta seleções do workspace (MAPA/DEPENDÊNCIAS) ao Inspector.
 * Quando o usuário clica em uma zona ou componente, atualiza o InspectorStore.
 */
export function useWorkspaceSelection() {
  const project = useProjectStore(s => s.project);
  const selectedZoneId = useUIStore(s => s.selectedZoneId);
  const selectedComponentId = useUIStore(s => s.selectedComponentId);
  const setSelectedZone = useInspectorStore(s => s.setSelectedZone);
  const setSelectedComponent = useInspectorStore(s => s.setSelectedComponent);

  // Sincroniza zona selecionada do UIStore para InspectorStore
  const zone = project?.spatialMap.zones.find(z => z.id === selectedZoneId) ?? null;
  const component = project?.dependencyGraph.nodes.find(c => c.id === selectedComponentId) ?? null;

  // Atualiza o InspectorStore quando a seleção muda
  if (zone !== useInspectorStore.getState().selectedZone) {
    setSelectedZone(zone);
  }
  if (component !== useInspectorStore.getState().selectedComponent) {
    setSelectedComponent(component);
  }

  return { zone, component };
}

/**
 * Hook para selecionar zona no mapa espacial
 */
export function useZoneSelector() {
  const selectZone = useUIStore(s => s.selectZone);
  const selectComponent = useUIStore(s => s.selectComponent);

  return (zoneId: string | null) => {
    selectZone(zoneId);
    selectComponent(null);
  };
}

/**
 * Hook para selecionar componente no grafo de dependências
 */
export function useComponentSelector() {
  const selectComponent = useUIStore(s => s.selectComponent);
  const selectZone = useUIStore(s => s.selectZone);

  return (componentId: string | null, zoneId?: string | null) => {
    selectComponent(componentId);
    if (zoneId) selectZone(zoneId);
  };
}