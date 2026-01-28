import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateEdgeDto {
  @ApiProperty({
    description: 'ID of the parent node',
    example: 'node-1',
  })
  @IsString()
  parentId: string;

  @ApiProperty({
    description: 'ID of the child node',
    example: 'node-2',
  })
  @IsString()
  childId: string;
}
