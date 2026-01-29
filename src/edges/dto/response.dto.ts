import { ApiProperty } from '@nestjs/swagger';
import { ConceptResponseDto } from '../../concepts/dto/response.dto';

export class EdgeRelatedNodesResponseDto {
  @ApiProperty({ example: 'n_123' })
  nodeId: string;

  @ApiProperty({ example: 5 })
  count: number;
}

export class EdgeParentsResponseDto extends EdgeRelatedNodesResponseDto {
  @ApiProperty({ type: [ConceptResponseDto] })
  parents: ConceptResponseDto[];
}

export class EdgeChildrenResponseDto extends EdgeRelatedNodesResponseDto {
  @ApiProperty({ type: [ConceptResponseDto] })
  children: ConceptResponseDto[];
}
