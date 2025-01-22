# Step 7-004: 로그 관리 및 분석

## 1. 로그 수집 설정
### 1.1 Winston 로거 설정
```typescript
// lib/logging/logger.ts
import winston from 'winston';
import { LogstashTransport } from 'winston-logstash-transport';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'gm-tool' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new LogstashTransport({
      host: process.env.LOGSTASH_HOST,
      port: parseInt(process.env.LOGSTASH_PORT || '5000'),
      ssl_enable: true,
    }),
  ],
});

export function logEvent(
  level: string,
  message: string,
  meta: Record<string, any> = {}
) {
  logger.log(level, message, {
    ...meta,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}
```

### 1.2 로그 미들웨어
```typescript
// middleware/logging.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { logEvent } from '@/lib/logging/logger';

export async function middleware(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // 요청 로깅
  logEvent('info', 'API Request', {
    requestId,
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers),
  });

  const response = await NextResponse.next();

  // 응답 로깅
  const duration = Date.now() - startTime;
  logEvent('info', 'API Response', {
    requestId,
    statusCode: response.status,
    duration,
  });

  response.headers.set('X-Request-ID', requestId);
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
```

## 2. 로그 분석
### 2.1 Elasticsearch 쿼리 유틸리티
```typescript
// lib/logging/elasticsearch.ts
import { Client } from '@elastic/elasticsearch';

const client = new Client({
  node: process.env.ELASTICSEARCH_URL,
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME!,
    password: process.env.ELASTICSEARCH_PASSWORD!,
  },
});

interface SearchParams {
  index: string;
  query: Record<string, any>;
  from?: number;
  size?: number;
  sort?: Record<string, 'asc' | 'desc'>;
}

export async function searchLogs({
  index,
  query,
  from = 0,
  size = 10,
  sort = { '@timestamp': 'desc' },
}: SearchParams) {
  try {
    const response = await client.search({
      index,
      from,
      size,
      sort,
      query,
    });

    return {
      total: response.hits.total,
      hits: response.hits.hits,
    };
  } catch (error) {
    console.error('Failed to search logs:', error);
    throw error;
  }
}
```

### 2.2 로그 분석 API
```typescript
// app/api/logs/analysis/route.ts
import { NextResponse } from 'next/server';
import { searchLogs } from '@/lib/logging/elasticsearch';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startTime = searchParams.get('startTime');
  const endTime = searchParams.get('endTime');
  const level = searchParams.get('level');

  const query = {
    bool: {
      must: [
        {
          range: {
            '@timestamp': {
              gte: startTime,
              lte: endTime,
            },
          },
        },
      ],
    },
  };

  if (level) {
    query.bool.must.push({
      term: { level },
    });
  }

  const results = await searchLogs({
    index: 'gm-tool-logs-*',
    query,
    size: 100,
  });

  return NextResponse.json(results);
}
```

## 3. 로그 시각화
### 3.1 Kibana 대시보드 설정
```typescript
// lib/logging/kibana.ts
import { KibanaClient } from '@elastic/kibana';

const kibana = new KibanaClient({
  node: process.env.KIBANA_URL,
  auth: {
    username: process.env.KIBANA_USERNAME!,
    password: process.env.KIBANA_PASSWORD!,
  },
});

interface Dashboard {
  title: string;
  description: string;
  panels: any[];
}

export async function createDashboard(dashboard: Dashboard) {
  try {
    await kibana.dashboard.create({
      body: {
        attributes: {
          title: dashboard.title,
          description: dashboard.description,
          panels: dashboard.panels,
        },
      },
    });
  } catch (error) {
    console.error('Failed to create Kibana dashboard:', error);
    throw error;
  }
}
```

### 3.2 대시보드 템플릿
```typescript
// lib/logging/templates/dashboards.ts
export const ERROR_DASHBOARD = {
  title: 'Error Analysis Dashboard',
  description: 'Analysis of application errors and exceptions',
  panels: [
    {
      type: 'visualization',
      title: 'Error Rate Over Time',
      visualization: {
        type: 'line',
        params: {
          field: '@timestamp',
          interval: 'auto',
          aggregation: 'count',
          filters: [{ term: { level: 'error' } }],
        },
      },
    },
    {
      type: 'visualization',
      title: 'Top Error Types',
      visualization: {
        type: 'pie',
        params: {
          field: 'error.type',
          size: 10,
        },
      },
    },
  ],
};

export const PERFORMANCE_DASHBOARD = {
  title: 'Performance Analysis Dashboard',
  description: 'Analysis of application performance metrics',
  panels: [
    {
      type: 'visualization',
      title: 'Response Time Distribution',
      visualization: {
        type: 'histogram',
        params: {
          field: 'duration',
          interval: 'auto',
        },
      },
    },
    {
      type: 'visualization',
      title: 'Slow Endpoints',
      visualization: {
        type: 'table',
        params: {
          field: 'url',
          metrics: ['avg:duration', 'max:duration'],
          sort: [{ field: 'avg:duration', order: 'desc' }],
          size: 10,
        },
      },
    },
  ],
};
```

## 4. 로그 보관 정책
### 4.1 로그 순환 설정
```typescript
// lib/logging/retention.ts
import { Client } from '@elastic/elasticsearch';

const client = new Client({
  node: process.env.ELASTICSEARCH_URL,
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME!,
    password: process.env.ELASTICSEARCH_PASSWORD!,
  },
});

interface RetentionPolicy {
  indexPattern: string;
  maxAge: number; // days
  rollover: {
    maxSize: string;
    maxDocs: number;
  };
}

export async function setupRetentionPolicy(policy: RetentionPolicy) {
  try {
    // ILM 정책 생성
    await client.ilm.putLifecycle({
      name: `${policy.indexPattern}-policy`,
      body: {
        policy: {
          phases: {
            hot: {
              actions: {
                rollover: {
                  max_size: policy.rollover.maxSize,
                  max_docs: policy.rollover.maxDocs,
                },
              },
            },
            delete: {
              min_age: `${policy.maxAge}d`,
              actions: {
                delete: {},
              },
            },
          },
        },
      },
    });

    // 인덱스 템플릿 생성
    await client.indices.putIndexTemplate({
      name: `${policy.indexPattern}-template`,
      body: {
        index_patterns: [`${policy.indexPattern}-*`],
        template: {
          settings: {
            index: {
              lifecycle: {
                name: `${policy.indexPattern}-policy`,
                rollover_alias: policy.indexPattern,
              },
            },
          },
        },
      },
    });
  } catch (error) {
    console.error('Failed to setup retention policy:', error);
    throw error;
  }
}
```

### 4.2 로그 아카이브
```typescript
// lib/logging/archive.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { searchLogs } from './elasticsearch';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
});

interface ArchiveOptions {
  bucket: string;
  prefix: string;
  startTime: string;
  endTime: string;
}

export async function archiveLogs({
  bucket,
  prefix,
  startTime,
  endTime,
}: ArchiveOptions) {
  try {
    const logs = await searchLogs({
      index: 'gm-tool-logs-*',
      query: {
        range: {
          '@timestamp': {
            gte: startTime,
            lte: endTime,
          },
        },
      },
      size: 10000,
    });

    const key = `${prefix}/${startTime}_${endTime}.json`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(logs.hits),
        ContentType: 'application/json',
      })
    );

    return { key };
  } catch (error) {
    console.error('Failed to archive logs:', error);
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-005.md: 보안 및 규정 준수 