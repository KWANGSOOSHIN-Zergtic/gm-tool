# Step 2-001: API 기본 구조 설정

## 1. API 응답 타입 정의
### 1.1 기본 응답 인터페이스
```typescript
// types/api/response.ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata: ResponseMetadata;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ResponseMetadata {
  timestamp: string;
  requestId: string;
  version: string;
  path: string;
}
```

### 1.2 페이지네이션 타입
```typescript
// types/api/pagination.ts
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  metadata: PaginationMetadata;
}

export interface PaginationMetadata extends ResponseMetadata {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}
```

## 2. API 핸들러 구현
### 2.1 기본 핸들러
```typescript
// lib/api/handler.ts
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import { ApiResponse, ApiError } from '@/types/api/response';

export class ApiHandler {
  static async handle<T>(
    handler: () => Promise<T>,
    options: {
      path: string;
      rateLimit?: boolean;
      cache?: boolean;
      cacheDuration?: number;
    }
  ): Promise<ApiResponse<T>> {
    const requestId = uuidv4();
    const startTime = Date.now();

    try {
      // 레이트 리밋 체크
      if (options.rateLimit) {
        await this.checkRateLimit(options.path);
      }

      // 캐시 체크
      if (options.cache) {
        const cached = await this.checkCache<T>(options.path);
        if (cached) return cached;
      }

      // 요청 처리
      logger.info('API request started', { requestId, path: options.path });
      const data = await handler();
      
      // 응답 생성
      const response: ApiResponse<T> = {
        success: true,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId,
          version: process.env.API_VERSION || '1.0.0',
          path: options.path
        }
      };

      // 캐시 저장
      if (options.cache) {
        await this.setCache(options.path, response, options.cacheDuration);
      }

      // 로깅
      logger.info('API request completed', {
        requestId,
        path: options.path,
        duration: Date.now() - startTime
      });

      return response;
    } catch (error) {
      // 에러 로깅
      logger.error('API request failed', {
        requestId,
        path: options.path,
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime
      });

      // 에러 응답 생성
      return {
        success: false,
        error: this.normalizeError(error),
        metadata: {
          timestamp: new Date().toISOString(),
          requestId,
          version: process.env.API_VERSION || '1.0.0',
          path: options.path
        }
      };
    }
  }

  private static normalizeError(error: any): ApiError {
    if (error instanceof ApiError) {
      return error;
    }

    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
      details: error.details
    };
  }

  private static async checkRateLimit(path: string): Promise<void> {
    // 레이트 리밋 로직 구현
  }

  private static async checkCache<T>(path: string): Promise<ApiResponse<T> | null> {
    // 캐시 체크 로직 구현
    return null;
  }

  private static async setCache<T>(
    path: string,
    response: ApiResponse<T>,
    duration?: number
  ): Promise<void> {
    // 캐시 저장 로직 구현
  }
}
```

## 3. API 미들웨어
### 3.1 로깅 미들웨어
```typescript
// middleware/logging.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

export function loggingMiddleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || uuidv4();
  const startTime = Date.now();

  logger.info('Request received', {
    requestId,
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers),
  });

  const response = NextResponse.next();

  response.headers.set('x-request-id', requestId);
  
  logger.info('Response sent', {
    requestId,
    status: response.status,
    duration: Date.now() - startTime,
  });

  return response;
}
```

### 3.2 보안 미들웨어
```typescript
// middleware/security.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function securityMiddleware(request: NextRequest) {
  const response = NextResponse.next();

  // 보안 헤더 설정
  const securityHeaders = {
    'X-DNS-Prefetch-Control': 'off',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };

  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}
```

## 다음 단계
- step2-core-api-002.md: API 문서화 설정
- step2-core-api-003.md: API 테스트 구조 설정 