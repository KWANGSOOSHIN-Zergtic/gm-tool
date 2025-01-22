# Step 1-004: 테스트 환경 구성

## 1. Jest 설정
### 1.1 기본 설정
```javascript
// jest.config.js
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  testMatch: [
    '<rootDir>/tests/**/*.test.{js,jsx,ts,tsx}',
  ],
};

module.exports = createJestConfig(customJestConfig);
```

### 1.2 테스트 설정
```javascript
// jest.setup.js
import '@testing-library/jest-dom';
import { server } from './tests/mocks/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock next/router
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '',
      query: '',
      asPath: '',
      push: jest.fn(),
      replace: jest.fn(),
    };
  },
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname() {
    return '/';
  },
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
    };
  },
}));
```

## 2. MSW(Mock Service Worker) 설정
### 2.1 핸들러 설정
```typescript
// tests/mocks/handlers.ts
import { rest } from 'msw';

export const handlers = [
  // 인증 관련 모의 API
  rest.post('/api/auth/login', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        user: {
          id: '1',
          email: 'test@example.com',
          name: 'Test User',
        },
        token: 'mock-token',
      })
    );
  }),

  // 사용자 관련 모의 API
  rest.get('/api/users/me', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
      })
    );
  }),
];
```

### 2.2 서버 설정
```typescript
// tests/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

## 3. 테스트 유틸리티
### 3.1 테스트 래퍼
```typescript
// tests/utils/wrapper.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/theme/theme-provider';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  client?: QueryClient
) {
  const queryClient = client ?? createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {ui}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

### 3.2 테스트 헬퍼
```typescript
// tests/utils/helpers.ts
import { screen, waitFor } from '@testing-library/react';

export async function waitForLoadingToFinish() {
  return waitFor(
    () => {
      const loader = screen.queryByRole('progressbar');
      if (loader) {
        throw new Error('Still loading');
      }
    },
    { timeout: 4000 }
  );
}

export const mockConsoleError = () => {
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });
};
```

## 4. 컴포넌트 테스트 예시
### 4.1 버튼 컴포넌트 테스트
```typescript
// tests/components/button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/common/button';

describe('Button', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows loading state', () => {
    render(<Button isLoading>Click me</Button>);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Click me')).not.toBeInTheDocument();
  });
});
```

### 4.2 API 훅 테스트
```typescript
// tests/hooks/useAuth.test.tsx
import { renderHook, act } from '@testing-library/react-hooks';
import { useLogin } from '@/hooks/queries/useAuth';
import { createTestQueryClient } from '../utils/wrapper';

describe('useLogin', () => {
  it('handles successful login', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useLogin(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await act(async () => {
      await result.current.mutateAsync({
        email: 'test@example.com',
        password: 'password',
      });
    });

    expect(result.current.isSuccess).toBe(true);
  });
});
```

## 다음 단계
- step1-foundation-005.md: API 클라이언트 설정
- step1-foundation-006.md: 에러 처리 시스템 구축 