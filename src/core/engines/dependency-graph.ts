import { DependencyGraph, ConstructionComponent, DependencyEdge, ComponentStatus } from '../types';

/**
 * Cria grafo vazio.
 */
export function createDependencyGraph(): DependencyGraph {
  return { nodes: [], edges: [] };
}

/**
 * Adiciona componente.
 */
export function addComponent(graph: DependencyGraph, component: ConstructionComponent): void {
  if (!graph.nodes.find(n => n.id === component.id)) {
    graph.nodes.push(component);
  }
}

/**
 * Adiciona aresta.
 */
export function addEdge(graph: DependencyGraph, from: string, to: string, required: boolean = true): void {
  graph.edges.push({ from, to, required });
  const toNode = graph.nodes.find(n => n.id === to);
  if (toNode && !toNode.dependencies.includes(from)) {
    toNode.dependencies.push(from);
  }
}

/**
 * Verifica pré-condições.
 */
export function checkPreconditions(graph: DependencyGraph, componentId: string): boolean {
  const edges = graph.edges.filter(e => e.to === componentId && e.required);
  return edges.every(edge => {
    const depNode = graph.nodes.find(n => n.id === edge.from);
    return depNode && depNode.status === 'COMPLETE';
  });
}

export function getComponentStatus(graph: DependencyGraph, componentId: string): ComponentStatus | undefined {
  const node = graph.nodes.find(n => n.id === componentId);
  return node ? node.status : undefined;
}

export function updateComponentStatus(graph: DependencyGraph, componentId: string, status: ComponentStatus): boolean {
  const node = graph.nodes.find(n => n.id === componentId);
  if (!node) return false;
  if (node.status === 'LOCKED' && status !== 'LOCKED') return false;
  
  if (status === 'READY' || status === 'ACTIVE') {
    if (!checkPreconditions(graph, componentId)) {
      node.status = 'BLOCKED';
      return false;
    }
  }
  
  node.status = status;
  return true;
}

export function topologicalSort(graph: DependencyGraph): ConstructionComponent[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  
  graph.nodes.forEach(n => {
    inDegree.set(n.id, 0);
    adjList.set(n.id, []);
  });
  
  graph.edges.forEach(e => {
    if (e.required) {
      inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
      adjList.get(e.from)?.push(e.to);
    }
  });
  
  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });
  
  const sorted: ConstructionComponent[] = [];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const node = graph.nodes.find(n => n.id === currentId);
    if (node) sorted.push(node);
    
    const neighbors = adjList.get(currentId) || [];
    for (const neighbor of neighbors) {
      const deg = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }
  
  return sorted;
}

export function getBlockedComponents(graph: DependencyGraph): ConstructionComponent[] {
  return graph.nodes.filter(n => n.status === 'BLOCKED');
}

export function getReadyComponents(graph: DependencyGraph): ConstructionComponent[] {
  return graph.nodes.filter(n => n.status === 'READY' && checkPreconditions(graph, n.id));
}

export function getDependents(graph: DependencyGraph, componentId: string): string[] {
  return graph.edges.filter(e => e.from === componentId).map(e => e.to);
}

export function getDependencies(graph: DependencyGraph, componentId: string): string[] {
  return graph.edges.filter(e => e.to === componentId).map(e => e.from);
}

export function lockComponent(graph: DependencyGraph, componentId: string): void {
  const node = graph.nodes.find(n => n.id === componentId);
  if (node) node.status = 'LOCKED';
}

export function canModifyLocked(graph: DependencyGraph, componentId: string): boolean {
  const node = graph.nodes.find(n => n.id === componentId);
  return node ? node.status !== 'LOCKED' : false;
}
