# Step 2-008: API 확장성 및 성능 최적화 가이드라인

## 1. 데이터베이스 최적화
### 1.1 인덱스 설정
- [ ] /prisma/migrations/[timestamp]_add_indexes.sql
  ```sql
  -- 사용자 테이블 인덱스
  CREATE INDEX idx_users_email ON users(email);
  CREATE INDEX idx_users_created_at ON users(created_at);
  
  -- 팀 테이블 인덱스
  CREATE INDEX idx_teams_name ON teams(name);
  CREATE INDEX idx_teams_created_at ON teams(created_at);
  
  -- 매치 테이블 인덱스
  CREATE INDEX idx_matches_date ON matches(match_date);
  CREATE INDEX idx_matches_status ON matches(status);
  CREATE INDEX idx_matches_team_id ON matches(team_id);
  ```

### 1.2 쿼리 최적화
- [ ] /lib/db/query-builder.ts
  ```typescript
  import { PrismaClient } from '@prisma/client';
  import { QueryOptions } from './types';

  export class QueryBuilder {
    private prisma: PrismaClient;

    constructor() {
      this.prisma = new PrismaClient();
    }

    async findUsers(options: QueryOptions) {
      const { page = 1, limit = 10, orderBy = 'created_at', order = 'desc' } = options;
      const skip = (page - 1) * limit;

      return this.prisma.user.findMany({
        take: limit,
        skip,
        orderBy: { [orderBy]: order },
        select: {
          id: true,
          email: true,
          name: true,
          created_at: true,
          // 필요한 필드만 선택
        }
      });
    }

    async findTeamWithMembers(teamId: string) {
      return this.prisma.team.findUnique({
        where: { id: teamId },
        include: {
          members: {
            select: {
              id: true,
              name: true,
              role: true
            }
          }
        }
      });
    }
  }
  ```

## 2. 캐싱 전략
### 2.1 Redis 캐시 설정
- [ ] /lib/cache/redis.ts
  ```typescript
  import { Redis } from 'ioredis';
  import { CacheConfig } from './types';

  export class RedisCache {
    private redis: Redis;
    private config: CacheConfig;

    constructor(config: CacheConfig) {
      this.redis = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: 0,
        retryStrategy: (times) => Math.min(times * 50, 2000)
      });

      this.config = config;
    }

    async get<T>(key: string): Promise<T | null> {
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const defaultTTL = this.config.defaultTTL || 300;
      await this.redis.set(
        key,
        JSON.stringify(value),
        'EX',
        ttl || defaultTTL
      );
    }

    async invalidate(pattern: string): Promise<void> {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
  ```

### 2.2 메모리 캐시 설정
- [ ] /lib/cache/memory.ts
  ```typescript
  import LRU from 'lru-cache';
  import { CacheConfig } from './types';

  export class MemoryCache {
    private cache: LRU<string, any>;

    constructor(config: CacheConfig) {
      this.cache = new LRU({
        max: config.maxItems || 1000,
        maxAge: (config.defaultTTL || 300) * 1000
      });
    }

    get<T>(key: string): T | null {
      return this.cache.get(key) || null;
    }

    set<T>(key: string, value: T, ttl?: number): void {
      this.cache.set(key, value, ttl ? ttl * 1000 : undefined);
    }

    invalidate(pattern: string): void {
      const keys = Array.from(this.cache.keys()).filter(key => 
        new RegExp(pattern).test(key)
      );
      keys.forEach(key => this.cache.del(key));
    }
  }
  ```

## 3. 성능 최적화
### 3.1 API 응답 최적화
- [ ] /lib/api/optimizations.ts
  ```typescript
  import { NextApiResponse } from 'next';
  import { gzip } from 'zlib';
  import { promisify } from 'util';

  const gzipAsync = promisify(gzip);

  export class ResponseOptimizer {
    static async optimize(res: NextApiResponse, data: any): Promise<void> {
      // 응답 데이터 최적화
      const optimizedData = this.optimizeData(data);

      // GZIP 압축 적용
      if (this.shouldCompress(optimizedData)) {
        const compressed = await gzipAsync(JSON.stringify(optimizedData));
        res.setHeader('Content-Encoding', 'gzip');
        res.send(compressed);
        return;
      }

      res.json(optimizedData);
    }

    private static optimizeData(data: any): any {
      if (Array.isArray(data)) {
        return data.map(item => this.optimizeObject(item));
      }
      return this.optimizeObject(data);
    }

    private static optimizeObject(obj: any): any {
      // null이나 undefined 필드 제거
      return Object.entries(obj).reduce((acc, [key, value]) => {
        if (value != null) {
          acc[key] = value;
        }
        return acc;
      }, {} as any);
    }

    private static shouldCompress(data: any): boolean {
      const size = JSON.stringify(data).length;
      return size > 1024; // 1KB 이상일 경우 압축
    }
  }
  ```

### 3.2 비동기 작업 최적화
- [ ] /lib/queue/worker.ts
  ```typescript
  import Bull from 'bull';
  import { JobProcessor } from './types';

  export class QueueWorker {
    private queue: Bull.Queue;
    private processor: JobProcessor;

    constructor(queueName: string, processor: JobProcessor) {
      this.queue = new Bull(queueName, {
        redis: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000
          }
        }
      });

      this.processor = processor;
      this.setupWorker();
    }

    private setupWorker(): void {
      this.queue.process(async (job) => {
        try {
          return await this.processor(job.data);
        } catch (error) {
          console.error(`Job ${job.id} failed:`, error);
          throw error;
        }
      });

      this.queue.on('completed', (job) => {
        console.log(`Job ${job.id} completed`);
      });

      this.queue.on('failed', (job, error) => {
        console.error(`Job ${job?.id} failed:`, error);
      });
    }

    async addJob(data: any, options?: Bull.JobOptions): Promise<Bull.Job> {
      return this.queue.add(data, options);
    }
  }
  ```

## 4. 부하 분산
### 4.1 로드 밸런서 설정
- [ ] /nginx/nginx.conf
  ```nginx
  upstream api_servers {
    least_conn;  # 최소 연결 수 기반 부하 분산
    server api1:3000;
    server api2:3000;
    server api3:3000;
    keepalive 32;
  }

  server {
    listen 80;
    server_name api.example.com;

    location / {
      proxy_pass http://api_servers;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;

      # 타임아웃 설정
      proxy_connect_timeout 60s;
      proxy_send_timeout 60s;
      proxy_read_timeout 60s;

      # 버퍼 설정
      proxy_buffering on;
      proxy_buffer_size 8k;
      proxy_buffers 8 8k;
      proxy_busy_buffers_size 16k;
    }
  }
  ```

### 4.2 수평적 확장 설정
- [ ] /docker-compose.scale.yml
  ```yaml
  version: '3.8'

  services:
    api:
      build:
        context: .
        target: runner
      deploy:
        replicas: 3
        update_config:
          parallelism: 1
          delay: 10s
        restart_policy:
          condition: on-failure
          max_attempts: 3
          window: 120s
      environment:
        - NODE_ENV=production
      env_file:
        - .env.production
      networks:
        - app-network

    nginx:
      image: nginx:alpine
      ports:
        - "80:80"
      volumes:
        - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      depends_on:
        - api
      networks:
        - app-network

networks:
  app-network:
    driver: bridge
  ```

## 5. 성능 모니터링
### 5.1 성능 메트릭 수집
- [ ] /lib/monitoring/performance.ts
  ```typescript
  import { Metrics } from '@opentelemetry/api';
  import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

  export class PerformanceMonitor {
    private metrics: Metrics;

    constructor() {
      this.metrics = new Metrics({
        exporter: new PrometheusExporter(),
        metrics: {
          responseTime: {
            name: 'api_response_time',
            description: 'API response time in milliseconds',
            unit: 'ms'
          },
          requestRate: {
            name: 'api_request_rate',
            description: 'Number of requests per second',
            unit: 'requests/s'
          },
          errorRate: {
            name: 'api_error_rate',
            description: 'Number of errors per second',
            unit: 'errors/s'
          },
          cpuUsage: {
            name: 'api_cpu_usage',
            description: 'CPU usage percentage',
            unit: '%'
          },
          memoryUsage: {
            name: 'api_memory_usage',
            description: 'Memory usage in bytes',
            unit: 'bytes'
          }
        }
      });
    }

    recordResponseTime(path: string, method: string, time: number): void {
      this.metrics.record('responseTime', time, {
        path,
        method
      });
    }

    recordRequest(path: string, method: string): void {
      this.metrics.increment('requestRate', {
        path,
        method
      });
    }

    recordError(path: string, method: string, errorCode: string): void {
      this.metrics.increment('errorRate', {
        path,
        method,
        errorCode
      });
    }

    recordSystemMetrics(): void {
      const usage = process.cpuUsage();
      this.metrics.record('cpuUsage', usage.user / 1000000);
      this.metrics.record('memoryUsage', process.memoryUsage().heapUsed);
    }
  }
  ```

## 다음 단계
- step2-api-009.md: API 문서화 및 테스트 자동화 가이드라인 