# Step 1-005: 상태 관리 및 API 설정

## 1. 상태 관리 설정
### 1.1 Zustand 스토어 설정
- [ ] /lib/store/
  - [ ] auth.store.ts
  - [ ] ui.store.ts
  - [ ] user.store.ts
  - [ ] app.store.ts

### 1.2 React Query 설정
- [ ] /lib/query/
  - [ ] client.ts
  - [ ] hooks/
    - [ ] useAuth.ts
    - [ ] useUser.ts
    - [ ] useSettings.ts
  - [ ] mutations/
    - [ ] useLogin.ts
    - [ ] useLogout.ts
    - [ ] useUpdateProfile.ts

## 2. API 클라이언트 설정
### 2.1 Axios 인스턴스 설정
- [ ] /lib/api/
  - [ ] client.ts
  - [ ] config.ts
  - [ ] types.ts

### 2.2 API 인터셉터
- [ ] /lib/api/interceptors/
  - [ ] auth.interceptor.ts
  - [ ] error.interceptor.ts
  - [ ] logger.interceptor.ts

### 2.3 API 엔드포인트
- [ ] /lib/api/endpoints/
  - [ ] auth.endpoints.ts
  - [ ] user.endpoints.ts
  - [ ] admin.endpoints.ts

## 3. 에러 처리 시스템
### 3.1 에러 클래스
- [ ] /lib/errors/
  - [ ] ApiError.ts
  - [ ] AuthError.ts
  - [ ] ValidationError.ts

### 3.2 에러 핸들러
- [ ] /lib/errors/handlers/
  - [ ] apiErrorHandler.ts
  - [ ] authErrorHandler.ts
  - [ ] validationErrorHandler.ts

## 4. 캐싱 전략
### 4.1 React Query 캐시 설정
- [ ] /lib/query/cache/
  - [ ] config.ts
  - [ ] keys.ts
  - [ ] mutations.ts

### 4.2 로컬 스토리지 관리
- [ ] /lib/storage/
  - [ ] local.storage.ts
  - [ ] session.storage.ts
  - [ ] cookie.storage.ts

## 5. API 유틸리티
### 5.1 요청/응답 변환기
- [ ] /lib/api/transformers/
  - [ ] request.transformer.ts
  - [ ] response.transformer.ts
  - [ ] error.transformer.ts

### 5.2 API 헬퍼
- [ ] /lib/api/helpers/
  - [ ] pagination.helper.ts
  - [ ] query.helper.ts
  - [ ] url.helper.ts

## 다음 단계
- step1-setup-600.md: 보안 및 인증 설정
- step1-setup-700.md: 테스트 환경 설정 