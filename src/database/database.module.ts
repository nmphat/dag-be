import { Global, Module } from '@nestjs/common';
import { DatabaseService } from 'src/db/database.service';
import { ConceptRepository, EdgeRepository } from './repositories';
import { VariantRepository } from './repositories/variants.repository';

@Global()
@Module({
  providers: [
    DatabaseService,
    ConceptRepository,
    EdgeRepository,
    VariantRepository,
  ],
  exports: [
    DatabaseService,
    ConceptRepository,
    EdgeRepository,
    VariantRepository,
  ],
})
export class DatabaseModule {}
