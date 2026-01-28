import { CamelCasePlugin, Kysely, MysqlDialect } from 'kysely';
import type { Pool } from 'mysql2';
import type { DB } from './types';

export class DbRouter {
  private readonly slaves: Kysely<DB>[];
  private currentSlaveIndex = 0;

  constructor(
    private readonly writeDb: Kysely<DB>, // Master instance (Write)
    readPools: Pool[], // Raw pools for Slaves (Read)
  ) {
    // Initialize Kysely instances for all slave pools with CamelCasePlugin
    this.slaves = readPools.map(
      (pool) =>
        new Kysely<DB>({
          dialect: new MysqlDialect({ pool }),
          plugins: [new CamelCasePlugin()], // Ensure snake_case -> camelCase mapping
          // log: ['query', 'error'],
        }),
    );
  }

  /**
   * Get the write connection (Master).
   */
  write(): Kysely<DB> {
    return this.writeDb;
  }

  /**
   * Get a read connection using Round-Robin load balancing.
   */
  read(): Kysely<DB> {
    if (this.slaves.length === 0) {
      return this.writeDb; // Fallback to Master if no Slaves
    }

    const slave = this.slaves[this.currentSlaveIndex];
    this.currentSlaveIndex = (this.currentSlaveIndex + 1) % this.slaves.length;

    return slave;
  }

  /**
   * Executes a read operation safely with automatic Master fallback.
   */
  async executeRead<T>(operation: (db: Kysely<DB>) => Promise<T>): Promise<T> {
    const slave = this.read();
    try {
      return await operation(slave);
    } catch (error) {
      console.warn('⚠️ Slave failed, falling back to Master:', error);
      return await operation(this.writeDb);
    }
  }
}
