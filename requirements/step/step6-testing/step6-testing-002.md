# Step 6-002: 테스트 구현 - 통합 테스트

## 1. API 통합 테스트 설정
### 1.1 MSW(Mock Service Worker) 설정
```typescript
// lib/test/msw/handlers.ts
import { rest } from 'msw';
import { env } from '@/lib/env';

const BASE_URL = env.NEXT_PUBLIC_API_URL;

export const handlers = [
  // 인증 API 핸들러
  rest.post(`${BASE_URL}/auth/login`, async (req, res, ctx) => {
    const { email, password } = await req.json();
    
    if (email === 'test@example.com' && password === 'password') {
      return res(
        ctx.status(200),
        ctx.json({
          token: 'mock-jwt-token',
          user: {
            id: '1',
            email: 'test@example.com',
            name: 'Test User',
          },
        })
      );
    }
    
    return res(
      ctx.status(401),
      ctx.json({ message: 'Invalid credentials' })
    );
  }),

  // 팀 API 핸들러
  rest.get(`${BASE_URL}/teams`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        teams: [
          {
            id: '1',
            name: 'Team A',
            members: [
              { id: '1', name: 'User 1', role: 'OWNER' },
              { id: '2', name: 'User 2', role: 'MEMBER' },
            ],
          },
        ],
      })
    );
  }),
];
```

### 1.2 테스트 설정
```typescript
// jest.setup.ts
import '@testing-library/jest-dom';
import { server } from '@/lib/test/msw/server';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// 전역 타이머 모의
jest.useFakeTimers();

// 콘솔 에러 필터링
const originalError = console.error;
console.error = (...args) => {
  if (/Warning.*not wrapped in act/.test(args[0])) {
    return;
  }
  originalError.call(console, ...args);
};
```

## 2. API 통합 테스트
### 2.1 인증 API 테스트
```typescript
// app/api/auth/__tests__/auth.test.ts
import { createAuthApi } from '../auth';
import { server } from '@/lib/test/msw/server';
import { rest } from 'msw';

describe('Auth API Integration', () => {
  const api = createAuthApi();

  it('should login successfully with valid credentials', async () => {
    const credentials = {
      email: 'test@example.com',
      password: 'password',
    };

    const response = await api.login(credentials);
    
    expect(response.token).toBe('mock-jwt-token');
    expect(response.user).toMatchObject({
      email: credentials.email,
    });
  });

  it('should handle login failure', async () => {
    server.use(
      rest.post('/api/auth/login', (req, res, ctx) => {
        return res(
          ctx.status(401),
          ctx.json({ message: 'Invalid credentials' })
        );
      })
    );

    const credentials = {
      email: 'wrong@example.com',
      password: 'wrong',
    };

    await expect(api.login(credentials)).rejects.toThrow('Invalid credentials');
  });
});
```

### 2.2 팀 API 테스트
```typescript
// app/api/teams/__tests__/teams.test.ts
import { createTeamApi } from '../teams';
import { server } from '@/lib/test/msw/server';
import { rest } from 'msw';

describe('Team API Integration', () => {
  const api = createTeamApi();

  it('should fetch teams successfully', async () => {
    const response = await api.getTeams();
    
    expect(response.teams).toHaveLength(1);
    expect(response.teams[0]).toMatchObject({
      name: 'Team A',
      members: expect.arrayContaining([
        expect.objectContaining({ role: 'OWNER' }),
      ]),
    });
  });

  it('should handle team creation', async () => {
    const newTeam = {
      name: 'New Team',
      description: 'Test team',
    };

    server.use(
      rest.post('/api/teams', (req, res, ctx) => {
        return res(
          ctx.status(201),
          ctx.json({ ...newTeam, id: '2' })
        );
      })
    );

    const response = await api.createTeam(newTeam);
    expect(response).toMatchObject(newTeam);
    expect(response.id).toBeDefined();
  });
});
```

## 3. 페이지 통합 테스트
### 3.1 로그인 페이지 테스트
```typescript
// app/(auth)/__tests__/login.test.tsx
import { render, screen, fireEvent, waitFor } from '@/lib/test/test-utils';
import { LoginPage } from '../login/page';
import { useRouter } from 'next/navigation';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

describe('Login Page Integration', () => {
  const mockPush = jest.fn();
  
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });

  it('should handle successful login', async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /로그인/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('should display error message on login failure', async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /로그인/i }));

    await waitFor(() => {
      expect(screen.getByText('로그인에 실패했습니다.')).toBeInTheDocument();
    });
  });
});
```

### 3.2 팀 관리 페이지 테스트
```typescript
// app/dashboard/teams/__tests__/teams.test.tsx
import { render, screen, fireEvent, waitFor } from '@/lib/test/test-utils';
import { TeamsPage } from '../page';
import { server } from '@/lib/test/msw/server';
import { rest } from 'msw';

describe('Teams Page Integration', () => {
  it('should render team list', async () => {
    render(<TeamsPage />);

    await waitFor(() => {
      expect(screen.getByText('Team A')).toBeInTheDocument();
    });

    const ownerBadge = screen.getByText('OWNER');
    expect(ownerBadge).toBeInTheDocument();
  });

  it('should handle team creation', async () => {
    server.use(
      rest.post('/api/teams', (req, res, ctx) => {
        return res(
          ctx.status(201),
          ctx.json({
            id: '2',
            name: 'New Team',
            description: 'Test team',
          })
        );
      })
    );

    render(<TeamsPage />);

    fireEvent.click(screen.getByText('팀 생성'));
    
    const nameInput = screen.getByLabelText('팀 이름');
    const descInput = screen.getByLabelText('설명');
    
    fireEvent.change(nameInput, {
      target: { value: 'New Team' },
    });
    fireEvent.change(descInput, {
      target: { value: 'Test team' },
    });
    
    fireEvent.click(screen.getByRole('button', { name: /생성/i }));

    await waitFor(() => {
      expect(screen.getByText('New Team')).toBeInTheDocument();
    });
  });
});
```

## 4. E2E 테스트 설정
### 4.1 Playwright 설정
```typescript
// playwright.config.ts
import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './e2e',
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'Chrome',
      use: { browserName: 'chromium' },
    },
    {
      name: 'Firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'Safari',
      use: { browserName: 'webkit' },
    },
  ],
};

export default config;
```

### 4.2 E2E 테스트 유틸리티
```typescript
// e2e/utils/test-utils.ts
import { test as base } from '@playwright/test';
import { createTestAccount, deleteTestAccount } from './db-utils';

type TestFixtures = {
  testUser: {
    email: string;
    password: string;
  };
};

export const test = base.extend<TestFixtures>({
  testUser: async ({}, use) => {
    const user = await createTestAccount();
    await use(user);
    await deleteTestAccount(user.email);
  },
});

export { expect } from '@playwright/test';
```

## 다음 단계
- step6-testing-003.md: E2E 테스트 구현 