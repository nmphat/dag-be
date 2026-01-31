import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { EdgesService } from './edges.service';

@Module({
  imports: [SearchModule],
  providers: [EdgesService],
  exports: [EdgesService],
})
export class EdgesModule {}
