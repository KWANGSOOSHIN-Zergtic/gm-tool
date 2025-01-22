# Step 2-007: API 배포 및 운영 가이드라인

## 1. 배포 환경 설정
### 1.1 환경 변수 설정
- [ ] /.env.production
  ```env
  # API 설정
  NEXT_PUBLIC_API_URL=https://api.example.com
  API_VERSION=v1
  NODE_ENV=production

  # 데이터베이스 설정
  DATABASE_URL=postgresql://user:password@localhost:5432/dbname

  # 인증 설정
  JWT_SECRET=your-production-jwt-secret
  JWT_REFRESH_SECRET=your-production-refresh-secret
  JWT_AUDIENCE=https://api.example.com
  JWT_ISSUER=https://api.example.com

  # 보안 설정
  ALLOWED_ORIGINS=https://example.com,https://admin.example.com
  RATE_LIMIT_WINDOW_MS=900000
  RATE_LIMIT_MAX_REQUESTS=1000

  # 모니터링 설정
  SENTRY_DSN=your-sentry-dsn
  LOG_LEVEL=info
  PROMETHEUS_ENDPOINT=/metrics

  # 알림 설정
  SLACK_WEBHOOK_URL=your-slack-webhook-url
  ALERT_EMAIL=alerts@example.com
  ```

### 1.2 Docker 설정
- [ ] /Dockerfile
  ```dockerfile
  # 빌드 스테이지
  FROM node:18-alpine AS builder
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run build

  # 프로덕션 스테이지
  FROM node:18-alpine AS runner
  WORKDIR /app

  ENV NODE_ENV production

  RUN addgroup --system --gid 1001 nodejs
  RUN adduser --system --uid 1001 nextjs

  COPY --from=builder /app/public ./public
  COPY --from=builder /app/.next/standalone ./
  COPY --from=builder /app/.next/static ./.next/static

  USER nextjs

  EXPOSE 3000

  ENV PORT 3000
  ENV HOSTNAME "0.0.0.0"

  CMD ["node", "server.js"]
  ```

### 1.3 Docker Compose 설정
- [ ] /docker-compose.yml
  ```yaml
  version: '3.8'

  services:
    api:
      build:
        context: .
        target: runner
      ports:
        - "3000:3000"
      environment:
        - NODE_ENV=production
      env_file:
        - .env.production
      depends_on:
        - db
        - redis
      networks:
        - app-network

    db:
      image: postgres:14-alpine
      environment:
        POSTGRES_USER: ${DB_USER}
        POSTGRES_PASSWORD: ${DB_PASSWORD}
        POSTGRES_DB: ${DB_NAME}
      volumes:
        - postgres-data:/var/lib/postgresql/data
      networks:
        - app-network

    redis:
      image: redis:7-alpine
      command: redis-server --requirepass ${REDIS_PASSWORD}
      volumes:
        - redis-data:/data
      networks:
        - app-network

    prometheus:
      image: prom/prometheus
      volumes:
        - ./monitoring/prometheus:/etc/prometheus
        - prometheus-data:/prometheus
      command:
        - '--config.file=/etc/prometheus/prometheus.yml'
      networks:
        - app-network

    grafana:
      image: grafana/grafana
      ports:
        - "3001:3000"
      volumes:
        - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
        - grafana-data:/var/lib/grafana
      networks:
        - app-network

networks:
  app-network:
    driver: bridge

volumes:
  postgres-data:
  redis-data:
  prometheus-data:
  grafana-data:
  ```

## 2. CI/CD 파이프라인
### 2.1 GitHub Actions 워크플로우
- [ ] /.github/workflows/deploy.yml
  ```yaml
  name: Deploy API
  on:
    push:
      branches:
        - main
      paths:
        - 'app/**'
        - 'lib/**'
        - 'pages/**'
        - 'public/**'
        - 'package.json'
        - 'package-lock.json'
        - 'Dockerfile'
        - 'docker-compose.yml'

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
        - name: Run tests
          run: npm run test
        - name: Run lint
          run: npm run lint

    build:
      needs: test
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v2
        - name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v1
        - name: Login to DockerHub
          uses: docker/login-action@v1
          with:
            username: ${{ secrets.DOCKERHUB_USERNAME }}
            password: ${{ secrets.DOCKERHUB_TOKEN }}
        - name: Build and push
          uses: docker/build-push-action@v2
          with:
            push: true
            tags: your-org/api:latest

    deploy:
      needs: build
      runs-on: ubuntu-latest
      steps:
        - name: Deploy to production
          uses: appleboy/ssh-action@master
          with:
            host: ${{ secrets.SSH_HOST }}
            username: ${{ secrets.SSH_USERNAME }}
            key: ${{ secrets.SSH_PRIVATE_KEY }}
            script: |
              cd /opt/api
              docker-compose pull
              docker-compose up -d
  ```

## 3. 운영 모니터링
### 3.1 Prometheus 설정
- [ ] /monitoring/prometheus/prometheus.yml
  ```yaml
  global:
    scrape_interval: 15s
    evaluation_interval: 15s

  scrape_configs:
    - job_name: 'api'
      static_configs:
        - targets: ['api:3000']
      metrics_path: '/metrics'

  alerting:
    alertmanagers:
      - static_configs:
          - targets: ['alertmanager:9093']
  ```

### 3.2 Grafana 대시보드
- [ ] /monitoring/grafana/provisioning/dashboards/api.json
  ```json
  {
    "dashboard": {
      "id": null,
      "title": "API Operations Dashboard",
      "panels": [
        {
          "title": "Request Rate",
          "type": "graph",
          "datasource": "Prometheus",
          "targets": [
            {
              "expr": "rate(http_requests_total[5m])",
              "legendFormat": "{{method}} {{path}}"
            }
          ]
        },
        {
          "title": "Error Rate",
          "type": "graph",
          "datasource": "Prometheus",
          "targets": [
            {
              "expr": "rate(http_errors_total[5m])",
              "legendFormat": "{{status_code}}"
            }
          ]
        },
        {
          "title": "Response Time",
          "type": "graph",
          "datasource": "Prometheus",
          "targets": [
            {
              "expr": "rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])",
              "legendFormat": "{{path}}"
            }
          ]
        }
      ]
    }
  }
  ```

## 4. 장애 대응
### 4.1 장애 대응 가이드라인
- [ ] /docs/operations/incident-response.md
  ```markdown
  # 장애 대응 가이드라인

  ## 1. 장애 레벨 정의
  - P0 (Critical): 서비스 전체 중단
  - P1 (High): 주요 기능 장애
  - P2 (Medium): 일부 기능 장애
  - P3 (Low): 경미한 장애

  ## 2. 대응 프로세스
  1. 장애 감지 및 알림
  2. 초기 대응 및 상황 파악
  3. 장애 레벨 판단
  4. 대응팀 구성
  5. 조치 실행
  6. 모니터링 및 복구 확인
  7. 사후 분석 및 재발 방지 대책 수립

  ## 3. 비상 연락망
  - 개발팀: dev-team@example.com
  - 운영팀: ops-team@example.com
  - 보안팀: security-team@example.com
  ```

### 4.2 롤백 절차
- [ ] /docs/operations/rollback.md
  ```markdown
  # 롤백 절차

  ## 1. 롤백 결정
  - 서비스 중단 발생
  - 심각한 보안 취약점 발견
  - 데이터 정합성 문제 발생

  ## 2. 롤백 명령어
  ```bash
  # 이전 버전 확인
  docker image ls

  # 특정 버전으로 롤백
  docker-compose down
  docker tag your-org/api:previous your-org/api:latest
  docker-compose up -d

  # 데이터베이스 롤백 (필요한 경우)
  pg_restore -h localhost -U postgres -d dbname backup.sql
  ```

  ## 3. 롤백 후 확인사항
  1. 서비스 정상 동작 확인
  2. 로그 모니터링
  3. 메트릭 확인
  4. 사용자 영향도 파악
  ```

## 5. 백업 및 복구
### 5.1 백업 설정
- [ ] /scripts/backup.sh
  ```bash
  #!/bin/bash

  # 환경 변수 로드
  source .env.production

  # 타임스탬프
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)

  # 데이터베이스 백업
  pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME > backup_${TIMESTAMP}.sql

  # S3에 백업 파일 업로드
  aws s3 cp backup_${TIMESTAMP}.sql s3://$BACKUP_BUCKET/database/

  # 오래된 백업 정리
  find . -name "backup_*.sql" -mtime +7 -delete
  ```

### 5.2 복구 절차
- [ ] /docs/operations/recovery.md
  ```markdown
  # 복구 절차

  ## 1. 데이터베이스 복구
  ```bash
  # S3에서 백업 파일 다운로드
  aws s3 cp s3://$BACKUP_BUCKET/database/backup_TIMESTAMP.sql .

  # 데이터베이스 복구
  pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME backup_TIMESTAMP.sql
  ```

  ## 2. 서비스 복구
  ```bash
  # 서비스 재시작
  docker-compose restart api

  # 상태 확인
  docker-compose ps
  docker-compose logs --tail=100 api
  ```
  ```

## 다음 단계
- step2-api-008.md: API 확장성 및 성능 최적화 가이드라인 