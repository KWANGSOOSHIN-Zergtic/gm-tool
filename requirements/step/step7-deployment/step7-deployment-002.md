# Step 7-002: 배포 자동화 구성

## 1. 배포 스크립트
### 1.1 배포 환경 설정 스크립트
```bash
#!/bin/bash
# scripts/deploy/setup-env.sh

# 환경 변수 설정
setup_environment() {
  local env=$1
  
  case $env in
    "staging")
      export AWS_PROFILE=staging
      export ENVIRONMENT=staging
      export DOMAIN=staging.your-domain.com
      ;;
    "production")
      export AWS_PROFILE=production
      export ENVIRONMENT=production
      export DOMAIN=your-domain.com
      ;;
    *)
      echo "Invalid environment: $env"
      exit 1
      ;;
  esac
}

# AWS SSM 파라미터 설정
setup_ssm_parameters() {
  local env=$1
  
  aws ssm put-parameter \
    --name "/gm-tool/$env/database-url" \
    --value "$DATABASE_URL" \
    --type "SecureString" \
    --overwrite

  aws ssm put-parameter \
    --name "/gm-tool/$env/nextauth-secret" \
    --value "$NEXTAUTH_SECRET" \
    --type "SecureString" \
    --overwrite
}

# 메인 실행
main() {
  local env=$1
  
  if [ -z "$env" ]; then
    echo "Usage: $0 <environment>"
    exit 1
  fi
  
  setup_environment "$env"
  setup_ssm_parameters "$env"
}

main "$@"
```

### 1.2 데이터베이스 마이그레이션 스크립트
```bash
#!/bin/bash
# scripts/deploy/migrate.sh

set -e

# 데이터베이스 마이그레이션
run_migrations() {
  echo "Running database migrations..."
  npx prisma migrate deploy
}

# 시드 데이터 적용
run_seeds() {
  if [ "$APPLY_SEEDS" = "true" ]; then
    echo "Applying seed data..."
    npx prisma db seed
  fi
}

# 메인 실행
main() {
  run_migrations
  run_seeds
  
  echo "Database setup completed successfully"
}

main "$@"
```

## 2. 자동화된 배포 구성
### 2.1 배포 파이프라인 설정
```yaml
# .github/workflows/deploy-pipeline.yml
name: Deploy Pipeline

on:
  push:
    tags:
      - 'v*'

jobs:
  prepare:
    runs-on: ubuntu-latest
    outputs:
      environment: ${{ steps.set-env.outputs.environment }}
      version: ${{ steps.set-version.outputs.version }}
    
    steps:
      - id: set-env
        run: |
          if [[ ${{ github.ref }} =~ ^refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "environment=production" >> $GITHUB_OUTPUT
          else
            echo "environment=staging" >> $GITHUB_OUTPUT
          fi
      
      - id: set-version
        run: echo "version=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT

  deploy:
    needs: prepare
    runs-on: ubuntu-latest
    environment: ${{ needs.prepare.outputs.environment }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup deployment
        run: |
          ./scripts/deploy/setup-env.sh ${{ needs.prepare.outputs.environment }}
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      
      - name: Deploy infrastructure
        run: |
          terraform init
          terraform workspace select ${{ needs.prepare.outputs.environment }} || terraform workspace new ${{ needs.prepare.outputs.environment }}
          terraform apply -auto-approve
      
      - name: Deploy application
        run: |
          docker build \
            --build-arg VERSION=${{ needs.prepare.outputs.version }} \
            -t ${{ secrets.ECR_REGISTRY }}/gm-tool:${{ needs.prepare.outputs.version }} \
            .
          docker push ${{ secrets.ECR_REGISTRY }}/gm-tool:${{ needs.prepare.outputs.version }}
      
      - name: Run migrations
        run: ./scripts/deploy/migrate.sh
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          APPLY_SEEDS: ${{ needs.prepare.outputs.environment == 'staging' }}
```

### 2.2 롤백 파이프라인 설정
```yaml
# .github/workflows/rollback.yml
name: Rollback

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to rollback to'
        required: true
      environment:
        description: 'Environment to rollback'
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  rollback:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2
      
      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster gm-tool-cluster \
            --service gm-tool-service \
            --force-new-deployment \
            --task-definition gm-tool:${{ github.event.inputs.version }}
```

## 3. 배포 모니터링
### 3.1 배포 상태 모니터링
```typescript
// lib/monitoring/deployment.ts
import { datadogRum } from '@datadog/browser-rum';

export function trackDeployment() {
  if (process.env.NODE_ENV === 'production') {
    datadogRum.addTiming('deployment', {
      version: process.env.NEXT_PUBLIC_APP_VERSION,
      environment: process.env.NODE_ENV,
    });

    // 배포 후 성능 메트릭 수집
    const performanceMetrics = {
      ttfb: performance.timing.responseStart - performance.timing.navigationStart,
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
      lcp: performance.getEntriesByName('largest-contentful-paint')[0]?.startTime,
    };

    datadogRum.addAction('deployment_performance', {
      ...performanceMetrics,
      version: process.env.NEXT_PUBLIC_APP_VERSION,
    });
  }
}
```

### 3.2 알림 설정
```typescript
// lib/monitoring/alerts.ts
import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_TOKEN);

interface DeploymentAlert {
  version: string;
  environment: string;
  status: 'success' | 'failure';
  error?: Error;
}

export async function sendDeploymentAlert({
  version,
  environment,
  status,
  error,
}: DeploymentAlert) {
  const channel = environment === 'production' 
    ? '#prod-deployments' 
    : '#staging-deployments';

  const message = status === 'success'
    ? `✅ 배포 성공: ${version} (${environment})`
    : `❌ 배포 실패: ${version} (${environment})\n오류: ${error?.message}`;

  await slack.chat.postMessage({
    channel,
    text: message,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `배포 시간: ${new Date().toLocaleString('ko-KR')}`,
          },
        ],
      },
    ],
  });
}
```

## 4. 배포 후 작업
### 4.1 헬스 체크
```typescript
// lib/monitoring/health.ts
import { prisma } from '@/lib/db/client';
import { redis } from '@/lib/cache/redis';

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  checks: {
    database: boolean;
    redis: boolean;
    api: boolean;
  };
}

export async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks = {
    database: false,
    redis: false,
    api: false,
  };

  try {
    // 데이터베이스 연결 확인
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    console.error('Database health check failed:', error);
  }

  try {
    // Redis 연결 확인
    await redis.ping();
    checks.redis = true;
  } catch (error) {
    console.error('Redis health check failed:', error);
  }

  try {
    // API 엔드포인트 확인
    const response = await fetch('/api/health');
    checks.api = response.ok;
  } catch (error) {
    console.error('API health check failed:', error);
  }

  const status = Object.values(checks).every(Boolean) ? 'healthy' : 'unhealthy';

  return {
    status,
    checks,
  };
}
```

### 4.2 캐시 무효화
```typescript
// lib/cache/invalidation.ts
import { redis } from '@/lib/cache/redis';

interface InvalidationOptions {
  patterns?: string[];
  complete?: boolean;
}

export async function invalidateCache({
  patterns = [],
  complete = false,
}: InvalidationOptions = {}) {
  if (complete) {
    await redis.flushdb();
    return;
  }

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

## 다음 단계
- step7-deployment-003.md: 배포 모니터링 및 알림 구성 