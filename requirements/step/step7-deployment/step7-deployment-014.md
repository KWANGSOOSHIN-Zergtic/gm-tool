# Step 7-014: 배포 자동화 및 CI/CD 고도화

## 1. GitHub Actions 워크플로우
### 1.1 CI 워크플로우
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check
        run: npm run type-check
      
      - name: Lint
        run: npm run lint
      
      - name: Test
        run: npm run test:ci
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
      
      - name: Security scan
        run: |
          npm audit
          npx snyk test
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  build:
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
      
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1
      
      - name: Build and push image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: gm-tool
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
```

### 1.2 CD 워크플로우
```yaml
# .github/workflows/cd.yml
name: CD

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
      
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1
      
      - name: Get release version
        id: get_version
        run: echo ::set-output name=VERSION::${GITHUB_REF#refs/tags/}
      
      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster gm-tool \
            --service gm-tool-service \
            --force-new-deployment \
            --task-definition $(
              aws ecs register-task-definition \
                --cli-input-json file://task-definition.json \
                --query 'taskDefinition.taskDefinitionArn' \
                --output text
            )
        env:
          IMAGE_TAG: ${{ steps.get_version.outputs.VERSION }}
```

## 2. 배포 스크립트
### 2.1 환경 설정 스크립트
```typescript
// scripts/deploy/setup-env.ts
import { SSM } from '@aws-sdk/client-ssm';
import { logEvent } from '@/lib/logging/collector';

const ssm = new SSM({ region: process.env.AWS_REGION });

interface EnvConfig {
  environment: string;
  parameters: Array<{
    name: string;
    value: string;
    type: 'String' | 'SecureString';
  }>;
}

export async function setupEnvironment(config: EnvConfig) {
  try {
    const promises = config.parameters.map(param =>
      ssm.putParameter({
        Name: `/gm-tool/${config.environment}/${param.name}`,
        Value: param.value,
        Type: param.type,
        Overwrite: true,
      })
    );

    await Promise.all(promises);

    await logEvent('info', 'Environment setup completed', {
      environment: config.environment,
      parameterCount: config.parameters.length,
    });
  } catch (error) {
    await logEvent('error', 'Environment setup failed', { error });
    throw error;
  }
}
```

### 2.2 데이터베이스 마이그레이션 스크립트
```typescript
// scripts/deploy/migrate.ts
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logEvent } from '@/lib/logging/collector';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

interface MigrationConfig {
  environment: string;
  seedData?: boolean;
}

export async function runMigrations(config: MigrationConfig) {
  try {
    // 데이터베이스 마이그레이션 실행
    await execAsync('npx prisma migrate deploy');

    // 시드 데이터 적용 (필요한 경우)
    if (config.seedData) {
      await prisma.$transaction([
        // 시드 데이터 쿼리...
      ]);
    }

    await logEvent('info', 'Database migration completed', {
      environment: config.environment,
      seedDataApplied: config.seedData,
    });
  } catch (error) {
    await logEvent('error', 'Database migration failed', { error });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}
```

## 3. 배포 모니터링
### 3.1 배포 상태 모니터링
```typescript
// lib/deployment/monitor.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { ECS } from '@aws-sdk/client-ecs';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/notifications';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });
const ecs = new ECS({ region: process.env.AWS_REGION });

interface DeploymentStatus {
  status: 'in_progress' | 'completed' | 'failed';
  taskCount: number;
  runningCount: number;
  pendingCount: number;
  failedTasks: Array<{
    taskId: string;
    reason: string;
  }>;
  metrics: {
    cpu: number;
    memory: number;
    responseTime: number;
  };
}

export async function monitorDeployment(
  clusterName: string,
  serviceName: string
): Promise<DeploymentStatus> {
  try {
    // ECS 서비스 상태 확인
    const service = await ecs.describeServices({
      cluster: clusterName,
      services: [serviceName],
    });

    const deployment = service.services![0].deployments![0];
    const metrics = await getDeploymentMetrics(clusterName, serviceName);

    const status: DeploymentStatus = {
      status: getDeploymentStatus(deployment),
      taskCount: deployment.taskDefinition!,
      runningCount: deployment.runningCount!,
      pendingCount: deployment.pendingCount!,
      failedTasks: await getFailedTasks(clusterName, serviceName),
      metrics,
    };

    // 배포 실패 시 알림 전송
    if (status.status === 'failed') {
      await sendAlert({
        type: 'critical',
        title: '배포 실패',
        message: `${serviceName} 서비스 배포가 실패했습니다.`,
        metadata: { status },
        channels: { slack: true, email: true },
      });
    }

    await logEvent('info', 'Deployment status checked', { status });
    return status;
  } catch (error) {
    await logEvent('error', 'Failed to monitor deployment', { error });
    throw error;
  }
}
```

### 3.2 배포 성능 모니터링
```typescript
// lib/deployment/performance.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/collector';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface PerformanceMetrics {
  responseTime: {
    p50: number;
    p90: number;
    p99: number;
  };
  errorRate: number;
  cpu: {
    utilization: number;
    throttling: number;
  };
  memory: {
    utilization: number;
    swapping: number;
  };
}

export async function trackDeploymentPerformance(
  startTime: Date,
  endTime: Date
): Promise<PerformanceMetrics> {
  try {
    const metrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        // 응답 시간 지표
        {
          Id: 'response_time_p50',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApiGateway',
              MetricName: 'Latency',
              Dimensions: [
                {
                  Name: 'ApiName',
                  Value: 'gm-tool-api',
                },
              ],
            },
            Period: 300,
            Stat: 'p50',
          },
        },
        // 기타 성능 지표...
      ],
      StartTime: startTime,
      EndTime: endTime,
    });

    const performanceMetrics: PerformanceMetrics = {
      responseTime: {
        p50: metrics.MetricDataResults![0].Values![0] || 0,
        p90: metrics.MetricDataResults![1].Values![0] || 0,
        p99: metrics.MetricDataResults![2].Values![0] || 0,
      },
      errorRate: metrics.MetricDataResults![3].Values![0] || 0,
      cpu: {
        utilization: metrics.MetricDataResults![4].Values![0] || 0,
        throttling: metrics.MetricDataResults![5].Values![0] || 0,
      },
      memory: {
        utilization: metrics.MetricDataResults![6].Values![0] || 0,
        swapping: metrics.MetricDataResults![7].Values![0] || 0,
      },
    };

    await logEvent('info', 'Deployment performance tracked', { performanceMetrics });
    return performanceMetrics;
  } catch (error) {
    await logEvent('error', 'Failed to track deployment performance', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-015.md: 인프라 자동화 및 IaC 구현 