import { Module } from '@nestjs/common';
import { SearchModule } from 'src/search/search.module';
import { ConceptsController } from './concepts.controller';
import { ConceptsService } from './concepts.service';
import { TaxonomyCacheService } from './services/taxonomy-cache.service';
import { TaxonomyPathStreamService } from './services/taxonomy-path-stream.service';

@Module({
  imports: [SearchModule],
  controllers: [ConceptsController],
  providers: [ConceptsService, TaxonomyCacheService, TaxonomyPathStreamService],
  exports: [ConceptsService, TaxonomyCacheService, TaxonomyPathStreamService],
})
export class ConceptsModule {}
