import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { SearchService } from './search.service';

@Module({
  imports: [
    ConfigModule,
    ElasticsearchModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        node: configService.get<string>(
          'ELASTICSEARCH_NODE',
          'http://localhost:9200',
        ),
        auth: {
          username: configService.get<string>(
            'ELASTICSEARCH_USERNAME',
            'elastic',
          ),
          password: configService.get<string>(
            'ELASTICSEARCH_PASSWORD',
            'changeme',
          ),
        },
        maxRetries: 10,
        requestTimeout: 60000,
      }),
    }),
  ],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
