import { Injectable, NotFoundException } from '@nestjs/common';
import { ConceptResponseDto } from '../concepts/dto/response.dto';
import { ConceptRepository, EdgeRepository } from '../database/repositories';
import { DomainConcept } from '../database/repositories/domain.types';
import { VariantRepository } from '../database/repositories/variants.repository';
import {
  ClusterQueryDto,
  ClustersResponseDto,
  GraphEdgeDto,
  NeighborsDirection,
  NeighborsQueryDto,
  NeighborsResponseDto,
  PathDirection,
  ShortestPathQueryDto,
  ShortestPathResponseDto,
  SubgraphDirection,
  SubgraphQueryDto,
  SubgraphResponseDto,
  toConceptResponse,
} from './dto';

interface TraversalResult {
  nodes: Map<string, DomainConcept>;
  edges: Set<string>; // "parentId->childId" format
}

@Injectable()
export class GraphService {
  constructor(
    private readonly conceptRepo: ConceptRepository,
    private readonly edgeRepo: EdgeRepository,
    private readonly variantRepo: VariantRepository,
  ) {}

  // ============================================
  // 1. SUBGRAPH API
  // ============================================

  async getSubgraph(
    nodeId: string,
    query: SubgraphQueryDto,
  ): Promise<SubgraphResponseDto> {
    const depth = query.depth ?? 2;
    const direction = query.direction ?? SubgraphDirection.BOTH;
    const maxNodes = query.maxNodes ?? 100;

    // Get center node
    const centerNode = await this.conceptRepo.findById(nodeId);
    if (!centerNode) {
      throw new NotFoundException(`Node ${nodeId} not found`);
    }

    const result: TraversalResult = {
      nodes: new Map([[nodeId, centerNode]]),
      edges: new Set(),
    };

    // BFS traversal
    await this.bfsTraverse(nodeId, depth, direction, maxNodes, result);

    // Convert to response
    // Convert to response
    const truncated = result.nodes.size >= maxNodes;

    // Enrich with variants if requested
    let nodes: ConceptResponseDto[];
    if (query.includeDetails !== false) {
      nodes = await this.enrichWithVariants(Array.from(result.nodes.values()));
    } else {
      nodes = Array.from(result.nodes.values()).map((n) =>
        toConceptResponse(n, []),
      );
    }

    const edges = this.parseEdges(result.edges);

    // Get variants for center node
    const centerVariants = await this.variantRepo.findByConceptId(nodeId);

    return {
      centerNode: toConceptResponse(
        centerNode,
        centerVariants.map((v) => v.name),
      ),
      nodes,
      edges,
      metadata: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        depth,
        truncated,
        truncatedNodes: truncated ? maxNodes : 0,
      },
    };
  }

  private async bfsTraverse(
    startId: string,
    maxDepth: number,
    direction: SubgraphDirection,
    maxNodes: number,
    result: TraversalResult,
  ): Promise<void> {
    let currentLayer = [startId];
    let currentDepth = 0;
    const visited = new Set<string>([startId]);

    while (
      currentLayer.length > 0 &&
      currentDepth < maxDepth &&
      result.nodes.size < maxNodes
    ) {
      const nextLayer: string[] = [];
      const layerIds = currentLayer;

      // Prepare batch fetch promises for current layer
      const fetchPromises: Promise<any>[] = [];

      // 1. Fetch children (Down direction)
      if (
        direction === SubgraphDirection.DOWN ||
        direction === SubgraphDirection.BOTH
      ) {
        fetchPromises.push(this.edgeRepo.getChildrenOfConcepts(layerIds));
      } else {
        fetchPromises.push(Promise.resolve([]));
      }

      // 2. Fetch parents (Up direction)
      if (
        direction === SubgraphDirection.UP ||
        direction === SubgraphDirection.BOTH
      ) {
        fetchPromises.push(this.edgeRepo.getParentsOfConcepts(layerIds));
      } else {
        fetchPromises.push(Promise.resolve([]));
      }

      // Execute batch queries
      const [childrenResults, parentsResults] =
        await Promise.all(fetchPromises);

      // Process children results
      const childrenBatch = childrenResults as Array<{
        parentId: string;
        child: DomainConcept;
      }>;
      for (const { parentId, child } of childrenBatch) {
        if (result.nodes.size >= maxNodes) break;

        const edgeKey = `${parentId}->${child.id}`;
        result.edges.add(edgeKey);

        // Add node if not visited
        // Note: Even if visited, we added the edge above (which is correct for graph)
        if (!visited.has(child.id)) {
          visited.add(child.id);
          result.nodes.set(child.id, child);
          nextLayer.push(child.id);
        }
      }

      // Process parents results
      const parentsBatch = parentsResults as Array<{
        childId: string;
        parent: DomainConcept;
      }>;
      for (const { childId, parent } of parentsBatch) {
        if (result.nodes.size >= maxNodes) break;

        const edgeKey = `${parent.id}->${childId}`;
        result.edges.add(edgeKey);

        if (!visited.has(parent.id)) {
          visited.add(parent.id);
          result.nodes.set(parent.id, parent);
          nextLayer.push(parent.id);
        }
      }

      currentLayer = nextLayer;
      currentDepth++;
    }
  }

  // ============================================
  // 2. NEIGHBORS API
  // ============================================

  async getNeighbors(
    nodeId: string,
    query: NeighborsQueryDto,
  ): Promise<NeighborsResponseDto> {
    const direction = query.direction ?? NeighborsDirection.BOTH;
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    // Check node exists
    const node = await this.conceptRepo.findById(nodeId);
    if (!node) {
      throw new NotFoundException(`Node ${nodeId} not found`);
    }

    let parents: DomainConcept[] = [];
    let children: DomainConcept[] = [];
    let totalParents = 0;
    let totalChildren = 0;

    // Fetch parents if needed
    if (
      direction === NeighborsDirection.PARENTS ||
      direction === NeighborsDirection.BOTH
    ) {
      const allParents = await this.edgeRepo.getParents(nodeId);
      totalParents = allParents.length;
      parents = allParents.slice(offset, offset + limit);
    }

    // Fetch children if needed
    if (
      direction === NeighborsDirection.CHILDREN ||
      direction === NeighborsDirection.BOTH
    ) {
      const [childrenResult, countResult] = await Promise.all([
        this.conceptRepo.findChildren(nodeId, limit, offset),
        this.conceptRepo.countChildren(nodeId),
      ]);
      children = childrenResult;
      totalChildren = countResult;
    }

    // Enrich with variants
    const enrichedParents = await this.enrichWithVariants(parents);
    const enrichedChildren = await this.enrichWithVariants(children);

    return {
      nodeId,
      parents: enrichedParents,
      children: enrichedChildren,
      parentEdges: parents.map((p) => ({ source: p.id, target: nodeId })),
      childEdges: children.map((c) => ({ source: nodeId, target: c.id })),
      pagination: {
        hasMoreParents: offset + parents.length < totalParents,
        hasMoreChildren: offset + children.length < totalChildren,
        totalParents,
        totalChildren,
        parentsOffset: offset,
        childrenOffset: offset,
      },
    };
  }

  // ============================================
  // 3. SHORTEST PATH API (Bidirectional BFS)
  // ============================================

  async findShortestPath(
    query: ShortestPathQueryDto,
  ): Promise<ShortestPathResponseDto> {
    const startTime = Date.now();
    const { from, to, direction = PathDirection.ANY, maxLength = 10 } = query;

    // Check nodes exist
    const [fromNode, toNode] = await Promise.all([
      this.conceptRepo.findById(from),
      this.conceptRepo.findById(to),
    ]);

    if (!fromNode) throw new NotFoundException(`Node ${from} not found`);
    if (!toNode) throw new NotFoundException(`Node ${to} not found`);

    // Same node
    if (from === to) {
      const variants = await this.variantRepo.findByConceptId(from);
      return {
        found: true,
        path: [
          toConceptResponse(
            fromNode,
            variants.map((v) => v.name),
          ),
        ],
        edges: [],
        length: 0,
        took: Date.now() - startTime,
      };
    }

    // BFS for shortest path
    const pathResult = await this.bfsShortestPath(
      from,
      to,
      direction,
      maxLength,
    );

    if (!pathResult) {
      return {
        found: false,
        path: null,
        edges: null,
        length: 0,
        took: Date.now() - startTime,
      };
    }

    // Fetch full node data for path
    const pathNodes = await Promise.all(
      pathResult.path.map((id) => this.conceptRepo.findById(id)),
    );

    const enrichedPath = await this.enrichWithVariants(
      pathNodes.filter((n): n is DomainConcept => n !== null),
    );

    return {
      found: true,
      path: enrichedPath,
      edges: pathResult.edges,
      length: pathResult.edges.length,
      took: Date.now() - startTime,
    };
  }

  private async bfsShortestPath(
    from: string,
    to: string,
    direction: PathDirection,
    maxLength: number,
  ): Promise<{ path: string[]; edges: GraphEdgeDto[] } | null> {
    // Track visited nodes and their parent in BFS tree
    const visited = new Map<string, string | null>(); // nodeId -> parentId
    visited.set(from, null);

    const queue: Array<{ id: string; depth: number }> = [
      { id: from, depth: 0 },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.depth >= maxLength) continue;

      // Get neighbors based on direction
      let neighbors: DomainConcept[] = [];

      if (
        direction === PathDirection.ANY ||
        direction === PathDirection.DOWNWARD
      ) {
        // Traverse down (parent -> child)
        const children = await this.edgeRepo.getChildren(current.id);
        neighbors = neighbors.concat(children);
      }

      if (
        direction === PathDirection.ANY ||
        direction === PathDirection.UPWARD
      ) {
        // Traverse up (child -> parent)
        const parents = await this.edgeRepo.getParents(current.id);
        neighbors = neighbors.concat(parents);
      }

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.id)) continue;

        visited.set(neighbor.id, current.id);

        if (neighbor.id === to) {
          // Reconstruct path
          return this.reconstructPath(from, to, visited);
        }

        queue.push({ id: neighbor.id, depth: current.depth + 1 });
      }
    }

    return null; // No path found
  }

  private async reconstructPath(
    from: string,
    to: string,
    visited: Map<string, string | null>,
  ): Promise<{ path: string[]; edges: GraphEdgeDto[] }> {
    const path: string[] = [];
    const edges: GraphEdgeDto[] = [];
    let current: string | null = to;

    while (current !== null) {
      path.unshift(current);
      const parent = visited.get(current);

      if (parent !== null && parent !== undefined) {
        // Determine edge direction based on actual graph structure
        const isParentToChild = await this.edgeRepo.findByParentAndChild(
          parent,
          current,
        );
        if (isParentToChild) {
          edges.unshift({ source: parent, target: current });
        } else {
          edges.unshift({ source: current, target: parent });
        }
      }

      current = parent ?? null;
    }

    return { path, edges };
  }

  // ============================================
  // 4. CLUSTERS API
  // ============================================

  async getClusters(query: ClusterQueryDto): Promise<ClustersResponseDto> {
    const level = query.level ?? 1;
    const limit = query.limit ?? 50;

    // Get nodes at specified level
    const [nodesAtLevel, totalNodesInGraph] = await Promise.all([
      this.conceptRepo.findMany({
        where: { level },
        take: limit,
        skip: 0,
      }),
      this.conceptRepo.count({}),
    ]);

    // Get descendant counts for each cluster node
    const clusters = await Promise.all(
      nodesAtLevel.map(async (node) => {
        const [directChildCount, variants] = await Promise.all([
          this.conceptRepo.countChildren(node.id),
          this.variantRepo.findByConceptId(node.id),
        ]);

        // For performance at 1M scale, we approximate descendant count
        // using direct children * average branching factor
        // In production, this should be precomputed and stored
        const descendantCount = await this.estimateDescendantCount(
          node.id,
          directChildCount,
        );

        return {
          node: toConceptResponse(
            node,
            variants.map((v) => v.name),
          ),
          descendantCount,
          directChildCount,
          isLeaf: directChildCount === 0,
        };
      }),
    );

    // Get edges between clusters at this level
    const edges = await this.getEdgesBetweenNodes(
      nodesAtLevel.map((n) => n.id),
    );

    // Count total clusters at this level
    const totalClusters = await this.conceptRepo.count({ level });

    const avgDescendants =
      clusters.length > 0
        ? Math.round(
            clusters.reduce((sum, c) => sum + c.descendantCount, 0) /
              clusters.length,
          )
        : 0;

    return {
      clusters,
      edges,
      stats: {
        level,
        totalClusters,
        totalNodesInGraph,
        avgDescendantsPerCluster: avgDescendants,
      },
    };
  }

  private async estimateDescendantCount(
    nodeId: string,
    directChildren: number,
  ): Promise<number> {
    // For large graphs, we estimate descendants
    // This is a simplified heuristic
    // In production, you'd want to precompute this using materialized views
    if (directChildren === 0) return 0;

    // Sample-based estimation: check depth of one child branch
    const children = await this.edgeRepo.getChildren(nodeId);
    if (children.length === 0) return 0;

    // Get average branching for first child
    const firstChildChildren = await this.conceptRepo.countChildren(
      children[0].id,
    );
    const branchingFactor = firstChildChildren > 0 ? firstChildChildren : 1;

    // Estimate: direct * (1 + branching + branching^2) approximately
    // This is a geometric series approximation for 3 levels
    return (
      directChildren * (1 + branchingFactor + branchingFactor * branchingFactor)
    );
  }

  private async getEdgesBetweenNodes(
    nodeIds: string[],
  ): Promise<GraphEdgeDto[]> {
    if (nodeIds.length < 2) return [];

    const nodeSet = new Set(nodeIds);
    const edges: GraphEdgeDto[] = [];

    // For each node, check if any of its children/parents are in the set
    for (const nodeId of nodeIds) {
      const children = await this.edgeRepo.getChildren(nodeId);
      for (const child of children) {
        if (nodeSet.has(child.id)) {
          edges.push({ source: nodeId, target: child.id });
        }
      }
    }

    return edges;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async enrichWithVariants(
    concepts: DomainConcept[],
  ): Promise<ConceptResponseDto[]> {
    if (concepts.length === 0) return [];

    // Batch fetch variants for all concepts
    // Batch fetch variants for all concepts
    const variantsMap = new Map<string, string[]>();

    // Use bulk fetch
    const conceptIds = concepts.map((c) => c.id);
    const allVariants = await this.variantRepo.findByConceptIds(conceptIds);

    // Group variants by concept
    for (const variant of allVariants) {
      if (!variantsMap.has(variant.conceptId)) {
        variantsMap.set(variant.conceptId, []);
      }
      variantsMap.get(variant.conceptId)!.push(variant.name);
    }

    return concepts.map((c) =>
      toConceptResponse(c, variantsMap.get(c.id) || []),
    );
  }

  private parseEdges(edgeSet: Set<string>): GraphEdgeDto[] {
    return Array.from(edgeSet).map((edgeKey) => {
      const [source, target] = edgeKey.split('->');
      return { source, target };
    });
  }
}
