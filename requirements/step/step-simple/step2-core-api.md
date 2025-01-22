# Step 2: 핵심 API 구조

## 2.1 API 기본 구조 및 문서화
```typescript
// /lib/api/types.ts
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata: {
    timestamp: string;
    version: string;
    requestId: string;
  };
}

// /lib/api/handler.ts
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

class ApiHandler {
  static async handle<T>(
    handler: () => Promise<T>,
    options?: {
      rateLimit?: boolean;
      cacheDuration?: number;
    }
  ): Promise<ApiResponse<T>> {
    const requestId = uuidv4();
    try {
      logger.info('API request started', { requestId });
      
      // Rate limiting check
      if (options?.rateLimit) {
        await this.checkRateLimit();
      }
      
      const data = await handler();
      
      logger.info('API request completed', { requestId });
      
      return {
        success: true,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          version: process.env.API_VERSION || '1.0.0',
          requestId
        }
      };
    } catch (error) {
      logger.error('API request failed', { 
        requestId,
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          version: process.env.API_VERSION || '1.0.0',
          requestId
        }
      };
    }
  }
  
  private static async checkRateLimit() {
    // Rate limiting 로직 구현
  }
}
```

## 2.2 API 문서화 설정
```typescript
// /lib/api/swagger.ts
import { createSwaggerSpec } from 'next-swagger-doc';

export const getApiDocs = () => {
  return createSwaggerSpec({
    apiFolder: 'app/api',
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'GM Tool API Documentation',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });
};
```

## 2.3 미들웨어 및 보안
```typescript
// /middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { verifyToken } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  // 보안 헤더 설정
  const headers = new Headers(request.headers);
  const securityHeaders = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
  
  Object.entries(securityHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  // API 요청 처리
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // CORS 체크
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
        },
      });
    }
    
    // Rate limiting 체크
    const rateLimitResult = await rateLimit.check(request);
    if (!rateLimitResult.success) {
      return new NextResponse(JSON.stringify({
        error: 'Too many requests',
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
      });
    }
    
    // 토큰 검증
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (token) {
      try {
        const decoded = await verifyToken(token);
        headers.set('X-User-Id', decoded.userId);
      } catch (error) {
        return new NextResponse(JSON.stringify({
          error: 'Invalid token',
        }), { status: 401 });
      }
    }
  }
  
  return NextResponse.next({
    request: {
      headers,
    },
  });
}

export const config = {
  matcher: ['/api/:path*'],
};
```

## 2.4 에러 처리 및 로깅
```typescript
// /lib/api/errors.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// 에러 타입 정의
export const ErrorTypes = {
  UNAUTHORIZED: new ApiError('Unauthorized', 401, 'AUTH_001'),
  NOT_FOUND: new ApiError('Not Found', 404, 'REQ_001'),
  VALIDATION_ERROR: new ApiError('Validation Error', 400, 'VAL_001'),
  RATE_LIMIT: new ApiError('Too Many Requests', 429, 'RATE_001'),
  INTERNAL_ERROR: new ApiError('Internal Server Error', 500, 'SRV_001'),
};

// /lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});
```

## 2.5 API 테스트
```typescript
// /tests/api/health.test.ts
import { describe, it, expect } from '@jest/globals';
import { createMocks } from 'node-mocks-http';
import healthCheck from '@/app/api/health/route';

describe('Health Check API', () => {
  it('should return healthy status', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await healthCheck(req, res);

    expect(res._getStatusCode()).toBe(200);
    const jsonResponse = JSON.parse(res._getData());
    expect(jsonResponse.success).toBe(true);
    expect(jsonResponse.data.status).toBe('healthy');
  });
});
```

## 다음 단계
- 데이터베이스 연동
- 인증/인가 구현
- API 엔드포인트 확장 