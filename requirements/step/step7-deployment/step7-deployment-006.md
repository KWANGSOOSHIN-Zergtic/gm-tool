# Step 7-006: 확장성 및 성능 최적화

## 1. 캐시 최적화
### 1.1 Redis 캐시 설정
```typescript
// lib/cache/redis.ts
import { Redis } from 'ioredis';
import { logEvent } from '@/lib/logging/logger';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

interface CacheOptions {
  ttl?: number;
  tags?: string[];
}

export async function setCache(
  key: string,
  data: any,
  options: CacheOptions = {}
) {
  try {
    const value = JSON.stringify(data);
    
    if (options.ttl) {
      await redis.setex(key, options.ttl, value);
    } else {
      await redis.set(key, value);
    }

    if (options.tags?.length) {
      await Promise.all(
        options.tags.map(tag =>
          redis.sadd(`tag:${tag}`, key)
        )
      );
    }
  } catch (error) {
    logEvent('error', 'Cache set failed', { error, key });
    throw error;
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logEvent('error', 'Cache get failed', { error, key });
    return null;
  }
}

export async function invalidateByTags(tags: string[]) {
  try {
    const keys = await Promise.all(
      tags.map(tag => redis.smembers(`tag:${tag}`))
    );

    const uniqueKeys = [...new Set(keys.flat())];
    
    if (uniqueKeys.length) {
      await redis.del(...uniqueKeys);
      await Promise.all(
        tags.map(tag => redis.del(`tag:${tag}`))
      );
    }
  } catch (error) {
    logEvent('error', 'Cache invalidation failed', { error, tags });
    throw error;
  }
}
```

### 1.2 API 캐시 미들웨어
```typescript
// middleware/cache.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCache, setCache } from '@/lib/cache/redis';

interface CacheConfig {
  ttl: number;
  tags?: string[];
  methods?: string[];
  varyByQuery?: string[];
}

const CACHE_CONFIGS: Record<string, CacheConfig> = {
  '/api/teams': {
    ttl: 300,
    tags: ['teams'],
    methods: ['GET'],
    varyByQuery: ['page', 'limit'],
  },
  '/api/users': {
    ttl: 600,
    tags: ['users'],
    methods: ['GET'],
    varyByQuery: ['role'],
  },
};

export async function middleware(request: NextRequest) {
  const config = Object.entries(CACHE_CONFIGS)
    .find(([path]) => request.nextUrl.pathname.startsWith(path))?.[1];

  if (!config || !config.methods?.includes(request.method)) {
    return NextResponse.next();
  }

  const cacheKey = generateCacheKey(request, config);
  const cachedResponse = await getCache<any>(cacheKey);

  if (cachedResponse) {
    return NextResponse.json(cachedResponse, {
      headers: { 'X-Cache': 'HIT' },
    });
  }

  const response = await NextResponse.next();
  const data = await response.json();

  await setCache(cacheKey, data, {
    ttl: config.ttl,
    tags: config.tags,
  });

  return NextResponse.json(data, {
    headers: { 'X-Cache': 'MISS' },
  });
}

function generateCacheKey(request: NextRequest, config: CacheConfig): string {
  const url = new URL(request.url);
  const queryParams = config.varyByQuery
    ?.map(param => `${param}=${url.searchParams.get(param)}`)
    .filter(Boolean)
    .join('&');

  return `${url.pathname}${queryParams ? `?${queryParams}` : ''}`;
}
```

## 2. 데이터베이스 최적화
### 2.1 커넥션 풀 설정
```typescript
// lib/db/pool.ts
import { Pool } from 'pg';
import { logEvent } from '@/lib/logging/logger';

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logEvent('error', 'Unexpected database error', { error: err });
});

export async function withTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 2.2 쿼리 최적화
```typescript
// lib/db/optimizations.ts
import { Prisma } from '@prisma/client';

export function optimizeQuery(
  model: string,
  query: any,
  options: {
    maxLimit?: number;
    defaultLimit?: number;
    maxDepth?: number;
  } = {}
) {
  const {
    maxLimit = 100,
    defaultLimit = 10,
    maxDepth = 3,
  } = options;

  // 페이지네이션 최적화
  const limit = Math.min(
    parseInt(query.limit || defaultLimit.toString()),
    maxLimit
  );
  const offset = Math.max(
    parseInt(query.page || '1') - 1,
    0
  ) * limit;

  // 관계 쿼리 최적화
  const include = processInclude(query.include, maxDepth);

  // 정렬 최적화
  const orderBy = processOrderBy(query.orderBy);

  return {
    take: limit,
    skip: offset,
    include,
    orderBy,
  };
}

function processInclude(include: any, maxDepth: number, currentDepth = 0): any {
  if (!include || currentDepth >= maxDepth) {
    return undefined;
  }

  return Object.entries(include).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: typeof value === 'object'
        ? processInclude(value, maxDepth, currentDepth + 1)
        : true,
    }),
    {}
  );
}

function processOrderBy(orderBy: any): any {
  if (!orderBy) {
    return undefined;
  }

  if (typeof orderBy === 'string') {
    const [field, direction] = orderBy.split(':');
    return { [field]: direction || 'asc' };
  }

  return orderBy;
}
```

## 3. 서버리스 최적화
### 3.1 콜드 스타트 최적화
```typescript
// lib/optimization/coldstart.ts
import { prisma } from '@/lib/db/client';
import { redis } from '@/lib/cache/redis';

let isInitialized = false;

export async function initializeServices() {
  if (isInitialized) {
    return;
  }

  try {
    // 데이터베이스 연결 확인
    await prisma.$connect();
    
    // Redis 연결 확인
    await redis.ping();
    
    // 캐시 워밍업
    await warmupCache();
    
    isInitialized = true;
  } catch (error) {
    console.error('Service initialization failed:', error);
    throw error;
  }
}

async function warmupCache() {
  const cacheConfigs = [
    {
      key: 'global:config',
      query: () => prisma.config.findMany(),
    },
    {
      key: 'teams:count',
      query: () => prisma.team.count(),
    },
  ];

  await Promise.all(
    cacheConfigs.map(async ({ key, query }) => {
      const data = await query();
      await redis.setex(key, 3600, JSON.stringify(data));
    })
  );
}
```

### 3.2 메모리 최적화
```typescript
// lib/optimization/memory.ts
import { logEvent } from '@/lib/logging/logger';

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

const MEMORY_THRESHOLD = 0.9; // 90%

export function monitorMemory() {
  const stats = getMemoryStats();
  const usage = stats.heapUsed / stats.heapTotal;

  logEvent('info', 'Memory usage', {
    ...stats,
    usagePercentage: usage * 100,
  });

  if (usage > MEMORY_THRESHOLD) {
    logEvent('warning', 'High memory usage detected', { usage });
    performMemoryCleanup();
  }
}

function getMemoryStats(): MemoryStats {
  const stats = process.memoryUsage();
  return {
    heapUsed: stats.heapUsed,
    heapTotal: stats.heapTotal,
    external: stats.external,
    rss: stats.rss,
  };
}

async function performMemoryCleanup() {
  try {
    // 캐시 정리
    await redis.flushdb();
    
    // 가비지 컬렉션 강제 실행
    if (global.gc) {
      global.gc();
    }
    
    logEvent('info', 'Memory cleanup completed');
  } catch (error) {
    logEvent('error', 'Memory cleanup failed', { error });
  }
}
```

## 4. 프론트엔드 최적화
### 4.1 이미지 최적화
```typescript
// components/common/OptimizedImage.tsx
import Image from 'next/image';
import { useState, useEffect } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  priority = false,
  className,
}: OptimizedImageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const img = new window.Image();
    img.src = src;
    img.onload = () => setLoading(false);
    img.onerror = () => setError(true);
  }, [src]);

  if (error) {
    return (
      <div className="image-error">
        Failed to load image
      </div>
    );
  }

  return (
    <div className={`image-container ${loading ? 'loading' : ''}`}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={className}
        loading={priority ? 'eager' : 'lazy'}
        onLoadingComplete={() => setLoading(false)}
      />
      {loading && (
        <div className="image-skeleton" />
      )}
    </div>
  );
}
```

### 4.2 번들 최적화
```typescript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  experimental: {
    optimizeCss: true,
    optimizeImages: true,
    scrollRestoration: true,
  },
  images: {
    domains: ['your-image-domain.com'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  webpack: (config, { dev, isServer }) => {
    // 프로덕션 빌드 최적화
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        minSize: 20000,
        maxSize: 244000,
        minChunks: 1,
        maxAsyncRequests: 30,
        maxInitialRequests: 30,
        cacheGroups: {
          default: false,
          vendors: false,
          framework: {
            chunks: 'all',
            name: 'framework',
            test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
            priority: 40,
            enforce: true,
          },
          lib: {
            test(module: any) {
              return (
                module.size() > 160000 &&
                /node_modules[/\\]/.test(module.identifier())
              );
            },
            name(module: any) {
              const hash = crypto.createHash('sha1');
              hash.update(module.identifier());
              return hash.digest('hex').substring(0, 8);
            },
            priority: 30,
            minChunks: 1,
            reuseExistingChunk: true,
          },
          commons: {
            name: 'commons',
            minChunks: 2,
            priority: 20,
          },
          shared: {
            name(module: any, chunks: any) {
              return crypto
                .createHash('sha1')
                .update(
                  chunks.reduce((acc: string, chunk: any) => acc + chunk.name, '')
                )
                .digest('hex') + '_shared';
            },
            priority: 10,
            minChunks: 2,
            reuseExistingChunk: true,
          },
        },
      };
    }

    return config;
  },
});
```

## 다음 단계
- step7-deployment-007.md: 유지보수 및 운영 