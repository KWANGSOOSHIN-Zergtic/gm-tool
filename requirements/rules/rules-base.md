# 프로젝트 기본 규칙

## 1. 프로젝트 구조
### 1.1 기본 디렉토리 구조
```
/app                 # Next.js 페이지 및 라우팅
  ├─ api            # API 라우트
  ├─ (auth)         # 인증 관련 페이지
  ├─ (dashboard)    # 대시보드 페이지
  └─ (admin)        # 관리자 페이지
/components         # 리액트 컴포넌트
  ├─ ui            # ShadCN UI 컴포넌트
  ├─ common        # 공통 컴포넌트
  ├─ features      # 기능별 컴포넌트
  └─ layouts       # 레이아웃 컴포넌트
/lib               # 유틸리티 및 헬퍼
  ├─ api           # API 관련 유틸리티
  ├─ auth          # 인증 관련 유틸리티
  ├─ db            # 데이터베이스 유틸리티
  └─ utils         # 일반 유틸리티
/types             # TypeScript 타입 정의
/hooks             # 커스텀 훅
/store             # 상태 관리
/styles            # 스타일 관련 파일
/public            # 정적 파일
/tests             # 테스트 파일
```

### 1.2 명명 규칙
- **파일명**: 
  - 컴포넌트: PascalCase (예: UserProfile.tsx)
  - 유틸리티: camelCase (예: formatDate.ts)
  - 타입: PascalCase (예: UserTypes.ts)
  - 테스트: *.test.ts 또는 *.spec.ts

- **변수/함수명**:
  - 변수: camelCase
  - 상수: UPPER_SNAKE_CASE
  - 타입/인터페이스: PascalCase
  - 컴포넌트: PascalCase

### 1.3 코드 스타일
- ESLint 규칙 준수
- Prettier 포맷팅 적용
- TypeScript strict 모드 사용

## 2. 기본 개발 원칙
### 2.1 컴포넌트 개발
- 단일 책임 원칙 준수
- Props 타입 명시적 정의
- 불필요한 리렌더링 방지
- 적절한 에러 바운더리 사용

### 2.2 상태 관리
- Zustand 사용 원칙
  - 전역 상태 최소화
  - 상태 분리 및 모듈화
  - 불변성 유지

### 2.3 성능 최적화
- 코드 스플리팅
- 이미지 최적화
- 번들 크기 최적화
- 메모이제이션 적절한 사용

## 3. 품질 관리 기준
### 3.1 코드 품질
- TypeScript 타입 엄격 적용
- 순환 복잡도 관리
- 중복 코드 최소화
- 주석 및 문서화

### 3.2 테스트 기준
- 단위 테스트 필수
- 커버리지 80% 이상 유지
- 주요 기능 E2E 테스트 구현

### 3.3 성능 기준
- Lighthouse 점수 기준
  - Performance: 90+
  - Accessibility: 90+
  - Best Practices: 90+
  - SEO: 90+

### 3.4 접근성 기준
- WCAG 2.1 준수
- 키보드 네비게이션 지원
- 스크린 리더 호환성 