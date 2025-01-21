# 테스트 관련 규칙

## 1. 테스트 실행 규칙

### 1.1 테스트 실행 순서
1. 단위 테스트 (Unit Tests)
2. 통합 테스트 (Integration Tests)
3. E2E 테스트 (End-to-End Tests)

### 1.2 테스트 환경 설정
```env
# 테스트용 환경 변수
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_CACHE_HOST=localhost
TEST_API_MOCK=true
```

### 1.3 테스트 커버리지 리포트
```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "statements": 80,
        "branches": 80,
        "functions": 80,
        "lines": 80
      },
      "./src/auth/**/*.ts": {
        "statements": 100,
        "branches": 100,
        "functions": 100,
        "lines": 100
      },
      "./src/api/**/*.ts": {
        "statements": 100,
        "branches": 100,
        "functions": 100,
        "lines": 100
      }
    }
  }
}
```

## 2. 테스트 커버리지 기준

### 2.1 필수 테스트 영역 (100% 커버리지)
```typescript
// 인증/인가 테스트
describe('Authentication', () => {
  beforeEach(async () => {
    // 테스트 데이터 초기화
    await setupTestData();
  });

  afterEach(async () => {
    // 테스트 데이터 정리
    await cleanupTestData();
  });

  test('로그인 성공 - 유효한 자격증명', async () => {
    const response = await authService.login({
      email: 'test@example.com',
      password: 'validPassword123'
    });
    
    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty('token');
    expect(response.data.token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
  });

  test('로그인 실패 - 잘못된 비밀번호', async () => {
    const response = await authService.login({
      email: 'test@example.com',
      password: 'wrongPassword'
    });
    
    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('AUTHENTICATION_ERROR');
    expect(response.error?.message).toBe('Invalid credentials');
  });

  test('토큰 검증 - 만료된 토큰', async () => {
    const expiredToken = generateExpiredToken();
    const response = await authService.validateToken(expiredToken);
    
    expect(response.success).toBe(false);
    expect(response.error?.code).toBe('TOKEN_EXPIRED');
  });

  test('권한 검증 - 관리자 권한', async () => {
    const adminToken = await generateAdminToken();
    const response = await authService.checkPermission(adminToken, 'MANAGE_USERS');
    
    expect(response.success).toBe(true);
    expect(response.data.hasPermission).toBe(true);
  });
});

// API 엔드포인트 테스트
describe('API Endpoints', () => {
  test('요청 유효성 검사', async () => {
    const invalidData = {
      email: 'invalid-email',
      age: -1
    };
    
    const response = await request(app)
      .post('/api/v1/users')
      .send(invalidData);
      
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toHaveProperty('email');
    expect(response.body.error.details).toHaveProperty('age');
  });

  test('응답 형식 검증', async () => {
    const response = await request(app)
      .get('/api/v1/users/123');
      
    expect(response.body).toMatchSchema(apiResponseSchema);
    expect(response.body.meta).toHaveProperty('timestamp');
    expect(response.body.meta).toHaveProperty('requestId');
  });

  test('에러 처리 - 데이터베이스 연결 실패', async () => {
    // 데이터베이스 연결 강제 종료
    await forceDatabaseDisconnect();
    
    const response = await request(app)
      .get('/api/v1/users');
      
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_ERROR');
    expect(response.body.error.message).toBe('Database connection failed');
  });
});
```

### 2.2 중요 테스트 영역 (80%+ 커버리지)
```typescript
// 비즈니스 로직 테스트
describe('GameService', () => {
  test('사용자 통계 계산', async () => {
    const stats = await gameService.calculateUserStats('user123');
    
    expect(stats).toHaveProperty('totalGames');
    expect(stats).toHaveProperty('winRate');
    expect(stats.winRate).toBeGreaterThanOrEqual(0);
    expect(stats.winRate).toBeLessThanOrEqual(100);
  });

  test('게임 보상 처리 - 일일 한도 초과', async () => {
    // 일일 한도 설정
    const dailyLimit = 1000;
    
    // 한도 초과 상황 시뮬레이션
    await simulateRewardsOverLimit(dailyLimit);
    
    const result = await gameService.processReward({
      userId: 'user123',
      amount: 100
    });
    
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('DAILY_LIMIT_EXCEEDED');
  });

  test('동시 작업 처리', async () => {
    const concurrentRequests = 10;
    const results = await Promise.all(
      Array(concurrentRequests).fill(null).map(() =>
        gameService.processTransaction({
          userId: 'user123',
          amount: 100
        })
      )
    );
    
    // 동시성 처리 검증
    const successCount = results.filter(r => r.success).length;
    expect(successCount).toBe(1); // 하나만 성공해야 함
  });
});
```

