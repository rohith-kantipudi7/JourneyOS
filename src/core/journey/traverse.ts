import type { ContextEdge, ContextNode } from '@/types';

export interface Graph {
  readonly nodes: readonly ContextNode[];
  readonly edges: readonly ContextEdge[];
}

export type TraversalDirection = 'both' | 'outgoing' | 'incoming';

export interface TraversalResult extends Graph {
  /** Hop count from the start node, keyed by node id. */
  readonly depthByNode: Readonly<Record<string, number>>;
}

export function findNode(graph: Graph, nodeId: string): ContextNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function neighbours(graph: Graph, nodeId: string, direction: TraversalDirection = 'both'): string[] {
  const ids = new Set<string>();

  for (const edge of graph.edges) {
    if (direction !== 'incoming' && edge.from === nodeId) ids.add(edge.to);
    if (direction !== 'outgoing' && edge.to === nodeId) ids.add(edge.from);
  }

  return [...ids];
}

/**
 * Breadth-first N-hop traversal.
 *
 * Lets the Trust Kernel and Planner pull exactly as much context as they need
 * on demand, rather than forcing every consumer to take the whole snapshot.
 */
export function traverse(
  graph: Graph,
  startNodeId: string,
  depth: number,
  direction: TraversalDirection = 'both',
): TraversalResult {
  if (!findNode(graph, startNodeId)) {
    return { nodes: [], edges: [], depthByNode: {} };
  }

  const depthByNode: Record<string, number> = { [startNodeId]: 0 };
  let frontier = [startNodeId];

  for (let hop = 1; hop <= depth; hop++) {
    const next: string[] = [];

    for (const nodeId of frontier) {
      for (const neighbourId of neighbours(graph, nodeId, direction)) {
        if (depthByNode[neighbourId] !== undefined) continue;
        depthByNode[neighbourId] = hop;
        next.push(neighbourId);
      }
    }

    if (next.length === 0) break;
    frontier = next;
  }

  const reached = new Set(Object.keys(depthByNode));

  return {
    nodes: graph.nodes.filter((node) => reached.has(node.id)),
    // Only edges whose endpoints are both inside the subgraph.
    edges: graph.edges.filter((edge) => reached.has(edge.from) && reached.has(edge.to)),
    depthByNode,
  };
}

/** Longest hop distance from a node — used to assert the graph really is multi-hop. */
export function maxDepthFrom(graph: Graph, startNodeId: string): number {
  const { depthByNode } = traverse(graph, startNodeId, graph.nodes.length);
  const depths = Object.values(depthByNode);
  return depths.length === 0 ? 0 : Math.max(...depths);
}

/** True when every node is reachable from the start node. */
export function isConnectedFrom(graph: Graph, startNodeId: string): boolean {
  const { nodes } = traverse(graph, startNodeId, graph.nodes.length);
  return nodes.length === graph.nodes.length;
}
