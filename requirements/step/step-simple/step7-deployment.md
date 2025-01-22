# Step 7: 배포 및 운영

## 7.1 Docker 설정
```dockerfile
# /Dockerfile
FROM node:18-alpine AS base

# 의존성 설치
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 빌드
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 프로덕션
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

## 7.2 CI/CD 파이프라인
```yaml
# /.github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Build
        run: npm run build
        
      - name: Deploy to production
        run: |
          # 배포 스크립트
          echo "Deploying to production..."
```

## 7.3 환경 설정
```typescript
// /config/environment.ts
export const environment = {
  production: process.env.NODE_ENV === 'production',
  apiUrl: process.env.API_URL,
  database: {
    url: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10,
    },
  },
  redis: {
    url: process.env.REDIS_URL,
    ttl: 3600,
  },
};

// Docker Compose 설정
// /docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - db
      - redis
  
  db:
    image: postgres:14
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:6
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## 7.4 모니터링 설정
```typescript
// /lib/monitoring/index.ts
import { init } from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export function setupMonitoring() {
  if (process.env.NODE_ENV === 'production') {
    init({
      dsn: process.env.SENTRY_DSN,
      integrations: [new ProfilingIntegration()],
      tracesSampleRate: 1.0,
    });
  }
}

// 헬스 체크 엔드포인트
// /app/api/health/route.ts
export async function GET() {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: 'OK',
  };

  return Response.json(health);
}
```

## 7.5 백업 설정
```bash
#!/bin/bash
# /scripts/backup.sh

# 데이터베이스 백업
pg_dump $DATABASE_URL > backup.sql

# S3에 업로드
aws s3 cp backup.sql s3://$BACKUP_BUCKET/$(date +%Y-%m-%d)/

# 오래된 백업 정리
aws s3 ls s3://$BACKUP_BUCKET/ | sort -r | tail -n +8 | xargs -I {} aws s3 rm s3://$BACKUP_BUCKET/{}
```

## 7.6 로깅 설정
```typescript
// /lib/logging/index.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
  ],
});
```

## 다음 단계
- 운영 환경 모니터링
- 성능 최적화
- 보안 강화
- 장애 대응 계획 수립 