# 환경 변수 관리 규칙

## 1. 환경 변수 파일 구조
```env
# 1. 시스템 식별 설정 (SYSTEM_*)
SYSTEM_ID=gm-tool-server-01
SYSTEM_REGION=ap-northeast-2
SYSTEM_STAGE=development|staging|production

# 2. 애플리케이션 설정 (APP_*)
APP_NAME=gm-tool
APP_ENV=development|staging|production
APP_DEBUG=true|false
APP_URL=http://localhost:3000
APP_PORT=3000
APP_TIMEZONE=Asia/Seoul
APP_LOCALE=ko
APP_VERSION=1.0.0
APP_BUILD=2024030101

# 3. 로깅 설정 (LOG_*)
LOG_LEVEL=debug|info|warn|error
LOG_FORMAT=json|text
LOG_PATH=/var/log/app
LOG_MAX_SIZE=10m
LOG_MAX_FILES=7
LOG_COMPRESS=true
LOG_RETENTION_DAYS=30

# 4. 데이터베이스 설정 (DB_*)
## 메인 데이터베이스
DB_MAIN_HOST=localhost
DB_MAIN_PORT=5432
DB_MAIN_NAME=gm_tool
DB_MAIN_USER=admin
DB_MAIN_PASS=secure_password
DB_MAIN_SSL=true
DB_MAIN_CERT_PATH=/path/to/cert

## 읽기 전용 데이터베이스
DB_READ_HOST=localhost
DB_READ_PORT=5432
DB_READ_NAME=gm_tool_read

## 데이터베이스 풀 설정
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_POOL_IDLE=10000
DB_POOL_ACQUIRE=30000
DB_POOL_EVICT=30000

# 5. 캐시 설정 (CACHE_*)
CACHE_DRIVER=redis
CACHE_HOST=localhost
CACHE_PORT=6379
CACHE_PASSWORD=secure_password
CACHE_DB=0
CACHE_PREFIX=gm_tool:
CACHE_CLUSTER_MODE=true
CACHE_SENTINEL_MASTER=mymaster

## TTL 설정
CACHE_DEFAULT_TTL=3600
CACHE_USER_TTL=7200
CACHE_GAME_TTL=300
CACHE_SESSION_TTL=86400

# 6. 보안 설정 (SECURITY_*)
SECURITY_KEY=base64_encoded_key
SECURITY_SALT=random_salt_string
SECURITY_ALGORITHM=aes-256-gcm
SECURITY_ITERATIONS=100000
SECURITY_KEYSIZE=32

# 7. 인증 설정 (AUTH_*)
## JWT 설정
AUTH_JWT_SECRET=your_secure_jwt_secret
AUTH_JWT_EXPIRES=86400
AUTH_JWT_REFRESH_EXPIRES=604800
AUTH_JWT_ALGORITHM=HS256
AUTH_JWT_ISSUER=gm-tool
AUTH_JWT_AUDIENCE=gm-tool-client

## OAuth 설정
AUTH_GOOGLE_CLIENT_ID=google_client_id
AUTH_GOOGLE_CLIENT_SECRET=google_client_secret
AUTH_GOOGLE_CALLBACK_URL=/auth/google/callback

# 8. API 설정 (API_*)
API_VERSION=v1
API_PREFIX=/api
API_TIMEOUT=5000
API_RATE_LIMIT=100
API_RATE_WINDOW=60000
API_MAX_PAYLOAD_SIZE=10mb

## 외부 API 엔드포인트
API_PAYMENT_URL=https://payment.example.com
API_NOTIFICATION_URL=https://notify.example.com
API_ANALYTICS_URL=https://analytics.example.com

# 9. 모니터링 설정 (MONITOR_*)
## Sentry 설정
MONITOR_SENTRY_DSN=https://sentry.io/...
MONITOR_SENTRY_ENV=production
MONITOR_SENTRY_TRACES_SAMPLE_RATE=0.1
MONITOR_SENTRY_RELEASE=${APP_VERSION}

## APM 설정
MONITOR_APM_SERVICE_NAME=gm-tool
MONITOR_APM_SERVER_URL=http://apm.example.com
MONITOR_APM_SECRET_TOKEN=your_secret_token

## 성능 모니터링
MONITOR_SLOW_QUERY_MS=1000
MONITOR_API_TIMEOUT_MS=5000
MONITOR_MEMORY_ALERT_MB=1024
MONITOR_CPU_ALERT_PERCENT=80

## 알림 설정
MONITOR_ALERT_EMAIL=admin@example.com
MONITOR_SLACK_WEBHOOK=https://hooks.slack.com/...
MONITOR_DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
```

## 2. 환경 변수 검증
```typescript
const envSchema = z.object({
  // 시스템 식별 설정
  SYSTEM_ID: z.string(),
  SYSTEM_REGION: z.string(),
  SYSTEM_STAGE: z.enum(['development', 'staging', 'production']),

  // 앱 설정
  APP_NAME: z.string(),
  APP_ENV: z.enum(['development', 'staging', 'production']),
  APP_DEBUG: z.boolean(),
  APP_PORT: z.number().min(1).max(65535),
  APP_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/),
  APP_BUILD: z.string().regex(/^\d{10}$/),

  // 데이터베이스 설정
  DB_MAIN_HOST: z.string(),
  DB_MAIN_PORT: z.number().min(1).max(65535),
  DB_MAIN_NAME: z.string(),
  DB_POOL_MIN: z.number().min(1),
  DB_POOL_MAX: z.number().min(5),
  
  // 캐시 설정
  CACHE_DRIVER: z.enum(['redis', 'memcached']),
  CACHE_HOST: z.string(),
  CACHE_PORT: z.number(),
  CACHE_PREFIX: z.string(),
  
  // 보안 설정
  SECURITY_KEY: z.string().min(32),
  SECURITY_ALGORITHM: z.enum(['aes-256-gcm', 'aes-256-cbc']),
  
  // API 설정
  API_VERSION: z.string(),
  API_TIMEOUT: z.number().min(1000),
  API_RATE_LIMIT: z.number().min(1),
  
  // 모니터링 설정
  MONITOR_SENTRY_DSN: z.string().url(),
  MONITOR_SLOW_QUERY_MS: z.number().positive(),
  MONITOR_MEMORY_ALERT_MB: z.number().positive(),
}).strict();

// 환경 변수 검증 함수
const validateEnv = (): ENV => {
  try {
    const env = envSchema.parse(process.env);
    
    // 추가 검증 로직
    if (env.DB_POOL_MIN >= env.DB_POOL_MAX) {
      throw new Error('DB_POOL_MIN must be less than DB_POOL_MAX');
    }
    
    if (env.APP_ENV === 'production' && env.APP_DEBUG) {
      throw new Error('APP_DEBUG should be false in production');
    }
    
    return env;
  } catch (error) {
    console.error('환경 변수 검증 실패:', error);
    process.exit(1);
  }
};

// 환경 변수 로드 및 검증
const loadEnv = () => {
  // 기본 .env 파일 로드
  dotenv.config();
  
  // 환경별 .env 파일 로드
  const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
  }
  
  // 환경 변수 검증
  return validateEnv();
};
```