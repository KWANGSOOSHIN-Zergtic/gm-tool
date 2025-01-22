# Step 2-004: API 테스트 및 문서화

## 1. API 테스트 설정
### 1.1 테스트 환경 구성
- [ ] /tests/setup.ts
  ```typescript
  import { setupServer } from 'msw/node';
  import { handlers } from './mocks/handlers';

  export const server = setupServer(...handlers);

  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  ```

### 1.2 테스트 유틸리티
- [ ] /tests/utils/api-test.utils.ts
  ```typescript
  export const createTestApiResponse = <T>(data: T): IApiResponse<T> => ({
    success: true,
    data,
    meta: {
      timestamp: Date.now(),
      requestId: 'test-request-id',
      version: '1.0.0',
      environment: 'test',
      server: 'test-server'
    }
  });

  export const createTestApiError = (
    code: ApiErrorCode,
    message: string
  ): IApiResponse<never> => ({
    success: false,
    error: { code, message },
    meta: {
      timestamp: Date.now(),
      requestId: 'test-request-id',
      version: '1.0.0',
      environment: 'test',
      server: 'test-server'
    }
  });
  ```

## 2. API 엔드포인트 테스트
### 2.1 인증 API 테스트
- [ ] /tests/api/auth.test.ts
  ```typescript
  describe('Auth API', () => {
    describe('POST /api/auth/login', () => {
      it('should return token when credentials are valid', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'password123'
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('token');
      });

      it('should return error for invalid credentials', async () => {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      });
    });
  });
  ```

### 2.2 사용자 API 테스트
- [ ] /tests/api/users.test.ts
  ```typescript
  describe('Users API', () => {
    describe('GET /api/users', () => {
      it('should return paginated users list', async () => {
        const response = await request(app)
          .get('/api/users')
          .query({ page: 1, limit: 10 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeArray();
        expect(response.body.meta.pagination).toBeDefined();
      });
    });
  });
  ```

## 3. API 문서화
### 3.1 Swagger UI 설정
- [ ] /pages/api-docs.tsx
  ```typescript
  import { SwaggerUI } from 'swagger-ui-react';
  import 'swagger-ui-react/swagger-ui.css';
  import swaggerDoc from '../docs/api/swagger.json';

  export default function ApiDocs() {
    return <SwaggerUI spec={swaggerDoc} />;
  }
  ```

### 3.2 API 엔드포인트 문서
- [ ] /docs/api/endpoints/auth.md
  ```markdown
  # 인증 API

  ## 로그인
  ### POST /api/auth/login

  사용자 로그인을 처리하고 JWT 토큰을 반환합니다.

  #### Request Body
  \`\`\`json
  {
    "email": "string",
    "password": "string"
  }
  \`\`\`

  #### Response
  \`\`\`json
  {
    "success": true,
    "data": {
      "token": "string",
      "refreshToken": "string"
    },
    "meta": {
      "timestamp": "number",
      "requestId": "string"
    }
  }
  \`\`\`
  ```

## 4. 테스트 자동화
### 4.1 CI 테스트 설정
- [ ] /.github/workflows/api-test.yml
  ```yaml
  name: API Tests
  on:
    push:
      paths:
        - 'app/api/**'
        - 'lib/**'
        - 'tests/**'
  
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v2
        - name: Setup Node.js
          uses: actions/setup-node@v2
          with:
            node-version: '18'
        - name: Install dependencies
          run: npm ci
        - name: Run API tests
          run: npm run test:api
  ```

### 4.2 테스트 커버리지 설정
- [ ] /jest.config.js
  ```javascript
  module.exports = {
    collectCoverageFrom: [
      'app/api/**/*.ts',
      'lib/**/*.ts',
      '!**/*.d.ts',
      '!**/node_modules/**'
    ],
    coverageThreshold: {
      global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    }
  };
  ```

## 다음 단계
- step2-api-005.md: API 성능 최적화 및 모니터링 