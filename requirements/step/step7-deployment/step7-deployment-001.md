# Step 7-001: 배포 환경 설정

## 1. Docker 설정
### 1.1 Dockerfile
```dockerfile
# Dockerfile
FROM node:18-alpine AS base

# 의존성 설치 단계
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 빌드 단계
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# 프로덕션 단계
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

### 1.2 Docker Compose
```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    depends_on:
      - db
      - redis

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## 2. CI/CD 설정
### 2.1 GitHub Actions
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test_db
          NEXTAUTH_SECRET: test_secret
          NEXTAUTH_URL: http://localhost:3000

  build:
    needs: test
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
```

### 2.2 배포 워크플로우
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [ main ]

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
          aws-region: ap-northeast-2
          
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1
        
      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: gm-tool
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          
      - name: Deploy to ECS
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: task-definition.json
          service: gm-tool-service
          cluster: gm-tool-cluster
          wait-for-service-stability: true
```

## 3. 인프라 설정
### 3.1 AWS ECS 태스크 정의
```json
// task-definition.json
{
  "family": "gm-tool",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "app",
      "image": "${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:ssm:region:account:parameter/gm-tool/database-url"
        },
        {
          "name": "NEXTAUTH_SECRET",
          "valueFrom": "arn:aws:ssm:region:account:parameter/gm-tool/nextauth-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/gm-tool",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 3.2 Terraform 인프라 정의
```hcl
# main.tf
provider "aws" {
  region = "ap-northeast-2"
}

module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  
  name = "gm-tool-vpc"
  cidr = "10.0.0.0/16"
  
  azs             = ["ap-northeast-2a", "ap-northeast-2c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]
  
  enable_nat_gateway = true
  single_nat_gateway = true
}

module "ecs" {
  source = "terraform-aws-modules/ecs/aws"
  
  cluster_name = "gm-tool-cluster"
  
  cluster_configuration = {
    execute_command_configuration = {
      logging = "OVERRIDE"
      log_configuration = {
        cloud_watch_log_group_name = "/aws/ecs/gm-tool"
      }
    }
  }
  
  fargate_capacity_providers = {
    FARGATE = {
      default_capacity_provider_strategy = {
        weight = 100
      }
    }
  }
}

module "rds" {
  source = "terraform-aws-modules/rds/aws"
  
  identifier = "gm-tool-db"
  
  engine               = "postgres"
  engine_version      = "15"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20
  
  db_name  = "gmtool"
  username = var.db_username
  password = var.db_password
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  subnet_ids             = module.vpc.private_subnets
}
```

## 4. 모니터링 설정
### 4.1 Datadog 설정
```typescript
// lib/monitoring/datadog.ts
import { datadogRum } from '@datadog/browser-rum';
import { datadogLogs } from '@datadog/browser-logs';

export function initDatadog() {
  if (process.env.NODE_ENV === 'production') {
    datadogRum.init({
      applicationId: process.env.NEXT_PUBLIC_DATADOG_APP_ID!,
      clientToken: process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN!,
      site: 'datadoghq.com',
      service: 'gm-tool',
      env: process.env.NODE_ENV,
      version: process.env.NEXT_PUBLIC_APP_VERSION,
      sessionSampleRate: 100,
      trackUserInteractions: true,
      defaultPrivacyLevel: 'mask-user-input',
    });

    datadogLogs.init({
      clientToken: process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN!,
      site: 'datadoghq.com',
      forwardErrorsToLogs: true,
      sessionSampleRate: 100,
    });
  }
}
```

### 4.2 Sentry 설정
```typescript
// lib/monitoring/sentry.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  integrations: [
    new Sentry.BrowserTracing({
      tracePropagationTargets: ['localhost', /^https:\/\/[^/]*\.your-domain\.com/],
    }),
  ],
});
```

## 다음 단계
- step7-deployment-002.md: 배포 자동화 구성 