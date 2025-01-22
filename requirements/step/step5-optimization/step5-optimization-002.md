# Step 5-002: 성능 최적화 - 서버 사이드

## 1. 데이터베이스 최적화
### 1.1 인덱스 최적화
```sql
-- prisma/migrations/YYYYMMDDHHMMSS_optimize_indexes/migration.sql
-- 복합 인덱스 추가
CREATE INDEX "team_members_team_id_user_id_idx" ON "team_members"("team_id", "user_id");
CREATE INDEX "users_email_status_idx" ON "users"("email", "status");

-- 부분 인덱스 추가
CREATE INDEX "active_users_idx" ON "users"("email") WHERE status = 'ACTIVE';
CREATE INDEX "team_owners_idx" ON "team_members"("team_id") WHERE role = 'OWNER';

-- B-tree 인덱스
CREATE INDEX CONCURRENTLY "users_created_at_idx" ON "users" USING btree ("created_at" DESC);
```

### 1.2 쿼리 최적화
```typescript
// lib/repositories/team.ts
import { Prisma } from '@prisma/client';

export class TeamRepository {
  // N+1 문제 해결을 위한 포함 관계 정의
  private readonly defaultIncludes = Prisma.validator<Prisma.TeamInclude>()({
    members: {
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    },
  });

  // 효율적인 페이지네이션 쿼리
  async findManyWithCursor(params: {
    cursor?: string;
    take: number;
    where?: Prisma.TeamWhereInput;
  }) {
    const { cursor, take, where } = params;

    return await prisma.team.findMany({
      take,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      where,
      include: this.defaultIncludes,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // 집계 쿼리 최적화
  async getTeamStats(teamId: string) {
    const [memberCount, activeMembers] = await prisma.$transaction([
      prisma.teamMember.count({
        where: { teamId },
      }),
      prisma.teamMember.count({
        where: {
          teamId,
          user: {
            status: 'ACTIVE',
          },
        },
      }),
    ]);

    return { memberCount, activeMembers };
  }
}
```

## 2. 캐시 최적화
### 2.1 Redis 캐시 설정
```typescript
// lib/cache/redis.ts
import { Redis } from 'ioredis';
import { env } from '@/lib/env';

const globalForRedis = global as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ||
  new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}
```

### 2.2 캐시 미들웨어
```typescript
// lib/cache/middleware.ts
import { redis } from './redis';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function cacheMiddleware(
  request: NextRequest,
  handler: () => Promise<Response>
) {
  const cacheKey = request.url;
  
  try {
    // 캐시된 응답 확인
    const cachedResponse = await redis.get(cacheKey);
    if (cachedResponse) {
      return NextResponse.json(JSON.parse(cachedResponse));
    }

    // 새로운 응답 생성 및 캐시
    const response = await handler();
    const data = await response.json();
    
    await redis.set(
      cacheKey,
      JSON.stringify(data),
      'EX',
      60 * 5 // 5분 캐시
    );

    return NextResponse.json(data);
  } catch (error) {
    return handler();
  }
}
```

## 3. API 최적화
### 3.1 Rate Limiting
```typescript
// lib/api/rate-limit.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '@/lib/cache/redis';
import { env } from '@/lib/env';

export const rateLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rate-limit:',
  }),
  windowMs: 15 * 60 * 1000, // 15분
  max: env.NODE_ENV === 'production' ? 100 : 1000,
  message: {
    error: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.',
  },
});
```

### 3.2 응답 압축
```typescript
// next.config.js
const nextConfig = {
  compress: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, must-revalidate',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

## 4. 서버리스 최적화
### 4.1 Cold Start 최적화
```typescript
// lib/db/connection-pool.ts
import { Pool } from 'pg';
import { env } from '@/lib/env';

let pool: Pool;

export async function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });

    // 연결 유지를 위한 헬스 체크
    setInterval(async () => {
      try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
      } catch (error) {
        console.error('Database health check failed:', error);
      }
    }, 20000);
  }

  return pool;
}
```

### 4.2 메모리 관리
```typescript
// lib/utils/memory.ts
export function cleanupMemory() {
  if (global.gc) {
    try {
      global.gc();
    } catch (e) {
      console.error('Failed to garbage collect:', e);
    }
  }
}

export function monitorMemoryUsage() {
  const used = process.memoryUsage();
  
  console.log({
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`,
  });

  if (used.heapUsed > 512 * 1024 * 1024) { // 512MB
    cleanupMemory();
  }
}
```

## 5. 로깅 및 모니터링
### 5.1 로깅 설정
```typescript
// lib/logging/logger.ts
import pino from 'pino';
import { env } from '@/lib/env';

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
    },
  },
});

export const apiLogger = logger.child({ module: 'api' });
export const dbLogger = logger.child({ module: 'database' });
```

### 5.2 성능 모니터링
```typescript
// lib/monitoring/performance.ts
import { Performance } from 'perf_hooks';
import { logger } from '@/lib/logging/logger';

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private performance: Performance;

  private constructor() {
    this.performance = performance;
  }

  static getInstance() {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  async measureAsync<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = this.performance.now();
    try {
      return await fn();
    } finally {
      const duration = this.performance.now() - start;
      logger.info({ name, duration }, 'Performance measurement');
    }
  }
}
```

## 다음 단계
- step5-optimization-003.md: 보안 최적화
``` 