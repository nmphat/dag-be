import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from './db/database.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private databaseService: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('db')
  @ApiOperation({ summary: 'Database connectivity check (DbRouter read)' })
  async testDatabase() {
    try {
      // Test read replica with DbRouter and timeout
      const result = await Promise.race([
        this.databaseService.db
          .read()
          .selectFrom('concepts')
          .select(({ fn }) => [fn.count('id').as('count')])
          .executeTakeFirst(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database query timeout')), 5000),
        ),
      ]);

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          nodeCount: Number(
            (result as { count: number } | undefined)?.count || 0,
          ),
        },
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: {
          error: error.message,
        },
      };
    }
  }
}
