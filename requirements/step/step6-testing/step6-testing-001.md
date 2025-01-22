# Step 6-001: 테스트 구현 - 단위 테스트

## 1. 테스트 환경 설정
### 1.1 Jest 설정
```typescript
// jest.config.ts
import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default createJestConfig(config);
```

### 1.2 테스트 유틸리티
```typescript
// lib/test/test-utils.tsx
import { render as rtlRender } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function render(ui: React.ReactElement, { session = null, ...options } = {}) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </QueryClientProvider>
    );
  }

  return rtlRender(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
export { render };
```

## 2. 인증 테스트
### 2.1 토큰 유틸리티 테스트
```typescript
// lib/auth/__tests__/token.test.ts
import { createToken, verifyToken } from '../token';

describe('Token Utilities', () => {
  const mockPayload = {
    userId: '123',
    email: 'test@example.com',
  };

  it('should create a valid JWT token', async () => {
    const token = await createToken(mockPayload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('should verify a valid token', async () => {
    const token = await createToken(mockPayload);
    const payload = await verifyToken(token);
    expect(payload).toMatchObject(mockPayload);
  });

  it('should throw error for invalid token', async () => {
    await expect(verifyToken('invalid-token')).rejects.toThrow('Invalid token');
  });
});
```

### 2.2 비밀번호 유틸리티 테스트
```typescript
// lib/auth/__tests__/password.test.ts
import { hashPassword, verifyPassword, generateSecurePassword } from '../password';

describe('Password Utilities', () => {
  const password = 'test-password-123';

  it('should hash password correctly', async () => {
    const hashedPassword = await hashPassword(password);
    expect(hashedPassword).not.toBe(password);
    expect(hashedPassword).toMatch(/^\$2[aby]?\$\d{1,2}\$[./A-Za-z0-9]{53}$/);
  });

  it('should verify correct password', async () => {
    const hashedPassword = await hashPassword(password);
    const isValid = await verifyPassword(password, hashedPassword);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const hashedPassword = await hashPassword(password);
    const isValid = await verifyPassword('wrong-password', hashedPassword);
    expect(isValid).toBe(false);
  });

  it('should generate secure password', () => {
    const securePassword = generateSecurePassword();
    expect(securePassword).toHaveLength(64);
    expect(securePassword).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

## 3. API 테스트
### 3.1 CORS 미들웨어 테스트
```typescript
// lib/api/__tests__/cors.test.ts
import { corsMiddleware } from '../cors';
import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

describe('CORS Middleware', () => {
  const mockOrigin = 'https://example.com';
  env.CORS_ORIGINS = mockOrigin;

  it('should set CORS headers for allowed origin', () => {
    const request = new NextRequest('https://api.example.com', {
      headers: { origin: mockOrigin },
    });
    const response = new Response();
    
    const result = corsMiddleware(request, response);
    
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe(mockOrigin);
    expect(result.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(result.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('should not set CORS headers for disallowed origin', () => {
    const request = new NextRequest('https://api.example.com', {
      headers: { origin: 'https://malicious.com' },
    });
    const response = new Response();
    
    const result = corsMiddleware(request, response);
    
    expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
```

## 4. 데이터 보안 테스트
### 4.1 암호화 유틸리티 테스트
```typescript
// lib/security/__tests__/encryption.test.ts
import { encrypt, decrypt } from '../encryption';

describe('Encryption Utilities', () => {
  const testData = 'sensitive-data-123';
  env.ENCRYPTION_KEY = Buffer.alloc(32).toString('hex');

  it('should encrypt and decrypt data correctly', () => {
    const encrypted = encrypt(testData);
    expect(encrypted).not.toBe(testData);
    
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(testData);
  });

  it('should generate different ciphertexts for same plaintext', () => {
    const encrypted1 = encrypt(testData);
    const encrypted2 = encrypt(testData);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should throw error for invalid ciphertext', () => {
    expect(() => decrypt('invalid-data')).toThrow();
  });
});
```

### 4.2 데이터 Sanitizer 테스트
```typescript
// lib/security/__tests__/sanitizer.test.ts
import { sanitizeHtml, sanitizeUserInput, maskEmail } from '../sanitizer';

describe('Data Sanitizer', () => {
  it('should sanitize HTML content', () => {
    const html = '<p>Hello <script>alert("xss")</script><strong>World</strong></p>';
    const sanitized = sanitizeHtml(html);
    expect(sanitized).toBe('<p>Hello <strong>World</strong></p>');
  });

  it('should sanitize user input', () => {
    const input = 'Hello <World>';
    const sanitized = sanitizeUserInput(input);
    expect(sanitized).toBe('Hello World');
  });

  it('should mask email address', () => {
    const email = 'user@example.com';
    const masked = maskEmail(email);
    expect(masked).toBe('u***r@example.com');
  });
});
```

## 5. 컴포넌트 테스트
### 5.1 버튼 컴포넌트 테스트
```typescript
// components/ui/__tests__/button.test.tsx
import { render, screen, fireEvent } from '@/lib/test/test-utils';
import { Button } from '../button';

describe('Button Component', () => {
  it('should render button with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should handle click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when loading', () => {
    render(<Button loading>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
```

### 5.2 폼 컴포넌트 테스트
```typescript
// components/ui/__tests__/form.test.tsx
import { render, screen, fireEvent } from '@/lib/test/test-utils';
import { Form, FormField } from '../form';
import { z } from 'zod';

describe('Form Component', () => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
  });

  it('should render form fields', () => {
    render(
      <Form
        schema={schema}
        onSubmit={() => {}}
      >
        <FormField name="email" label="Email" />
        <FormField name="password" label="Password" type="password" />
      </Form>
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('should validate form input', async () => {
    const handleSubmit = jest.fn();
    render(
      <Form
        schema={schema}
        onSubmit={handleSubmit}
      >
        <FormField name="email" label="Email" />
        <FormField name="password" label="Password" type="password" />
        <button type="submit">Submit</button>
      </Form>
    );

    fireEvent.click(screen.getByText('Submit'));
    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
```

## 다음 단계
- step6-testing-002.md: 통합 테스트 구현 