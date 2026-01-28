import { Global, Module } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { ConceptRepository, EdgeRepository } from './repositories';

@Global()
@Module({
  providers: [DatabaseService, ConceptRepository, EdgeRepository],
  exports: [DatabaseService, ConceptRepository, EdgeRepository],
})
export class DatabaseModule {}
