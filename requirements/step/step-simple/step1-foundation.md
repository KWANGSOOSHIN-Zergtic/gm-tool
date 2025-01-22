# Step 1: 프로젝트 기초 설정

## 1.1 프로젝트 초기 설정
- Next.js 프로젝트 생성
  ```bash
  npx create-next-app@latest gm-tool --typescript --tailwind --eslint
  ```

- 핵심 의존성 설치
  ```bash
  # UI 및 상태관리
  npm install @shadcn/ui lucide-react zustand @tanstack/react-query
  
  # API 및 데이터베이스
  npm install @prisma/client @trpc/server @trpc/client
  
  # 유효성 검증 및 보안
  npm install zod jsonwebtoken
  ```

- 개발 의존성 설치
  ```bash
  # 타입 및 테스트
  npm install -D prisma @types/node @types/react @testing-library/react jest @testing-library/jest-dom
  
  # 문서화 및 품질
  npm install -D @types/jsonwebtoken eslint-config-prettier prettier
  ```

## 1.2 프로젝트 구조 설정
```
/app
  ├─ api/           # API 라우트
  ├─ (auth)/        # 인증 관련 페이지
  └─ (dashboard)/   # 대시보드 페이지
/components
  ├─ ui/           # ShadCN UI 컴포넌트
  ├─ common/       # 공통 컴포넌트
  └─ icons/        # Lucide 아이콘 래퍼 컴포넌트
/lib
  ├─ api/          # API 유틸리티
  ├─ db/           # 데이터베이스 유틸리티
  └─ utils/        # 일반 유틸리티
/types             # 전역 타입 정의
/hooks             # 커스텀 훅
/store             # Zustand 스토어
/prisma
  └─ schema.prisma # 데이터베이스 스키마
/tests             # 테스트 파일
  ├─ unit/        # 단위 테스트
  └─ e2e/         # E2E 테스트
```

## 1.3 기본 환경 설정
- .env 파일 설정 및 Zod 검증
  ```typescript
  // /lib/env.ts
  import { z } from 'zod';

  const envSchema = z.object({
    DATABASE_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(32),
    NEXTAUTH_URL: z.string().url(),
    NODE_ENV: z.enum(['development', 'production', 'test']),
  });

  export const env = envSchema.parse(process.env);
  ```

- ShadCN UI 설정
  ```bash
  # ShadCN UI CLI 설치
  npx shadcn@latest init
  ```

- next.config.js 보안 설정
  ```javascript
  const nextConfig = {
    poweredByHeader: false,
    headers: async () => [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        ],
      },
    ],
  };
  ```

## 1.4 상태 관리 설정
- Zustand 스토어 설정
  ```typescript
  // /store/auth.ts
  import { create } from 'zustand';
  import { persist } from 'zustand/middleware';

  interface AuthState {
    token: string | null;
    setToken: (token: string | null) => void;
  }

  export const useAuthStore = create<AuthState>()(
    persist(
      (set) => ({
        token: null,
        setToken: (token) => set({ token }),
      }),
      { name: 'auth-storage' }
    )
  );
  ```

- React Query 설정
  ```typescript
  // /lib/query.ts
  import { QueryClient } from '@tanstack/react-query';

  export const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: 1,
      },
    },
  });
  ```

## 1.5 테스트 환경 설정
- Jest 설정
  ```javascript
  // jest.config.js
  module.exports = {
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/$1',
    },
  };
  ```

## 다음 단계
- API 구조 설계
- 데이터베이스 스키마 정의
- 기본 인증 시스템 구축 