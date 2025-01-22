# Step 2-005: API 성능 최적화 및 모니터링

## 1. API 성능 최적화
### 1.1 캐싱 전략
- [ ] /lib/api/cache/config.ts
  ```typescript
  import { CacheConfig } from './types';

  export const cacheConfig: CacheConfig = {
    defaultTTL: 300, // 5 minutes
    strategies: {
      'GET /api/users': {
        ttl: 60, // 1 minute
        staleWhileRevalidate: true
      },
      'GET /api/teams': {
        ttl: 300, // 5 minutes
        staleWhileRevalidate: true
      }
    }
  };
  ```

### 1.2 데이터 압축
- [ ] /lib/api/middleware/compression.ts
  ```typescript
  import compression from 'compression';

  export const compressionMiddleware = compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    }
  });
  ```

### 1.3 Rate Limiting
- [ ] /lib/api/middleware/rate-limit.ts
  ```typescript
  import rateLimit from 'express-rate-limit';

  export const rateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later.'
      }
    }
  };

  export const apiLimiter = rateLimit(rateLimitConfig);
  ```

## 2. API 모니터링
### 2.1 성능 메트릭 수집
- [ ] /lib/monitoring/metrics.ts
  ```typescript
  import { Metrics } from '@opentelemetry/api';
  import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

  export const metrics = new Metrics({
    exporter: new PrometheusExporter(),
    metrics: {
      apiLatency: {
        name: 'api_latency',
        description: 'API endpoint latency in milliseconds',
        unit: 'ms'
      },
      apiRequests: {
        name: 'api_requests_total',
        description: 'Total number of API requests',
        unit: 'requests'
      },
      apiErrors: {
        name: 'api_errors_total',
        description: 'Total number of API errors',
        unit: 'errors'
      }
    }
  });
  ```

### 2.2 로깅 설정
- [ ] /lib/monitoring/logger.ts
  ```typescript
  import winston from 'winston';

  export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' })
    ]
  });
  ```

### 2.3 알림 설정
- [ ] /lib/monitoring/alerts.ts
  ```typescript
  import { AlertManager } from './types';

  export const alertConfig = {
    thresholds: {
      errorRate: 0.05, // 5% error rate
      latency: 1000, // 1 second
      requestRate: 1000 // requests per minute
    },
    channels: {
      slack: process.env.SLACK_WEBHOOK_URL,
      email: process.env.ALERT_EMAIL
    }
  };

  export const alertManager = new AlertManager(alertConfig);
  ```

## 3. 성능 테스트
### 3.1 부하 테스트 설정
- [ ] /tests/performance/load-test.ts
  ```typescript
  import { check } from 'k6';
  import http from 'k6/http';

  export const options = {
    stages: [
      { duration: '1m', target: 50 }, // 1분 동안 50명의 가상 사용자로 증가
      { duration: '3m', target: 50 }, // 3분 동안 50명 유지
      { duration: '1m', target: 0 }   // 1분 동안 0명으로 감소
    ],
    thresholds: {
      http_req_duration: ['p(95)<500'], // 95%의 요청이 500ms 이내 완료
      http_req_failed: ['rate<0.01']    // 1% 미만의 실패율
    }
  };

  export default function() {
    const res = http.get('http://localhost:3000/api/users');
    check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500
    });
  }
  ```

### 3.2 스트레스 테스트 설정
- [ ] /tests/performance/stress-test.ts
  ```typescript
  import { check } from 'k6';
  import http from 'k6/http';

  export const options = {
    stages: [
      { duration: '2m', target: 100 },  // 2분 동안 100명으로 증가
      { duration: '5m', target: 100 },  // 5분 동안 100명 유지
      { duration: '2m', target: 200 },  // 2분 동안 200명으로 증가
      { duration: '5m', target: 200 },  // 5분 동안 200명 유지
      { duration: '2m', target: 0 }     // 2분 동안 0명으로 감소
    ],
    thresholds: {
      http_req_duration: ['p(99)<1500'], // 99%의 요청이 1.5초 이내 완료
      http_req_failed: ['rate<0.02']     // 2% 미만의 실패율
    }
  };

  export default function() {
    const res = http.get('http://localhost:3000/api/users');
    check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 1500ms': (r) => r.timings.duration < 1500
    });
  }
  ```

## 4. 모니터링 대시보드
### 4.1 Grafana 대시보드 설정
- [ ] /monitoring/dashboards/api-metrics.json
  ```json
  {
    "dashboard": {
      "id": null,
      "title": "API Metrics Dashboard",
      "panels": [
        {
          "title": "API Latency",
          "type": "graph",
          "datasource": "Prometheus",
          "targets": [
            {
              "expr": "rate(api_latency_sum[5m]) / rate(api_latency_count[5m])",
              "legendFormat": "Average Latency"
            }
          ]
        },
        {
          "title": "Request Rate",
          "type": "graph",
          "datasource": "Prometheus",
          "targets": [
            {
              "expr": "sum(rate(api_requests_total[5m])) by (endpoint)",
              "legendFormat": "{{endpoint}}"
            }
          ]
        },
        {
          "title": "Error Rate",
          "type": "graph",
          "datasource": "Prometheus",
          "targets": [
            {
              "expr": "sum(rate(api_errors_total[5m])) by (error_type)",
              "legendFormat": "{{error_type}}"
            }
          ]
        }
      ]
    }
  }
  ```

## 다음 단계
- step2-api-006.md: API 보안 강화 및 인증/인가 시스템 