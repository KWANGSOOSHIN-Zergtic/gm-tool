# Step 7-019: 로깅 시스템 고도화

## 1. 로깅 시스템 구성
### 1.1 로그 수집기
```typescript
// lib/logging/collector.ts
import { CloudWatchLogs } from '@aws-sdk/client-cloudwatch-logs';
import { ElasticsearchClient } from '@elastic/elasticsearch';
import { v4 as uuidv4 } from 'uuid';

const cloudwatchLogs = new CloudWatchLogs({ region: process.env.AWS_REGION });
const elasticsearch = new ElasticsearchClient({
  node: process.env.ELASTICSEARCH_URL,
});

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string;
  metadata?: Record<string, any>;
  traceId?: string;
  spanId?: string;
}

export async function logEvent(
  level: LogEntry['level'],
  message: string,
  metadata?: Record<string, any>
) {
  const logEntry: LogEntry = {
    id: uuidv4(),
    timestamp: new Date(),
    level,
    message,
    source: process.env.SERVICE_NAME || 'gm-tool',
    metadata,
    traceId: process.env.TRACE_ID,
    spanId: process.env.SPAN_ID,
  };

  try {
    // CloudWatch Logs에 로그 전송
    await cloudwatchLogs.putLogEvents({
      logGroupName: `/gm-tool/${process.env.NODE_ENV}`,
      logStreamName: new Date().toISOString().split('T')[0],
      logEvents: [
        {
          timestamp: logEntry.timestamp.getTime(),
          message: JSON.stringify(logEntry),
        },
      ],
    });

    // Elasticsearch에 로그 저장
    await elasticsearch.index({
      index: `gm-tool-logs-${process.env.NODE_ENV}-${new Date().toISOString().split('T')[0]}`,
      document: logEntry,
    });
  } catch (error) {
    console.error('Failed to send log entry:', error);
  }
}
```

### 1.2 로그 분석기
```typescript
// lib/logging/analyzer.ts
import { ElasticsearchClient } from '@elastic/elasticsearch';
import { logEvent } from './collector';

const elasticsearch = new ElasticsearchClient({
  node: process.env.ELASTICSEARCH_URL,
});

interface LogAnalysis {
  errorRate: number;
  slowRequests: Array<{
    path: string;
    method: string;
    avgDuration: number;
    count: number;
  }>;
  topErrors: Array<{
    message: string;
    count: number;
  }>;
  unusualPatterns: Array<{
    pattern: string;
    confidence: number;
    description: string;
  }>;
}

export async function analyzeLogPatterns(
  environment: string,
  startTime: Date,
  endTime: Date
): Promise<LogAnalysis> {
  try {
    // 에러율 계산
    const errorRateResponse = await elasticsearch.search({
      index: `gm-tool-logs-${environment}-*`,
      body: {
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: startTime.toISOString(),
                    lte: endTime.toISOString(),
                  },
                },
              },
            ],
          },
        },
        aggs: {
          error_count: {
            filter: {
              term: {
                level: 'error',
              },
            },
          },
          total_count: {
            value_count: {
              field: 'id',
            },
          },
        },
      },
    });

    // 느린 요청 분석
    const slowRequestsResponse = await elasticsearch.search({
      index: `gm-tool-logs-${environment}-*`,
      body: {
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: startTime.toISOString(),
                    lte: endTime.toISOString(),
                  },
                },
              },
              {
                range: {
                  'metadata.duration': {
                    gte: 1000,
                  },
                },
              },
            ],
          },
        },
        aggs: {
          by_path: {
            terms: {
              field: 'metadata.path.keyword',
              size: 10,
            },
            aggs: {
              avg_duration: {
                avg: {
                  field: 'metadata.duration',
                },
              },
            },
          },
        },
      },
    });

    const analysis: LogAnalysis = {
      errorRate:
        errorRateResponse.aggregations.error_count.doc_count /
        errorRateResponse.aggregations.total_count.value,
      slowRequests: slowRequestsResponse.aggregations.by_path.buckets.map(
        bucket => ({
          path: bucket.key,
          method: bucket.method,
          avgDuration: bucket.avg_duration.value,
          count: bucket.doc_count,
        })
      ),
      topErrors: [],
      unusualPatterns: [],
    };

    await logEvent('info', 'Log patterns analyzed', { analysis });

    return analysis;
  } catch (error) {
    await logEvent('error', 'Failed to analyze log patterns', { error });
    throw error;
  }
}
```

## 2. 로그 시각화 및 대시보드
### 2.1 Kibana 대시보드 생성기
```typescript
// lib/logging/dashboard-generator.ts
import { KibanaClient } from '@elastic/kibana';
import { logEvent } from './collector';

const kibana = new KibanaClient({
  node: process.env.KIBANA_URL,
});

interface DashboardConfig {
  title: string;
  timeRange: {
    from: string;
    to: string;
  };
  panels: Array<{
    type: 'visualization' | 'search';
    title: string;
    size: {
      width: number;
      height: number;
    };
    position: {
      x: number;
      y: number;
    };
    config: Record<string, any>;
  }>;
}

export async function generateLogDashboard(
  environment: string,
  config: DashboardConfig
) {
  try {
    // 대시보드 생성
    const dashboard = {
      title: `${config.title} - ${environment}`,
      timeRange: config.timeRange,
      panels: config.panels.map(panel => ({
        ...panel,
        config: {
          ...panel.config,
          index_pattern: `gm-tool-logs-${environment}-*`,
        },
      })),
    };

    await kibana.dashboard.create(dashboard);

    await logEvent('info', 'Log dashboard generated', {
      environment,
      dashboardTitle: dashboard.title,
    });
  } catch (error) {
    await logEvent('error', 'Failed to generate log dashboard', { error });
    throw error;
  }
}
```

## 3. 로그 보관 및 정리
### 3.1 로그 보관 관리자
```typescript
// lib/logging/retention-manager.ts
import { CloudWatchLogs } from '@aws-sdk/client-cloudwatch-logs';
import { ElasticsearchClient } from '@elastic/elasticsearch';
import { S3 } from '@aws-sdk/client-s3';
import { logEvent } from './collector';

const cloudwatchLogs = new CloudWatchLogs({ region: process.env.AWS_REGION });
const elasticsearch = new ElasticsearchClient({
  node: process.env.ELASTICSEARCH_URL,
});
const s3 = new S3({ region: process.env.AWS_REGION });

interface RetentionConfig {
  hotStorageDays: number;
  warmStorageDays: number;
  coldStorageDays: number;
  deleteAfterDays: number;
}

export async function manageLogRetention(
  environment: string,
  config: RetentionConfig
) {
  try {
    const now = new Date();

    // 오래된 로그 아카이브
    const archiveDate = new Date(
      now.getTime() - config.warmStorageDays * 24 * 60 * 60 * 1000
    );
    
    // Elasticsearch에서 S3로 로그 아카이브
    const oldLogs = await elasticsearch.search({
      index: `gm-tool-logs-${environment}-*`,
      body: {
        query: {
          range: {
            timestamp: {
              lte: archiveDate.toISOString(),
            },
          },
        },
      },
      scroll: '1m',
    });

    // S3에 로그 저장
    await s3.putObject({
      Bucket: process.env.LOG_ARCHIVE_BUCKET!,
      Key: `${environment}/logs/${archiveDate.toISOString().split('T')[0]}.json`,
      Body: JSON.stringify(oldLogs.hits.hits),
    });

    // 오래된 로그 삭제
    const deleteDate = new Date(
      now.getTime() - config.deleteAfterDays * 24 * 60 * 60 * 1000
    );

    await elasticsearch.deleteByQuery({
      index: `gm-tool-logs-${environment}-*`,
      body: {
        query: {
          range: {
            timestamp: {
              lte: deleteDate.toISOString(),
            },
          },
        },
      },
    });

    await logEvent('info', 'Log retention managed', {
      environment,
      archivedDate: archiveDate,
      deletedDate: deleteDate,
    });
  } catch (error) {
    await logEvent('error', 'Failed to manage log retention', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-020.md: 보안 감사 및 컴플라이언스 고도화 