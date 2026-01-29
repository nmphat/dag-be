import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Kysely, MysqlDialect } from 'kysely';
import { createPool, Pool, PoolOptions } from 'mysql2';
import { DbRouter } from './db-router';
import type { DB } from './types';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  // ✅ The main entry point for Repositories
  public readonly db: DbRouter;

  // Internal connection pools (stored for cleanup)
  private readonly masterPool: Pool;
  private readonly slavePools: Pool[] = [];

  // Internal Master Kysely instance
  private readonly writeDb: Kysely<DB>;

  constructor() {
    // 1. Common Configuration
    const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT || '10');

    // Use full PoolOptions interface to avoid type errors with 'typeCast'
    const commonConfig: PoolOptions = {
      user: process.env.DATABASE_USER || 'root',
      password: process.env.DATABASE_PASSWORD || 'rootpass123',
      database: process.env.DATABASE_NAME || 'dag_db',
      connectionLimit,
      // Fix: Cast MySQL DATETIME/TIMESTAMP to JavaScript Date objects
      typeCast: function (field, next) {
        if (field.type === 'DATETIME' || field.type === 'TIMESTAMP') {
          return new Date(`${field.string()}`); // Append 'Z' to treat as UTC
        }
        return next();
      },
    };

    // 2. Initialize Master Pool
    this.masterPool = createPool({
      ...commonConfig,
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '3306'),
    });

    // 3. Initialize Slave Pools
    this.slavePools = [];
    if (process.env.DATABASE_SLAVE1_HOST) {
      this.slavePools.push(
        createPool({
          ...commonConfig,
          host: process.env.DATABASE_SLAVE1_HOST,
          port: parseInt(process.env.DATABASE_SLAVE1_PORT || '3307'),
        }),
      );
    }
    if (process.env.DATABASE_SLAVE2_HOST) {
      this.slavePools.push(
        createPool({
          ...commonConfig,
          host: process.env.DATABASE_SLAVE2_HOST,
          port: parseInt(process.env.DATABASE_SLAVE2_PORT || '3308'),
        }),
      );
    }

    // 4. Initialize Master Kysely Instance
    this.writeDb = new Kysely<DB>({
      dialect: new MysqlDialect({ pool: this.masterPool }),
      log: ['query', 'error'],
    });

    // 5. Initialize the DbRouter
    this.db = new DbRouter(this.writeDb, this.slavePools);
  }

  async onModuleInit() {
    try {
      // Health check: Run a simple query on Master
      await this.writeDb.selectFrom('concepts').select('id').limit(1).execute();
      this.logger.log(
        `✅ Database initialized. Slaves connected: ${this.slavePools.length}`,
      );
    } catch (error) {
      this.logger.error('❌ Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    // 1. Destroy Kysely instance
    await this.writeDb
      .destroy()
      .catch((err) => console.error('Error destroying Kysely:', err));

    // 2. Close all raw pools
    const allPools = [this.masterPool, ...this.slavePools];
    await Promise.all(
      allPools.map(
        (pool) =>
          new Promise<void>((resolve) => {
            pool.end((err) => {
              if (err) console.error('Error closing pool:', err);
              resolve();
            });
          }),
      ),
    );
    this.logger.log('✅ Database connections closed');
  }
}
