import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { ConceptsController } from './concepts.controller';
import { ConceptsService } from './concepts.service';

@Module({
  imports: [SearchModule],
  controllers: [ConceptsController],
  providers: [ConceptsService],
  exports: [ConceptsService],
})
export class ConceptsModule {}
