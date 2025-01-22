# Step 1-001: 프로젝트 초기 설정

## 1. 프로젝트 초기화
### 1.1 Next.js 프로젝트 생성
```bash
npx create-next-app@latest gm-tool --typescript --tailwind --eslint
```

### 1.2 기본 디렉토리 구조 설정
```
/app
  ├─ layout.tsx
  ├─ page.tsx
  ├─ api/
  ├─ (auth)/
  └─ (dashboard)/
/components
  ├─ ui/
  ├─ common/
  └─ icons/
/lib
  ├─ api/
  ├─ db/
  └─ utils/
/types
/hooks
/store
/tests
  ├─ unit/
  └─ e2e/
```

## 2. 핵심 의존성 설치
### 2.1 UI 및 스타일링
```bash
# UI 컴포넌트
npm install @shadcn/ui lucide-react
# 스타일링
npm install tailwindcss postcss autoprefixer
# 애니메이션
npm install framer-motion
```

### 2.2 상태 관리
```bash
# 전역 상태
npm install zustand
# 서버 상태
npm install @tanstack/react-query
```

### 2.3 유효성 검증 및 폼
```bash
# 스키마 검증
npm install zod
# 폼 관리
npm install react-hook-form @hookform/resolvers
```

### 2.4 개발 도구
```bash
# 타입스크립트
npm install -D typescript @types/node @types/react
# 코드 품질
npm install -D eslint prettier
npm install -D @typescript-eslint/parser @typescript-eslint/eslint-plugin
# Git 훅
npm install -D husky lint-staged
```

## 3. 환경 설정 파일
### 3.1 TypeScript 설정
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### 3.2 ESLint 설정
```json
// .eslintrc.json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn"
  }
}
```

### 3.3 Prettier 설정
```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "tabWidth": 2,
  "useTabs": false
}
```

### 3.4 Git 훅 설정
```json
// package.json
{
  "scripts": {
    "prepare": "husky install"
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

## 4. VSCode 설정
### 4.1 기본 설정
```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### 4.2 추천 확장
```json
// .vscode/extensions.json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense"
  ]
}
```

## 다음 단계
- step1-foundation-002.md: ShadCN UI 컴포넌트 설정
- step1-foundation-003.md: 상태 관리 시스템 구축
- step1-foundation-004.md: 테스트 환경 구성 