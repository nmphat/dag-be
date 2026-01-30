import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ClusterQueryDto,
  ClustersResponseDto,
  NeighborsQueryDto,
  NeighborsResponseDto,
  ShortestPathQueryDto,
  ShortestPathResponseDto,
  SubgraphQueryDto,
  SubgraphResponseDto,
} from './dto';
import { GraphService } from './graph.service';

@ApiTags('graph')
@Controller('api/graph')
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  // ============================================
  // 1. SUBGRAPH API
  // ============================================

  @Get('subgraph/:nodeId')
  @ApiOperation({
    summary: 'Get subgraph centered on a node',
    description: `
      Returns a subgraph containing the specified node and its neighbors up to a given depth.
      Use this for initial graph loading or re-centering the view on a specific node.
      
      **Performance notes:**
      - Depth is limited to 4 to prevent memory issues with large graphs
      - maxNodes caps the result to prevent overwhelming the client
      - Use direction to limit traversal to only ancestors or descendants
    `,
  })
  @ApiParam({
    name: 'nodeId',
    description: 'Center node ID',
    example: 'n_12345',
  })
  @ApiResponse({
    status: 200,
    description: 'Subgraph retrieved successfully',
    type: SubgraphResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async getSubgraph(
    @Param('nodeId') nodeId: string,
    @Query() query: SubgraphQueryDto,
  ): Promise<SubgraphResponseDto> {
    return this.graphService.getSubgraph(nodeId, query);
  }

  // ============================================
  // 2. NEIGHBORS API
  // ============================================

  @Get('neighbors/:nodeId')
  @ApiOperation({
    summary: 'Get paginated neighbors of a node',
    description: `
      Returns parents and/or children of a node with pagination.
      Use this for expand/collapse functionality when a user clicks on a node.
      
      **Use cases:**
      - Expanding a node to show its children
      - Loading more neighbors when scrolling
      - Fetching parent nodes for upward navigation
    `,
  })
  @ApiParam({
    name: 'nodeId',
    description: 'Node ID to get neighbors for',
    example: 'n_12345',
  })
  @ApiResponse({
    status: 200,
    description: 'Neighbors retrieved successfully',
    type: NeighborsResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Node not found' })
  async getNeighbors(
    @Param('nodeId') nodeId: string,
    @Query() query: NeighborsQueryDto,
  ): Promise<NeighborsResponseDto> {
    return this.graphService.getNeighbors(nodeId, query);
  }

  // ============================================
  // 3. SHORTEST PATH API
  // ============================================

  @Get('shortest-path')
  @ApiOperation({
    summary: 'Find shortest path between two nodes',
    description: `
      Uses BFS to find the shortest path between two nodes in the graph.
      
      **Direction options:**
      - any: Traverse in any direction (most flexible)
      - upward: Only traverse from child to parent (useful for finding common ancestors)
      - downward: Only traverse from parent to child (useful for finding sub-categories)
      
      **Use cases:**
      - Highlight path when user searches for a concept
      - Show relationship between two selected nodes
      - Navigation breadcrumbs
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Path search completed',
    type: ShortestPathResponseDto,
  })
  @ApiResponse({ status: 404, description: 'One or both nodes not found' })
  async getShortestPath(
    @Query() query: ShortestPathQueryDto,
  ): Promise<ShortestPathResponseDto> {
    return this.graphService.findShortestPath(query);
  }

  // ============================================
  // 4. CLUSTERS API
  // ============================================

  @Get('clusters')
  @ApiOperation({
    summary: 'Get clustered overview of the graph',
    description: `
      Returns nodes at a specific hierarchy level with aggregated statistics.
      Use this for overview/navigation mode in large graphs.
      
      **Use cases:**
      - Initial overview of a 1M+ node graph
      - Navigation: show top-level categories first, then drill down
      - Understanding graph structure: see how many descendants each branch has
      
      **Performance notes:**
      - descendantCount is estimated for performance (not exact for very large branches)
      - Use level=0 for root nodes, level=1 for first-level categories, etc.
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Clusters retrieved successfully',
    type: ClustersResponseDto,
  })
  async getClusters(
    @Query() query: ClusterQueryDto,
  ): Promise<ClustersResponseDto> {
    return this.graphService.getClusters(query);
  }
}
