# Step 7-025: 로깅 시스템 고도화

## 1. 로그 수집 시스템
### 1.1 로그 수집기
```typescript
// lib/logging/collector.ts
import { CloudWatchLogs } from '@aws-sdk/client-cloudwatch-logs';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { logEvent } from '@/lib/logging/collector';

const cloudwatchLogs = new CloudWatchLogs({ region: process.env.AWS_REGION });
const elasticsearch = new ElasticsearchClient({
  node: process.env.ELASTICSEARCH_URL,
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD,
  },
});

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, any>;
}

export async function logEvent(
  level: LogEntry['level'],
  message: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const logEntry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      level,
      message,
      source: process.env.APP_NAME || 'gm-tool',
      traceId: metadata?.traceId,
      spanId: metadata?.spanId,
      metadata,
    };

    // CloudWatch Logs에 로그 전송
    await cloudwatchLogs.putLogEvents({
      logGroupName: `/${process.env.APP_NAME}/${process.env.NODE_ENV}`,
      logStreamName: new Date().toISOString().split('T')[0],
      logEvents: [
        {
          timestamp: logEntry.timestamp.getTime(),
          message: JSON.stringify(logEntry),
        },
      ],
    });

    // Elasticsearch에 로그 전송
    await elasticsearch.index({
      index: `logs-${process.env.APP_NAME}-${process.env.NODE_ENV}-${new Date().toISOString().split('T')[0]}`,
      document: logEntry,
    });
  } catch (error) {
    console.error('Failed to log event:', error);
  }
}
```

### 1.2 로그 분석기
```typescript
// lib/logging/analyzer.ts
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { logEvent } from '@/lib/logging/collector';

const elasticsearch = new ElasticsearchClient({
  node: process.env.ELASTICSEARCH_URL,
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD,
  },
});

interface LogAnalysis {
  id: string;
  timestamp: Date;
  timeRange: {
    start: Date;
    end: Date;
  };
  metrics: {
    totalLogs: number;
    errorRate: number;
    averageResponseTime: number;
    slowestEndpoints: Array<{
      path: string;
      method: string;
      averageResponseTime: number;
      count: number;
    }>;
    mostFrequentErrors: Array<{
      message: string;
      count: number;
    }>;
  };
}

export async function analyzeLogPatterns(
  startTime: Date,
  endTime: Date
): Promise<LogAnalysis> {
  try {
    const analysis: LogAnalysis = {
      id: uuidv4(),
      timestamp: new Date(),
      timeRange: {
        start: startTime,
        end: endTime,
      },
      metrics: {
        totalLogs: 0,
        errorRate: 0,
        averageResponseTime: 0,
        slowestEndpoints: [],
        mostFrequentErrors: [],
      },
    };

    // 전체 로그 수 및 에러율 계산
    const { body: countResponse } = await elasticsearch.search({
      index: `logs-${process.env.APP_NAME}-${process.env.NODE_ENV}-*`,
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
        },
      },
    });

    analysis.metrics.totalLogs = countResponse.hits.total.value;
    analysis.metrics.errorRate =
      (countResponse.aggregations.error_count.doc_count / analysis.metrics.totalLogs) * 100;

    // 가장 느린 엔드포인트 분석
    const { body: slowEndpointsResponse } = await elasticsearch.search({
      index: `logs-${process.env.APP_NAME}-${process.env.NODE_ENV}-*`,
      body: {
        size: 0,
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
                exists: {
                  field: 'metadata.responseTime',
                },
              },
            ],
          },
        },
        aggs: {
          endpoints: {
            terms: {
              script: "doc['metadata.path'].value + ' ' + doc['metadata.method'].value",
              size: 10,
            },
            aggs: {
              avg_response_time: {
                avg: {
                  field: 'metadata.responseTime',
                },
              },
            },
          },
        },
      },
    });

    analysis.metrics.slowestEndpoints = slowEndpointsResponse.aggregations.endpoints.buckets.map(
      bucket => {
        const [path, method] = bucket.key.split(' ');
        return {
          path,
          method,
          averageResponseTime: bucket.avg_response_time.value,
          count: bucket.doc_count,
        };
      }
    );

    // 가장 빈번한 에러 분석
    const { body: frequentErrorsResponse } = await elasticsearch.search({
      index: `logs-${process.env.APP_NAME}-${process.env.NODE_ENV}-*`,
      body: {
        size: 0,
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
                term: {
                  level: 'error',
                },
              },
            ],
          },
        },
        aggs: {
          error_messages: {
            terms: {
              field: 'message.keyword',
              size: 10,
            },
          },
        },
      },
    });

    analysis.metrics.mostFrequentErrors = frequentErrorsResponse.aggregations.error_messages.buckets.map(
      bucket => ({
        message: bucket.key,
        count: bucket.doc_count,
      })
    );

    await logEvent('info', 'Log analysis completed', { analysis });

    return analysis;
  } catch (error) {
    await logEvent('error', 'Failed to analyze log patterns', { error });
    throw error;
  }
}
```

## 2. 로그 보관 시스템
### 2.1 로그 보관 관리자
```typescript
// lib/logging/retention-manager.ts
import { S3 } from '@aws-sdk/client-s3';
import { CloudWatchLogs } from '@aws-sdk/client-cloudwatch-logs';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { logEvent } from '@/lib/logging/collector';

const s3 = new S3({ region: process.env.AWS_REGION });
const cloudwatchLogs = new CloudWatchLogs({ region: process.env.AWS_REGION });
const elasticsearch = new ElasticsearchClient({
  node: process.env.ELASTICSEARCH_URL,
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD,
  },
});

interface RetentionConfig {
  hotStorageDays: number;
  warmStorageDays: number;
  coldStorageDays: number;
  deleteAfterDays: number;
}

export async function manageLogRetention(config: RetentionConfig): Promise<void> {
  try {
    const now = new Date();

    // 오래된 로그 S3로 아카이브
    const oldIndices = await elasticsearch.cat.indices({
      format: 'json',
      index: `logs-${process.env.APP_NAME}-${process.env.NODE_ENV}-*`,
    });

    for (const index of oldIndices) {
      const indexDate = new Date(index.index.split('-').pop());
      const ageInDays = (now.getTime() - indexDate.getTime()) / (1000 * 60 * 60 * 24);

      if (ageInDays > config.hotStorageDays) {
        // S3로 아카이브
        const { body: logs } = await elasticsearch.search({
          index: index.index,
          body: {
            query: {
              match_all: {},
            },
            size: 10000,
          },
        });

        await s3.putObject({
          Bucket: process.env.LOG_ARCHIVE_BUCKET!,
          Key: `${index.index}.json`,
          Body: JSON.stringify(logs),
        });

        // 인덱스 삭제
        if (ageInDays > config.deleteAfterDays) {
          await elasticsearch.indices.delete({
            index: index.index,
          });
        }
      }
    }

    // CloudWatch Logs 보관 정책 업데이트
    await cloudwatchLogs.putRetentionPolicy({
      logGroupName: `/${process.env.APP_NAME}/${process.env.NODE_ENV}`,
      retentionInDays: config.deleteAfterDays,
    });

    await logEvent('info', 'Log retention management completed', { config });
  } catch (error) {
    await logEvent('error', 'Failed to manage log retention', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-026.md: 보안 시스템 고도화 