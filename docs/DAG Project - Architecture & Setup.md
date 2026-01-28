# DAG Project - Architecture & Setup (MySQL Replication + ELK)

Complete setup guide cho DAG project với NestJS + Vue 3, MySQL Master-Slave (2 replicas), và Elasticsearch + Kibana.

## 🎯 Architecture Overview

**Backend Stack:**

- NestJS (API server)
- MySQL 8.0 (1 Master + 2 Slaves)
- Elasticsearch 8.11 (Search engine)
- Redis 7 (Caching layer)
- Kibana 8.11 (Monitoring & Visualization)

**Frontend Stack:**

- Vue 3 + TypeScript + Vite
- Pinia (State management)
- TanStack Query (Data fetching + caching)
- vue-virtual-scroller (Performance)

**Data Flow:**

```plaintext
Client → NestJS API → Master (writes) / Slaves (reads)
              ↓
         Elasticsearch (search)
              ↓
           Kibana (metrics)
```

## 🐳 Docker Compose Setup

### docker-compose.yml

```yaml
version: '3.8'

services:
  # MySQL Master
  mysql-master:
    image: mysql:8.0
    container_name: dag-mysql-master
    environment:
      MYSQL_ROOT_PASSWORD: rootpass123
      MYSQL_DATABASE: dag_db
      MYSQL_USER: app_user
      MYSQL_PASSWORD: apppass123
    ports:
      - "3306:3306"
    volumes:
      - mysql-master-data:/var/lib/mysql
      - ./mysql/master/my.cnf:/etc/mysql/my.cnf
      - ./mysql/init-master.sql:/docker-entrypoint-initdb.d/init.sql
    command: --default-authentication-plugin=mysql_native_password
    networks:
      - dag-network

  # MySQL Slave 1
  mysql-slave1:
    image: mysql:8.0
    container_name: dag-mysql-slave1
    environment:
      MYSQL_ROOT_PASSWORD: rootpass123
      MYSQL_DATABASE: dag_db
    ports:
      - "3307:3306"
    volumes:
      - mysql-slave1-data:/var/lib/mysql
      - ./mysql/slave/my.cnf:/etc/mysql/my.cnf
    command: --default-authentication-plugin=mysql_native_password
    depends_on:
      - mysql-master
    networks:
      - dag-network

  # MySQL Slave 2
  mysql-slave2:
    image: mysql:8.0
    container_name: dag-mysql-slave2
    environment:
      MYSQL_ROOT_PASSWORD: rootpass123
      MYSQL_DATABASE: dag_db
    ports:
      - "3308:3306"
    volumes:
      - mysql-slave2-data:/var/lib/mysql
      - ./mysql/slave/my.cnf:/etc/mysql/my.cnf
    command: --default-authentication-plugin=mysql_native_password
    depends_on:
      - mysql-master
    networks:
      - dag-network

  # Redis
  redis:
    image: redis:7-alpine
    container_name: dag-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - dag-network

  # Elasticsearch
  elasticsearch:
    image: [docker.elastic.co/elasticsearch/elasticsearch:8.11.0](http://docker.elastic.co/elasticsearch/elasticsearch:8.11.0)
    container_name: dag-elasticsearch
    environment:
      - discovery.type=single-node
      - [xpack.security](http://xpack.security).enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
      - "9300:9300"
    volumes:
      - es-data:/usr/share/elasticsearch/data
    networks:
      - dag-network

  # Kibana
  kibana:
    image: [docker.elastic.co/kibana/kibana:8.11.0](http://docker.elastic.co/kibana/kibana:8.11.0)
    container_name: dag-kibana
    environment:
      - ELASTICSEARCH_HOSTS=[http://elasticsearch:9200](http://elasticsearch:9200)
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch
    networks:
      - dag-network

volumes:
  mysql-master-data:
  mysql-slave1-data:
  mysql-slave2-data:
  redis-data:
  es-data:

networks:
  dag-network:
    driver: bridge
```

## ⚙️ MySQL Replication Configuration

### mysql/master/my.cnf

```plaintext
[mysqld]
# Server ID (unique)
server-id=1

# Binary logging
log-bin=mysql-bin
binlog_format=ROW
gtid_mode=ON
enforce_gtid_consistency=ON

# Replication settings
max_binlog_size=500M
expire_logs_days=7

# Performance
innodb_buffer_pool_size=1G
innodb_log_file_size=256M
max_connections=500

# Character set
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
```

### mysql/slave/my.cnf

```plaintext
[mysqld]
# Server ID (unique per slave)
server-id=2  # slave1: 2, slave2: 3

# Read-only mode
read_only=ON
super_read_only=ON

# Relay log
relay-log=mysql-relay-bin
log_slave_updates=ON

# GTID
gtid_mode=ON
enforce_gtid_consistency=ON

# Performance
innodb_buffer_pool_size=1G
max_connections=500

# Character set
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
```

### Setup Replication Script

```bash
#!/bin/bash
# [setup-replication.sh](http://setup-replication.sh)

echo "Setting up MySQL replication..."

# Step 1: Create replication user on Master
docker exec -it dag-mysql-master mysql -uroot -prootpass123 <<EOF
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'replpass123';
GRANT REPLICATION SLAVE ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;
EOF

# Step 2: Configure Slave 1
docker exec -it dag-mysql-slave1 mysql -uroot -prootpass123 <<EOF
CHANGE MASTER TO
  MASTER_HOST='mysql-master',
  MASTER_USER='repl_user',
  MASTER_PASSWORD='replpass123',
  MASTER_AUTO_POSITION=1;
START SLAVE;
SHOW SLAVE STATUS\G
EOF

# Step 3: Configure Slave 2
docker exec -it dag-mysql-slave2 mysql -uroot -prootpass123 <<EOF
CHANGE MASTER TO
  MASTER_HOST='mysql-master',
  MASTER_USER='repl_user',
  MASTER_PASSWORD='replpass123',
  MASTER_AUTO_POSITION=1;
START SLAVE;
SHOW SLAVE STATUS\G
EOF

echo "Replication setup complete!"
```

## 🗄️ Database Schema

### mysql/init-master.sql

```sql
USE dag_db;

-- Nodes table
CREATE TABLE nodes (
  id VARCHAR(36) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_label (label),
  FULLTEXT INDEX idx_label_fulltext (label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Edges table (adjacency list for DAG)
CREATE TABLE edges (
  parent_id VARCHAR(36) NOT NULL,
  child_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parent_id, child_id),
  INDEX idx_parent (parent_id),
  INDEX idx_child (child_id),
  FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Example recursive query for ancestors
DELIMITER $$
CREATE PROCEDURE GetAncestors(IN node_id VARCHAR(36))
BEGIN
  WITH RECURSIVE ancestors AS (
    SELECT parent_id, child_id, 1 as depth
    FROM edges
    WHERE child_id = node_id
    
    UNION ALL
    
    SELECT e.parent_id, e.child_id, a.depth + 1
    FROM edges e
    INNER JOIN ancestors a ON e.child_id = a.parent_id
    WHERE a.depth < 100
  )
  SELECT DISTINCT n.* 
  FROM ancestors a
  JOIN nodes n ON a.parent_id = n.id;
END$$
DELIMITER ;
```

## 🔧 NestJS Configuration

### src/config/database.config.ts

```tsx
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Node } from '../entities/node.entity';
import { Edge } from '../entities/edge.entity';

export const databaseConfig: TypeOrmModuleOptions = {
  type: 'mysql',
  replication: {
    master: {
      host: '[localhost](http://localhost)',
      port: 3306,
      username: 'app_user',
      password: 'apppass123',
      database: 'dag_db',
    },
    slaves: [
      {
        host: '[localhost](http://localhost)',
        port: 3307, // slave1
        username: 'app_user',
        password: 'apppass123',
        database: 'dag_db',
      },
      {
        host: '[localhost](http://localhost)',
        port: 3308, // slave2
        username: 'app_user',
        password: 'apppass123',
        database: 'dag_db',
      },
    ],
  },
  entities: [Node, Edge],
  synchronize: false, // use migrations in production
  logging: process.env.NODE_ENV === 'development',
  charset: 'utf8mb4',
};
```

### src/modules/graph/graph.service.ts

```tsx
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Node } from '../../entities/node.entity';
import { Edge } from '../../entities/edge.entity';

@Injectable()
export class GraphService {
  constructor(
    @InjectRepository(Node)
    private nodeRepo: Repository<Node>,
    
    @InjectRepository(Edge)
    private edgeRepo: Repository<Edge>,
    
    private dataSource: DataSource,
  ) {}

  // Read from SLAVE (automatic routing)
  async getAncestors(nodeId: string): Promise<Node[]> {
    const query = `
      WITH RECURSIVE ancestors AS (
        SELECT parent_id, child_id, 1 as depth
        FROM edges
        WHERE child_id = ?
        
        UNION ALL
        
        SELECT e.parent_id, e.child_id, a.depth + 1
        FROM edges e
        INNER JOIN ancestors a ON e.child_id = a.parent_id
        WHERE a.depth < 100
      )
      SELECT DISTINCT n.* 
      FROM ancestors a
      JOIN nodes n ON a.parent_id = [n.id](http://n.id)
    `;
    
    return this.nodeRepo.query(query, [nodeId]);
  }

  // Write to MASTER (automatic routing)
  async createNode(label: string, metadata?: any): Promise<Node> {
    const node = this.nodeRepo.create({
      id: this.generateUUID(),
      label,
      metadata,
    });
    return [this.nodeRepo.save](http://this.nodeRepo.save)(node);
  }

  // Write to MASTER with cycle detection
  async createEdge(parentId: string, childId: string): Promise<Edge> {
    // Check for cycle (must use master for consistency)
    const hasCycle = await this.detectCycle(parentId, childId);
    if (hasCycle) {
      throw new Error('Creating this edge would create a cycle');
    }

    const edge = this.edgeRepo.create({ parent_id: parentId, child_id: childId });
    return [this.edgeRepo.save](http://this.edgeRepo.save)(edge);
  }

  // Cycle detection (must read from MASTER)
  private async detectCycle(parentId: string, childId: string): Promise<boolean> {
    const query = `
      WITH RECURSIVE path AS (
        SELECT parent_id, child_id
        FROM edges
        WHERE parent_id = ?
        
        UNION ALL
        
        SELECT e.parent_id, e.child_id
        FROM edges e
        INNER JOIN path p ON e.parent_id = p.child_id
      )
      SELECT 1 FROM path WHERE child_id = ? LIMIT 1
    `;
    
    // Force master connection for consistency
    const result = await this.dataSource.query(query, [childId, parentId]);
    return result.length > 0;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
```

### src/modules/search/search.service.ts

```tsx
import { Injectable } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { Node } from '../../entities/node.entity';

@Injectable()
export class SearchService {
  private readonly indexName = 'nodes';

  constructor(
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

  async indexNode(node: Node): Promise<void> {
    await this.elasticsearchService.index({
      index: this.indexName,
      id: [node.id](http://node.id),
      document: {
        label: node.label,
        metadata: node.metadata,
        created_at: node.created_at,
      },
    });
  }

  async searchNodes(query: string, options?: {
    from?: number;
    size?: number;
  }): Promise<{ nodes: Node[]; total: number }> {
    const { from = 0, size = 50 } = options || {};

    const result = await [this.elasticsearchService.search](http://this.elasticsearchService.search)({
      index: this.indexName,
      from,
      size,
      body: {
        query: {
          multi_match: {
            query,
            fields: ['label^2', 'metadata'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        },
        highlight: {
          fields: {
            label: {},
          },
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
      },
    });

    return {
      nodes: [result.hits.hits.map](http://result.hits.hits.map)((hit: any) => ({
        ...hit._source,
        highlight: hit.highlight,
        score: hit._score,
      })),
      total: [result.hits.total](http://result.hits.total).value,
    };
  }

  async deleteNode(nodeId: string): Promise<void> {
    await this.elasticsearchService.delete({
      index: this.indexName,
      id: nodeId,
    });
  }
}
```

### src/app.module.ts

```tsx
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { databaseConfig } from './config/database.config';
import { GraphModule } from './modules/graph/graph.module';
import { SearchModule } from './modules/search/search.module';

@Module({
  imports: [
    // TypeORM with replication
    TypeOrmModule.forRoot(databaseConfig),
    
    // Elasticsearch
    ElasticsearchModule.register({
      node: '[http://localhost:9200](http://localhost:9200)',
    }),
    
    // Redis cache
    CacheModule.register({
      store: redisStore,
      host: '[localhost](http://localhost)',
      port: 6379,
      ttl: 300, // 5 minutes default
    }),
    
    GraphModule,
    SearchModule,
  ],
})
export class AppModule {}
```

## 🚀 Setup Instructions

### 1. Start Services

```bash
# Start all containers
docker-compose up -d

# Wait 30 seconds for MySQL to initialize
sleep 30

# Setup replication
chmod +x [setup-replication.sh](http://setup-replication.sh)
./[setup-replication.sh](http://setup-replication.sh)

# Verify replication status
docker exec -it dag-mysql-slave1 mysql -uroot -prootpass123 -e "SHOW SLAVE STATUS\\G"
```

### 2. Initialize Elasticsearch Index

```bash
curl -X PUT "[localhost:9200/nodes](http://localhost:9200/nodes)" -H 'Content-Type: application/json' -d'
{
  "mappings": {
    "properties": {
      "label": {
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": {
            "type": "keyword"
          }
        }
      },
      "metadata": {
        "type": "object",
        "enabled": true
      },
      "created_at": {
        "type": "date"
      }
    }
  },
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0
  }
}
'
```

### 3. Install NestJS Dependencies

```bash
npm install @nestjs/typeorm typeorm mysql2
npm install @nestjs/elasticsearch @elastic/elasticsearch
npm install @nestjs/cache-manager cache-manager cache-manager-redis-store
npm install redis
```

### 4. Verify Setup

```bash
# Check MySQL replication
docker exec dag-mysql-master mysql -uroot -prootpass123 -e "SHOW MASTER STATUS"

# Check Elasticsearch
curl [http://localhost:9200/_cluster/health](http://localhost:9200/_cluster/health)

# Check Kibana
open [http://localhost:5601](http://localhost:5601)

# Check Redis
redis-cli ping
```

## 📊 Performance Testing

### Load Test Script

```tsx
// scripts/load-test.ts
import { performance } from 'perf_hooks';

async function loadTest() {
  const nodeCount = 1_000_000;
  const batchSize = 1000;
  
  console.log(`Creating ${nodeCount} nodes...`);
  
  const start = [performance.now](http://performance.now)();
  
  for (let i = 0; i < nodeCount; i += batchSize) {
    const nodes = Array.from({ length: batchSize }, (_, j) => ({
      id: `node-${i + j}`,
      label: `Node ${i + j}`,
      metadata: { batch: i / batchSize },
    }));
    
    await insertBatch(nodes);
    
    if (i % 10000 === 0) {
      console.log(`Progress: ${i}/${nodeCount}`);
    }
  }
  
  const duration = [performance.now](http://performance.now)() - start;
  console.log(`Completed in ${(duration / 1000).toFixed(2)}s`);
  console.log(`Throughput: ${(nodeCount / (duration / 1000)).toFixed(0)} nodes/sec`);
}
```

## 📈 Monitoring với Kibana

**Access Kibana:** [http://localhost:5601](http://localhost:5601)

**Key Metrics to Track:**

1. Search query latency (p50, p95, p99)
2. Index throughput
3. Cache hit rate
4. MySQL replication lag

**Create Dashboard:**

- Query response times
- Top search queries
- Error rates
- System resource usage

## ✅ Expected Performance

| Operation | Target | Notes |
| --- | --- | --- |
| Node search | < 200ms | p95, với Elasticsearch |
| Ancestors query (depth 10) | < 100ms | With indexes |
| Node insert | < 10ms | Master write |
| Replication lag | < 500ms | Slave behind master |
| Cache hit rate | > 80% | For hot paths |
| Concurrent users | 1000+ | With 2 read replicas |

## 🎯 Next Steps

1. **Frontend:** Build Vue 3 app với virtual scrolling
2. **Testing:** Unit tests + integration tests
3. **Load testing:** Verify performance với 1M nodes
4. **Documentation:** Write report với screenshots từ Kibana
5. **Bonus features:** Implement optional requirements

---

## 📡 Observability Stack (Grafana + OpenTelemetry)

**Tại sao thêm Grafana + OpenTelemetry?**

- ✅ **Production-grade monitoring** - Industry standard
- ✅ **Distributed tracing** - Track requests across services
- ✅ **Custom metrics** - Business logic insights
- ✅ **Beautiful dashboards** - Impressive for presentations
- ✅ **Show off tech skills** - Modern observability practices

### Updated Docker Compose

```yaml
  # Grafana
  grafana:
    image: grafana/grafana:10.2.0
    container_name: dag-grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin123
      - GF_USERS_ALLOW_SIGN_UP=false
    ports:
      - "3001:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    depends_on:
      - prometheus
    networks:
      - dag-network

  # Prometheus (metrics storage)
  prometheus:
    image: prom/prometheus:v2.48.0
    container_name: dag-prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    networks:
      - dag-network

  # Jaeger (distributed tracing)
  jaeger:
    image: jaegertracing/all-in-one:1.51
    container_name: dag-jaeger
    environment:
      - COLLECTOR_OTLP_ENABLED=true
    ports:
      - "16686:16686"  # Jaeger UI
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP
    networks:
      - dag-network

  # OpenTelemetry Collector
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.91.0
    container_name: dag-otel-collector
    command: ["--config=/etc/otel-collector-config.yml"]
    volumes:
      - ./otel/otel-collector-config.yml:/etc/otel-collector-config.yml
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "8888:8888"   # Prometheus metrics
      - "8889:8889"   # Prometheus exporter
    depends_on:
      - jaeger
      - prometheus
    networks:
      - dag-network

volumes:
  # ... existing volumes ...
  grafana-data:
  prometheus-data:
```

### OpenTelemetry Collector Config

```yaml
# otel/otel-collector-config.yml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024
  
  memory_limiter:
    check_interval: 1s
    limit_mib: 512

exporters:
  # Export traces to Jaeger
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true
  
  # Export metrics to Prometheus
  prometheus:
    endpoint: "0.0.0.0:8889"
  
  # Logging for debugging
  logging:
    loglevel: info

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp/jaeger, logging]
    
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus, logging]
```

### Prometheus Config

```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  # NestJS metrics
  - job_name: 'nestjs'
    static_configs:
      - targets: ['host.docker.internal:3000']
  
  # OpenTelemetry Collector metrics
  - job_name: 'otel-collector'
    static_configs:
      - targets: ['otel-collector:8888', 'otel-collector:8889']
  
  # MySQL metrics (if using mysqld_exporter)
  - job_name: 'mysql'
    static_configs:
      - targets: ['mysql-exporter:9104']
  
  # Redis metrics (if using redis_exporter)
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

### NestJS OpenTelemetry Integration

```tsx
// src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const traceExporter = new OTLPTraceExporter({
  url: '[http://localhost:4318/v1/traces](http://localhost:4318/v1/traces)',
});

const metricExporter = new OTLPMetricExporter({
  url: '[http://localhost:4318/v1/metrics](http://localhost:4318/v1/metrics)',
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'dag-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // reduce noise
      },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('Tracing terminated'))
    .catch((error) => console.log('Error terminating tracing', error))
    .finally(() => process.exit(0));
});

export default sdk;
```

```tsx
// src/main.ts
import './tracing'; // Import FIRST
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
bootstrap();
```

### Custom Metrics

```tsx
// src/modules/graph/graph.service.ts
import { Injectable } from '@nestjs/common';
import { trace, metrics } from '@opentelemetry/api';

@Injectable()
export class GraphService {
  private readonly tracer = trace.getTracer('graph-service');
  private readonly meter = metrics.getMeter('graph-service');
  
  // Custom metrics
  private readonly ancestorQueryCounter = this.meter.createCounter('dag.ancestors.queries', {
    description: 'Number of ancestor queries',
  });
  
  private readonly ancestorQueryDuration = this.meter.createHistogram('dag.ancestors.duration', {
    description: 'Duration of ancestor queries in ms',
    unit: 'ms',
  });

  async getAncestors(nodeId: string): Promise<Node[]> {
    // Create span for distributed tracing
    return this.tracer.startActiveSpan('getAncestors', async (span) => {
      const startTime = [Date.now](http://Date.now)();
      
      try {
        span.setAttribute('[node.id](http://node.id)', nodeId);
        
        const result = await this.nodeRepo.query(/* ... */);
        
        span.setAttribute('result.count', result.length);
        
        // Record metrics
        this.ancestorQueryCounter.add(1, { status: 'success' });
        this.ancestorQueryDuration.record([Date.now](http://Date.now)() - startTime);
        
        return result;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message });
        
        this.ancestorQueryCounter.add(1, { status: 'error' });
        
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
```

### Grafana Dashboard JSON

```json
// grafana/provisioning/dashboards/dag-dashboard.json
{
  "dashboard": {
    "title": "DAG API Performance",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Response Time (p95)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
          }
        ]
      },
      {
        "title": "Ancestor Queries/sec",
        "targets": [
          {
            "expr": "rate(dag_ancestors_queries_total[5m])"
          }
        ]
      },
      {
        "title": "MySQL Replication Lag",
        "targets": [
          {
            "expr": "mysql_slave_status_seconds_behind_master"
          }
        ]
      },
      {
        "title": "Cache Hit Rate",
        "targets": [
          {
            "expr": "rate(redis_hits_total[5m]) / (rate(redis_hits_total[5m]) + rate(redis_misses_total[5m]))"
          }
        ]
      }
    ]
  }
}
```

### Install Dependencies

```bash
# OpenTelemetry
npm install @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-metrics \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/api

# Prometheus metrics (alternative/additional)
npm install @willsoto/nestjs-prometheus prom-client
```

### Access URLs

- **Grafana:** [http://localhost:3001](http://localhost:3001) (admin/admin123)
- **Prometheus:** [http://localhost:9090](http://localhost:9090)
- **Jaeger UI:** [http://localhost:16686](http://localhost:16686)
- **Kibana:** [http://localhost:5601](http://localhost:5601)

### Key Metrics to Show in Report

**Performance Metrics:**

- Request throughput (req/sec)
- Response time percentiles (p50, p95, p99)
- Error rate
- Database query duration

**Business Metrics:**

- Ancestor queries per second
- Search queries per second
- Cycle detection rate
- Cache hit/miss ratio

**Infrastructure Metrics:**

- MySQL replication lag
- CPU/Memory usage
- Connection pool status
- Elasticsearch indexing rate

**Distributed Tracing:**

- End-to-end request traces
- Service dependencies
- Slow query identification
- Error root cause analysis

---

**Full Stack Summary:**

- ✅ MySQL 8.0 Master + 2 Slaves (replication)
- ✅ Elasticsearch 8.11 (search)
- ✅ Kibana 8.11 (ES monitoring)
- ✅ Redis 7 (caching)
- ✅ **Grafana 10 (metrics visualization)** 🆕
- ✅ **Prometheus (metrics storage)** 🆕
- ✅ **Jaeger (distributed tracing)** 🆕
- ✅ **OpenTelemetry (instrumentation)** 🆕
- ✅ NestJS (API)
- ✅ Vue 3 (Frontend)

**Production-grade observability stack! 🚀📊**

## 🌐 Deployment & CI/CD Strategy (No VPS/Domain needed)

**Vấn đề:** Không có VPS hay domain, làm sao deploy và setup CI/CD?

**Solution:** Sử dụng free tier services!

### Option 1: [Railway.app](http://Railway.app) (Recommended) ⭐

**Tại sao chọn Railway:**

- ✅ **Free tier**: $5 credit/tháng (đủ cho demo)
- ✅ **Zero config**: Deploy từ GitHub auto
- ✅ **Built-in databases**: MySQL, Redis, PostgreSQL
- ✅ **Auto HTTPS**: Free domain + SSL
- ✅ **Environment variables**: Easy management
- ✅ **Logs & metrics**: Built-in monitoring

**Setup Railway:**

```bash
# 1. Install Railway CLI
npm i -g @railway/cli

# 2. Login
railway login

# 3. Init project
railway init

# 4. Add services
railway add mysql
railway add redis

# 5. Deploy
railway up
```

**railway.json:**

```json
{
  "$schema": "[https://railway.app/railway.schema.json](https://railway.app/railway.schema.json)",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm run start:prod",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Free tier limits:**

- $5 credit (~500 hours)
- Đủ cho demo + testing
- Auto sleep khi không dùng

---

### Option 2: [Render.com](http://Render.com) (Alternative)

**Pros:**

- Free tier persistent (không hết credit)
- Auto deploy từ GitHub
- Free SSL + subdomain

**Cons:**

- Spin down sau 15 phút inactive (cold start ~30s)
- 750 hours/month limit

**render.yaml:**

```yaml
services:
  # NestJS API
  - type: web
    name: dag-api
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm run start:prod
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: dag-mysql
          property: connectionString

databases:
  - name: dag-mysql
    plan: free
    databaseName: dag_db
    user: dag_user
```

---

### Option 3: [Fly.io](http://Fly.io) (Best for MySQL replication)

**Tại sao [Fly.io](http://Fly.io) cho MySQL replication:**

- ✅ Support multiple DB instances
- ✅ Free tier: 3 VMs
- ✅ Global deployment
- ✅ Persistent volumes

**fly.toml:**

```toml
app = "dag-api"
primary_region = "sin" # Singapore

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  NODE_ENV = "production"

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]
  
  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[[services.http_checks]]
  interval = 10000
  timeout = 2000
  grace_period = "5s"
  method = "get"
  path = "/health"
```

**Deploy:**

```bash
# Install Fly CLI
curl -L [https://fly.io/install.sh](https://fly.io/install.sh) | sh

# Login
fly auth login

# Deploy
fly launch
fly deploy
```

---

### Option 4: Docker Compose trên local (cho demo)

**Nếu chỉ cần demo, không cần deploy:**

- Run toàn bộ stack trên laptop
- Screen recording cho report
- Expose qua ngrok (temporary public URL)

**Expose với ngrok:**

```bash
# Install ngrok
brew install ngrok  # macOS
# hoặc download từ [ngrok.com](http://ngrok.com)

# Expose NestJS API
ngrok http 3000

# Expose Grafana
ngrok http 3001

# Expose Kibana  
ngrok http 5601
```

---

## 🔄 CI/CD Setup

### GitHub Actions (Free, Recommended)

**.github/workflows/deploy.yml:**

```yaml
name: Deploy DAG API

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: testpass
          MYSQL_DATABASE: dag_db_test
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3
      
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run tests
        run: npm run test
        env:
          DATABASE_URL: mysql://root:[testpass@localhost:3306](mailto:testpass@localhost:3306)/dag_db_test
          REDIS_URL: redis://[localhost:6379](http://localhost:6379)
      
      - name: Run e2e tests
        run: npm run test:e2e
      
      - name: Build
        run: npm run build
  
  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      # Deploy to Railway
      - name: Deploy to Railway
        uses: bervProject/railway-deploy@main
        with:
          railway_token: $ secrets.RAILWAY_TOKEN 
          service: dag-api
      
      # Alternative: Deploy to Render
      # - name: Deploy to Render
      #   uses: bounceapp/render-action@0.6.0
      #   with:
      #     render-token: $ secrets.RENDER_TOKEN 
      #     service-id: $ secrets.RENDER_SERVICE_ID 
      
      # Alternative: Deploy to [Fly.io](http://Fly.io)
      # - name: Deploy to [Fly.io](http://Fly.io)
      #   uses: superfly/flyctl-actions/setup-flyctl@master
      # - run: flyctl deploy --remote-only
      #   env:
      #     FLY_API_TOKEN: $ [secrets.FLY](http://secrets.FLY)_API_TOKEN 
  
  performance-test:
    needs: deploy
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Run load tests
        run: |
          npm install -g artillery
          artillery run load-test.yml
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: load-test-report.json
```

### Load Test Config

**load-test.yml:**

```yaml
config:
  target: "[https://your-app.railway.app](https://your-app.railway.app)"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100
      name: "Spike test"
  
scenarios:
  - name: "Search nodes"
    weight: 60
    flow:
      - get:
          url: "/api/search?q=node"
  
  - name: "Get ancestors"
    weight: 30
    flow:
      - get:
          url: "/api/graph/ancestors/ $randomString() "
  
  - name: "Create node"
    weight: 10
    flow:
      - post:
          url: "/api/nodes"
          json:
            label: "Test node  $randomString() "
```

---

## 📦 Database Migration Strategy

**TypeORM migrations cho CI/CD:**

```tsx
// src/migrations/1234567890-InitSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1234567890 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE nodes (
        id VARCHAR(36) PRIMARY KEY,
        label VARCHAR(255) NOT NULL,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_label (label),
        FULLTEXT INDEX idx_label_fulltext (label)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    await queryRunner.query(`
      CREATE TABLE edges (
        parent_id VARCHAR(36) NOT NULL,
        child_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (parent_id, child_id),
        INDEX idx_parent (parent_id),
        INDEX idx_child (child_id),
        FOREIGN KEY (parent_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (child_id) REFERENCES nodes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE edges');
    await queryRunner.query('DROP TABLE nodes');
  }
}
```

**package.json scripts:**

```json
{
  "scripts": {
    "migration:generate": "typeorm migration:generate",
    "migration:run": "typeorm migration:run",
    "migration:revert": "typeorm migration:revert",
    "seed": "ts-node src/seeds/seed.ts"
  }
}
```

---

## 🎯 Recommendation cho project này

**Best setup cho 10-15h project:**

**1. Development (local):**

```bash
docker-compose up -d  # Full stack local
ngrok http 3000       # Public URL cho testing
```

**2. CI/CD:**

```
GitHub → GitHub Actions → Railway/Render
├── Auto test
├── Auto build  
└── Auto deploy
```

**3. Demo:**

- **Option A:** Railway deploy + public URL (best)
- **Option B:** Local + ngrok + screen recording
- **Option C:** Docker Compose + demo video

**4. Report:**

- Screenshots từ deployed app
- CI/CD pipeline diagram
- Load test results từ GitHub Actions
- Architecture diagram với deployment

---

## 💰 Cost Breakdown (FREE!)

| Service | Free Tier | Đủ cho demo? |
| --- | --- | --- |
| Railway | $5 credit | ✅ 1-2 tháng |
| Render | 750h/month | ✅ Always free |
| [Fly.io](http://Fly.io) | 3 VMs free | ✅ Always free |
| GitHub Actions | 2000 min/month | ✅ More than enough |
| ngrok | 1 tunnel | ✅ Perfect cho demo |

**Total cost: $0** 🎉

---

## ✅ Implementation Checklist

- [ ]  Push code to GitHub
- [ ]  Setup Railway/Render account
- [ ]  Configure environment variables
- [ ]  Setup GitHub Actions
- [ ]  Run migrations on deploy
- [ ]  Test deployed API
- [ ]  Load test với Artillery
- [ ]  Screenshots cho report
- [ ]  Demo video (optional)

**Estimated setup time: 1-2 hours**
