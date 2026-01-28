import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateEdgeDto } from './dto';
import { EdgesService } from './edges.service';

@ApiTags('edges')
@Controller('api/edges')
export class EdgesController {
  constructor(private readonly edgesService: EdgesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new edge between nodes' })
  @ApiCreatedResponse({ description: 'Edge created successfully' })
  @ApiNotFoundResponse({ description: 'Parent or child node not found' })
  @ApiBadRequestResponse({ description: 'Creating edge would create a cycle' })
  async create(@Body(ValidationPipe) dto: CreateEdgeDto) {
    await this.edgesService.create(dto);
    return { message: 'Edge created successfully' };
  }

  @Delete(':parentId/:childId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an edge' })
  @ApiNoContentResponse({ description: 'Edge deleted successfully' })
  @ApiNotFoundResponse({ description: 'Edge not found' })
  async remove(
    @Param('parentId') parentId: string,
    @Param('childId') childId: string,
  ) {
    await this.edgesService.remove(parentId, childId);
  }

  @Get('parents/:nodeId')
  @ApiOperation({ summary: 'Get direct parent nodes' })
  @ApiOkResponse({ description: 'Parents retrieved successfully' })
  async getParents(@Param('nodeId') nodeId: string) {
    const parents = await this.edgesService.getParents(nodeId);
    return {
      nodeId,
      count: parents.length,
      parents,
    };
  }

  @Get('children/:nodeId')
  @ApiOperation({ summary: 'Get direct child nodes' })
  @ApiOkResponse({ description: 'Children retrieved successfully' })
  async getChildren(@Param('nodeId') nodeId: string) {
    const children = await this.edgesService.getChildren(nodeId);
    return {
      nodeId,
      count: children.length,
      children,
    };
  }
}
