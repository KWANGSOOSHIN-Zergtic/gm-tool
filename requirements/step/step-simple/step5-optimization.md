# Step 5: 성능 최적화

## 5.1 캐싱 구현
```typescript
// /lib/cache/redis.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export class CacheService {
  static async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  static async set(key: string, value: any, ttl?: number) {
    const data = JSON.stringify(value);
    if (ttl) {
      await redis.setex(key, ttl, data);
    } else {
      await redis.set(key, data);
    }
  }
}

// /lib/api/cache.ts
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  const cached = await CacheService.get<T>(key);
  if (cached) return cached;

  const data = await fn();
  await CacheService.set(key, data, ttl);
  return data;
}
```

## 5.2 데이터베이스 최적화
```typescript
// /lib/db/repositories/user.ts
export class UserRepository {
  static async findAllWithTeam(page = 1, limit = 10) {
    return prisma.user.findMany({
      take: limit,
      skip: (page - 1) * limit,
      include: {
        team: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}

// Prisma 인덱스 설정
model User {
  @@index([email])
  @@index([teamId])
}
```

## 5.3 API 응답 최적화
```typescript
// /lib/api/compression.ts
import { NextResponse } from 'next/server';
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

export async function compressResponse(data: any) {
  const jsonString = JSON.stringify(data);
  if (jsonString.length < 1024) return data;

  const compressed = await gzipAsync(Buffer.from(jsonString));
  return new NextResponse(compressed, {
    headers: {
      'Content-Encoding': 'gzip',
      'Content-Type': 'application/json',
    },
  });
}
```

## 5.4 프론트엔드 최적화
```typescript
// /app/layout.tsx
export const metadata = {
  title: 'GM Tool',
  description: 'Game Management Tool',
};

// next.config.js
module.exports = {
  images: {
    domains: ['assets.example.com'],
  },
  experimental: {
    serverActions: true,
  },
  compress: true,
}
```

## 5.5 모니터링 설정
```typescript
// /lib/monitoring/performance.ts
export function trackPerformance(name: string, value: number) {
  // 성능 메트릭 기록
  console.log(`[Performance] ${name}: ${value}ms`);
}

// API 응답 시간 모니터링
export async function withTiming<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    trackPerformance(name, duration);
  }
}
```

## 다음 단계
- 테스트 구현
- 성능 테스트
- 배포 환경 구성 