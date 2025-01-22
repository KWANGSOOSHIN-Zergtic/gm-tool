# Step 2-003: API 테스트 구조 설정

## 1. API 테스트 환경 설정
### 1.1 테스트 유틸리티
```typescript
// tests/utils/api.ts
import { ApiResponse } from '@/types/api/response';
import { headers } from 'next/headers';

export async function createTestRequest(
  method: string,
  path: string,
  body?: any,
  token?: string
) {
  const url = new URL(path, process.env.NEXT_PUBLIC_API_URL);
  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const data = await response.json();
  return data as ApiResponse<T>;
}
```

### 1.2 테스트 미들웨어
```typescript
// tests/utils/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { createMocks } from 'node-mocks-http';

export function createTestContext(
  method: string = 'GET',
  body?: any,
  query?: Record<string, string>,
  headers?: Record<string, string>
) {
  const { req, res } = createMocks({
    method,
    body,
    query,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

  return { req: req as unknown as NextRequest, res: res as unknown as NextResponse };
}
```

## 2. API 엔드포인트 테스트
### 2.1 인증 API 테스트
```typescript
// tests/api/auth.test.ts
import { describe, it, expect } from '@jest/globals';
import { createTestRequest, parseApiResponse } from '../utils/api';
import { POST } from '@/app/api/auth/login/route';

describe('Auth API', () => {
  describe('POST /api/auth/login', () => {
    it('should return 200 and token for valid credentials', async () => {
      const request = await createTestRequest('POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });

      const response = await POST(request);
      const data = await parseApiResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('token');
      expect(data.data).toHaveProperty('user');
    });

    it('should return 401 for invalid credentials', async () => {
      const request = await createTestRequest('POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      const response = await POST(request);
      const data = await parseApiResponse(response);

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });
});
```

### 2.2 사용자 API 테스트
```typescript
// tests/api/users.test.ts
import { describe, it, expect } from '@jest/globals';
import { createTestRequest, parseApiResponse } from '../utils/api';
import { GET } from '@/app/api/users/[id]/route';

describe('Users API', () => {
  describe('GET /api/users/:id', () => {
    it('should return user data for valid ID', async () => {
      const userId = '123';
      const request = await createTestRequest(
        'GET',
        `/api/users/${userId}`,
        undefined,
        'test-token'
      );

      const response = await GET(request, { params: { id: userId } });
      const data = await parseApiResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('id', userId);
    });

    it('should return 404 for non-existent user', async () => {
      const userId = 'non-existent';
      const request = await createTestRequest(
        'GET',
        `/api/users/${userId}`,
        undefined,
        'test-token'
      );

      const response = await GET(request, { params: { id: userId } });
      const data = await parseApiResponse(response);

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });
});
```

## 3. 통합 테스트
### 3.1 API 미들웨어 테스트
```typescript
// tests/middleware/api.test.ts
import { describe, it, expect } from '@jest/globals';
import { createTestContext } from '../utils/middleware';
import { middleware } from '@/middleware';

describe('API Middleware', () => {
  it('should add security headers', async () => {
    const { req } = createTestContext('GET', undefined, undefined, {
      'x-test-header': 'test',
    });

    const response = await middleware(req);
    
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('should handle CORS preflight requests', async () => {
    const { req } = createTestContext('OPTIONS', undefined, undefined, {
      'Access-Control-Request-Method': 'POST',
    });

    const response = await middleware(req);
    
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined();
  });
});
```

### 3.2 API 핸들러 테스트
```typescript
// tests/handlers/api.test.ts
import { describe, it, expect } from '@jest/globals';
import { ApiHandler } from '@/lib/api/handler';

describe('API Handler', () => {
  it('should handle successful requests', async () => {
    const response = await ApiHandler.handle(
      async () => ({ message: 'success' }),
      { path: '/test' }
    );

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ message: 'success' });
    expect(response.metadata).toBeDefined();
  });

  it('should handle errors', async () => {
    const response = await ApiHandler.handle(
      async () => {
        throw new Error('Test error');
      },
      { path: '/test' }
    );

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
    expect(response.error.message).toBe('Test error');
  });
});
```

## 다음 단계
- step2-core-api-004.md: API 보안 설정
- step2-core-api-005.md: API 성능 최적화 