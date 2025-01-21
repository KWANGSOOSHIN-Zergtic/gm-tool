# 공통 규칙

## 1. 코드 스타일 가이드

### TypeScript
- 엄격한 타입 정의 필수
- any 타입 사용 금지
- 인터페이스 명명: 'I' 접두사 사용 (예: IUser)
- 타입 명명: 'T' 접두사 사용 (예: TUserResponse)

### ESLint & Prettier
- ESLint 규칙 준수
- 들여쓰기: 2칸
- 세미콜론 필수
- 작은따옴표 사용
- 후행 쉼표 사용

### 네이밍 컨벤션
- 컴포넌트: PascalCase (예: UserProfile)
- 함수: PascalCase (예: UserProfile)
- 일반 변수: camelCase (예: userName)
- 타입/인터페이스: PascalCase (예: IUser, TUserResponse)
- 상수: UPPER_SNAKE_CASE (예: API_ENDPOINT)
- 파일명: kebab-case (예: user-profile.tsx)
- DB 관련: snake_case (예: user_profile)

## 2. 상태 관리

### 전역 상태
- Zustand 사용
- 상태 저장소는 기능별로 분리
- 상태 업데이트는 불변성 유지

### API 통신
- React Query 사용
- API 엔드포인트는 상수로 관리
- 에러 핸들링 필수
- 로딩 상태 처리 필수

## 3. 성능 최적화

### 이미지 최적화
- Next.js Image 컴포넌트 사용
- WebP 포맷 사용
- 적절한 이미지 사이즈 설정

### 번들 최적화
- 동적 임포트 활용
- 번들 분석기 사용
- 불필요한 의존성 제거

## 4. 테스트

### Validation
- zod 사용
- 모든 입력 필드는 유효성 검사 필수
- 유효성 검사 오류 메시지 제공

### 단위 테스트
- Jest + React Testing Library 사용
- 컴포넌트당 최소 1개 이상의 테스트
- 핵심 비즈니스 로직 테스트 필수

### E2E 테스트
- Cypress 사용
- 주요 사용자 시나리오 테스트

## 6. 보안

### 인증/인가
- JWT 토큰 관리
- 민감한 정보는 .env 파일에서 관리
- XSS, CSRF 방어

## 7. 접근성

### 웹 접근성
- WCAG 2.1 가이드라인 준수
- aria-* 속성 적절히 사용
- 키보드 네비게이션 지원

## 8. 배포

### CI/CD
- GitHub Actions 사용
- 자동화된 테스트 실행
- 자동 배포 파이프라인 구축

### 모니터링
- Sentry를 통한 에러 추적
- 성능 메트릭스 모니터링
- 정기적인 성능 리포트 검토