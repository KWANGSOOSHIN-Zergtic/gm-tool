# Step 6: 테스트 구현

## 6.1 단위 테스트 설정
```typescript
// /jest.config.js
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

// /tests/setup.ts
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset } from 'jest-mock-extended';

jest.mock('@/lib/db/client', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

beforeEach(() => {
  mockReset(prismaMock);
});
```

## 6.2 API 테스트
```typescript
// /tests/api/users.test.ts
import { createMocks } from 'node-mocks-http';
import { GET, POST } from '@/app/api/users/route';

describe('Users API', () => {
  it('should return users list', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await GET(req);
    
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(Array.isArray(data)).toBeTruthy();
  });
});
```

## 6.3 통합 테스트
```typescript
// /tests/integration/auth.test.ts
import { getSession } from '@/lib/auth/session';
import { createUser } from '@/tests/helpers';

describe('Authentication Flow', () => {
  it('should authenticate user', async () => {
    const user = await createUser({
      email: 'test@example.com',
      password: 'password123',
    });

    const session = await getSession();
    expect(session?.user.email).toBe(user.email);
  });
});
```

## 6.4 E2E 테스트
```typescript
// /tests/e2e/admin.spec.ts
import { test, expect } from '@playwright/test';

test('admin dashboard', async ({ page }) => {
  // 로그인
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'admin@example.com');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');

  // 대시보드 접근
  await page.goto('/admin');
  await expect(page).toHaveTitle(/관리자 대시보드/);
});
```

## 6.5 성능 테스트
```typescript
// /tests/performance/api.test.ts
import { check } from 'k6/http';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  vus: 10,
  duration: '30s',
};

export default function() {
  const res = http.get('http://localhost:3000/api/users');
  
  check(res, {
    'is status 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });
}
```

## 6.6 테스트 유틸리티
```typescript
// /tests/helpers/index.ts
export async function createTestUser(data: Partial<User> = {}) {
  return prisma.user.create({
    data: {
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      ...data,
    },
  });
}

export function generateAuthHeader(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}
```

## 다음 단계
- CI/CD 파이프라인 구성
- 배포 자동화
- 모니터링 시스템 구축 