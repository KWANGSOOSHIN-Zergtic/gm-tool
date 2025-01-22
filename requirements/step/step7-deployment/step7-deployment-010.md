# Step 7-010: 배포 자동화 및 CI/CD

## 1. CI/CD 파이프라인
### 1.1 GitHub Actions 워크플로우
```yaml
# .github/workflows/main.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
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
        run: npm run test
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}

  security:
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run npm audit
        run: npm audit
      
      - name: Run Snyk Security Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      
      - name: Run OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'gm-tool'
          path: '.'
          format: 'HTML'
          args: >
            --suppression suppression.xml
            --failOnCVSS 7
            --enableRetired

  build:
    needs: [validate, security]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
          NEXTAUTH_URL: ${{ secrets.NEXTAUTH_URL }}
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}
      
      - name: Upload build artifact
        uses: actions/upload-artifact@v3
        with:
          name: build
          path: .next
          retention-days: 1

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2
      
      - name: Download build artifact
        uses: actions/download-artifact@v3
        with:
          name: build
          path: .next
      
      - name: Build Docker image
        run: |
          docker build \
            --build-arg NODE_ENV=production \
            -t ${{ secrets.ECR_REGISTRY }}/gm-tool:${{ github.sha }} \
            .
      
      - name: Push Docker image
        run: |
          aws ecr get-login-password --region ap-northeast-2 | \
          docker login --username AWS --password-stdin ${{ secrets.ECR_REGISTRY }}
          docker push ${{ secrets.ECR_REGISTRY }}/gm-tool:${{ github.sha }}
      
      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster gm-tool \
            --service gm-tool-service \
            --force-new-deployment \
            --task-definition gm-tool:${{ github.sha }}
```

### 1.2 배포 스크립트
```typescript
// scripts/deploy.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { logEvent } from '@/lib/logging/logger';

const execAsync = promisify(exec);

interface DeploymentConfig {
  environment: 'staging' | 'production';
  version: string;
  registry: string;
  cluster: string;
  service: string;
}

export async function deploy(config: DeploymentConfig) {
  const steps = [
    {
      name: 'Build Application',
      command: `npm run build`,
    },
    {
      name: 'Build Docker Image',
      command: `docker build -t ${config.registry}/gm-tool:${config.version} .`,
    },
    {
      name: 'Push Docker Image',
      command: `docker push ${config.registry}/gm-tool:${config.version}`,
    },
    {
      name: 'Update ECS Service',
      command: `aws ecs update-service \
        --cluster ${config.cluster} \
        --service ${config.service} \
        --force-new-deployment \
        --task-definition gm-tool:${config.version}`,
    },
  ];

  for (const step of steps) {
    try {
      logEvent('info', `Starting deployment step: ${step.name}`);
      await execAsync(step.command);
      logEvent('info', `Completed deployment step: ${step.name}`);
    } catch (error) {
      logEvent('error', `Deployment step failed: ${step.name}`, { error });
      throw error;
    }
  }
}
```

## 2. 인프라 자동화
### 2.1 Terraform 설정
```hcl
# infrastructure/main.tf
provider "aws" {
  region = "ap-northeast-2"
}

module "vpc" {
  source = "./modules/vpc"
  
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
  azs         = var.availability_zones
}

module "ecs" {
  source = "./modules/ecs"
  
  environment    = var.environment
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnet_ids
  container_port = 3000
}

module "rds" {
  source = "./modules/rds"
  
  environment    = var.environment
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.database_subnet_ids
  instance_class = "db.t3.medium"
}

module "redis" {
  source = "./modules/redis"
  
  environment    = var.environment
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.database_subnet_ids
  instance_type  = "cache.t3.micro"
}

module "monitoring" {
  source = "./modules/monitoring"
  
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
  
  alarm_topics = {
    critical = aws_sns_topic.critical_alarms.arn
    warning  = aws_sns_topic.warning_alarms.arn
  }
}
```

### 2.2 Terraform 모듈
```hcl
# infrastructure/modules/ecs/main.tf
resource "aws_ecs_cluster" "main" {
  name = "gm-tool-${var.environment}"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = "gm-tool"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = 256
  memory                  = 512
  
  container_definitions = jsonencode([
    {
      name  = "app"
      image = "${var.ecr_repository_url}:latest"
      
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]
      
      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "DATABASE_URL"
          value = var.database_url
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/gm-tool"
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "app"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "app" {
  name            = "gm-tool-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.service_desired_count
  
  network_configuration {
    subnets         = var.subnet_ids
    security_groups = [aws_security_group.ecs_tasks.id]
  }
  
  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.container_port
  }
}
```

## 3. 배포 모니터링
### 3.1 배포 상태 모니터링
```typescript
// lib/deployment/monitoring.ts
import { ECS } from '@aws-sdk/client-ecs';
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/logger';

const ecs = new ECS({ region: process.env.AWS_REGION });
const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface DeploymentStatus {
  status: 'in_progress' | 'completed' | 'failed';
  desiredCount: number;
  runningCount: number;
  pendingCount: number;
  events: string[];
}

export async function monitorDeployment(
  clusterName: string,
  serviceName: string
): Promise<DeploymentStatus> {
  try {
    const service = await ecs.describeServices({
      cluster: clusterName,
      services: [serviceName],
    });

    const deployment = service.services?.[0].deployments?.find(
      d => d.status === 'PRIMARY'
    );

    if (!deployment) {
      throw new Error('No active deployment found');
    }

    const status: DeploymentStatus = {
      status: deployment.rolloutState === 'COMPLETED'
        ? 'completed'
        : deployment.rolloutState === 'FAILED'
          ? 'failed'
          : 'in_progress',
      desiredCount: deployment.desiredCount,
      runningCount: deployment.runningCount,
      pendingCount: deployment.pendingCount,
      events: service.services[0].events
        ?.slice(0, 5)
        .map(e => e.message) || [],
    };

    // CloudWatch 메트릭 전송
    await cloudwatch.putMetricData({
      Namespace: 'GMTool/Deployment',
      MetricData: [
        {
          MetricName: 'DesiredCount',
          Value: status.desiredCount,
          Unit: 'Count',
        },
        {
          MetricName: 'RunningCount',
          Value: status.runningCount,
          Unit: 'Count',
        },
        {
          MetricName: 'PendingCount',
          Value: status.pendingCount,
          Unit: 'Count',
        },
      ],
    });

    logEvent('info', 'Deployment status updated', status);

    return status;
  } catch (error) {
    logEvent('error', 'Failed to monitor deployment', { error });
    throw error;
  }
}
```

### 3.2 배포 알림
```typescript
// lib/deployment/notifications.ts
import { sendSlackAlert } from '@/lib/monitoring/notifications/slack';
import { sendEmailAlert } from '@/lib/monitoring/notifications/email';
import { logEvent } from '@/lib/logging/logger';

interface DeploymentNotification {
  version: string;
  environment: string;
  status: 'started' | 'completed' | 'failed';
  details?: Record<string, any>;
}

export async function notifyDeployment(notification: DeploymentNotification) {
  try {
    const message = formatDeploymentMessage(notification);
    const color = getStatusColor(notification.status);

    // Slack 알림
    await sendSlackAlert('deployment', message, [
      {
        color,
        fields: [
          {
            title: 'Version',
            value: notification.version,
            short: true,
          },
          {
            title: 'Environment',
            value: notification.environment,
            short: true,
          },
          {
            title: 'Status',
            value: notification.status.toUpperCase(),
            short: true,
          },
        ],
      },
    ]);

    // 이메일 알림
    if (notification.status === 'completed' || notification.status === 'failed') {
      await sendEmailAlert({
        subject: `Deployment ${notification.status.toUpperCase()}: ${notification.version}`,
        body: message,
        recipients: process.env.DEPLOYMENT_EMAIL_RECIPIENTS!.split(','),
        isHtml: true,
      });
    }

    logEvent('info', 'Deployment notification sent', notification);
  } catch (error) {
    logEvent('error', 'Failed to send deployment notification', { error });
    throw error;
  }
}

function formatDeploymentMessage(notification: DeploymentNotification): string {
  const emoji = {
    started: '🚀',
    completed: '✅',
    failed: '❌',
  }[notification.status];

  return `${emoji} Deployment ${notification.status.toUpperCase()}
Version: ${notification.version}
Environment: ${notification.environment}
${notification.details ? `\nDetails:\n${JSON.stringify(notification.details, null, 2)}` : ''}`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'started':
      return '#3498db';
    case 'completed':
      return '#2ecc71';
    case 'failed':
      return '#e74c3c';
    default:
      return '#95a5a6';
  }
}
```

## 다음 단계
- step7-deployment-011.md: 성능 최적화 및 스케일링 