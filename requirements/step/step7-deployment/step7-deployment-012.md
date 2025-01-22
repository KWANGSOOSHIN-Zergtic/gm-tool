# Step 7-012: 로깅 및 모니터링 고도화

## 1. 로깅 시스템
### 1.1 로그 수집기
```typescript
// lib/logging/collector.ts
import { createLogger, format, transports } from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';
import { Client } from '@elastic/elasticsearch';

const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL,
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME!,
    password: process.env.ELASTICSEARCH_PASSWORD!,
  },
});

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  service: string;
  environment: string;
  correlationId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: {
    service: 'gm-tool',
    environment: process.env.NODE_ENV,
  },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      ),
    }),
    new ElasticsearchTransport({
      client: esClient,
      index: 'logs-gm-tool',
      indexPrefix: 'logs-gm-tool',
      indexSuffixPattern: 'YYYY.MM.DD',
      level: 'info',
    }),
  ],
});

export async function logEvent(
  level: string,
  message: string,
  metadata?: Record<string, any>
) {
  const logEntry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: 'gm-tool',
    environment: process.env.NODE_ENV!,
    correlationId: getCorrelationId(),
    userId: getCurrentUserId(),
    metadata,
  };

  logger.log(level, message, logEntry);
}
```

### 1.2 로그 분석기
```typescript
// lib/logging/analyzer.ts
import { Client } from '@elastic/elasticsearch';
import { logEvent } from './collector';

interface LogAnalysis {
  errorRate: number;
  topErrors: Array<{
    message: string;
    count: number;
  }>;
  slowRequests: Array<{
    path: string;
    method: string;
    avgDuration: number;
  }>;
  userActivity: Array<{
    userId: string;
    requestCount: number;
  }>;
}

export async function analyzeLogPatterns(
  startTime: Date,
  endTime: Date
): Promise<LogAnalysis> {
  try {
    const client = new Client({
      node: process.env.ELASTICSEARCH_URL,
    });

    // 에러율 분석
    const errorResponse = await client.search({
      index: 'logs-gm-tool-*',
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
                term: {
                  level: 'error',
                },
              },
            ],
          },
        },
        aggs: {
          error_count: {
            value_count: {
              field: 'message.keyword',
            },
          },
        },
      },
    });

    // 상위 에러 분석
    const topErrorsResponse = await client.search({
      index: 'logs-gm-tool-*',
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
          top_errors: {
            terms: {
              field: 'message.keyword',
              size: 10,
            },
          },
        },
      },
    });

    const analysis: LogAnalysis = {
      errorRate: calculateErrorRate(errorResponse),
      topErrors: extractTopErrors(topErrorsResponse),
      slowRequests: await analyzeSslowRequests(client, startTime, endTime),
      userActivity: await analyzeUserActivity(client, startTime, endTime),
    };

    logEvent('info', 'Log analysis completed', analysis);

    return analysis;
  } catch (error) {
    logEvent('error', 'Failed to analyze logs', { error });
    throw error;
  }
}
```

## 2. 모니터링 시스템
### 2.1 메트릭 수집기
```typescript
// lib/monitoring/collector.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/collector';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface SystemMetrics {
  cpu: {
    usage: number;
    load: number;
  };
  memory: {
    used: number;
    free: number;
    cached: number;
  };
  disk: {
    used: number;
    free: number;
    iops: number;
  };
  network: {
    inbound: number;
    outbound: number;
    latency: number;
  };
}

export async function collectSystemMetrics(): Promise<SystemMetrics> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 300000); // 5분

    const metrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        {
          Id: 'cpu_usage',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ECS',
              MetricName: 'CPUUtilization',
              Dimensions: [
                {
                  Name: 'ServiceName',
                  Value: process.env.ECS_SERVICE_NAME!,
                },
              ],
            },
            Period: 300,
            Stat: 'Average',
          },
        },
        // 기타 메트릭 쿼리...
      ],
      StartTime: startTime,
      EndTime: endTime,
    });

    const systemMetrics: SystemMetrics = {
      cpu: {
        usage: metrics.MetricDataResults![0].Values![0] || 0,
        load: metrics.MetricDataResults![1].Values![0] || 0,
      },
      memory: {
        used: metrics.MetricDataResults![2].Values![0] || 0,
        free: metrics.MetricDataResults![3].Values![0] || 0,
        cached: metrics.MetricDataResults![4].Values![0] || 0,
      },
      disk: {
        used: metrics.MetricDataResults![5].Values![0] || 0,
        free: metrics.MetricDataResults![6].Values![0] || 0,
        iops: metrics.MetricDataResults![7].Values![0] || 0,
      },
      network: {
        inbound: metrics.MetricDataResults![8].Values![0] || 0,
        outbound: metrics.MetricDataResults![9].Values![0] || 0,
        latency: metrics.MetricDataResults![10].Values![0] || 0,
      },
    };

    logEvent('info', 'System metrics collected', systemMetrics);

    return systemMetrics;
  } catch (error) {
    logEvent('error', 'Failed to collect system metrics', { error });
    throw error;
  }
}
```

### 2.2 대시보드 생성기
```typescript
// lib/monitoring/dashboard.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/collector';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface DashboardConfig {
  name: string;
  widgets: Array<{
    type: 'metric' | 'text' | 'alarm';
    properties: Record<string, any>;
  }>;
}

export async function createMonitoringDashboard(config: DashboardConfig) {
  try {
    const dashboard = {
      widgets: config.widgets.map(widget => ({
        type: widget.type,
        x: 0,
        y: 0,
        width: 12,
        height: 6,
        properties: {
          view: 'timeSeries',
          stacked: false,
          region: process.env.AWS_REGION,
          ...widget.properties,
        },
      })),
    };

    await cloudwatch.putDashboard({
      DashboardName: config.name,
      DashboardBody: JSON.stringify(dashboard),
    });

    logEvent('info', 'Monitoring dashboard created', {
      name: config.name,
      widgetCount: config.widgets.length,
    });
  } catch (error) {
    logEvent('error', 'Failed to create monitoring dashboard', { error });
    throw error;
  }
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  name: 'gm-tool-overview',
  widgets: [
    {
      type: 'metric',
      properties: {
        title: 'CPU Utilization',
        metrics: [
          ['AWS/ECS', 'CPUUtilization', 'ServiceName', process.env.ECS_SERVICE_NAME],
        ],
        period: 300,
      },
    },
    {
      type: 'metric',
      properties: {
        title: 'Memory Utilization',
        metrics: [
          ['AWS/ECS', 'MemoryUtilization', 'ServiceName', process.env.ECS_SERVICE_NAME],
        ],
        period: 300,
      },
    },
    {
      type: 'metric',
      properties: {
        title: 'API Response Time',
        metrics: [
          ['GMTool/API', 'ResponseTime', 'Environment', process.env.NODE_ENV],
        ],
        period: 60,
      },
    },
    {
      type: 'metric',
      properties: {
        title: 'Error Rate',
        metrics: [
          ['GMTool/API', 'ErrorRate', 'Environment', process.env.NODE_ENV],
        ],
        period: 300,
      },
    },
  ],
};
```

## 3. 알림 시스템
### 3.1 알림 관리자
```typescript
// lib/monitoring/notifications.ts
import { SNS } from '@aws-sdk/client-sns';
import { WebClient } from '@slack/web-api';
import { logEvent } from '@/lib/logging/collector';

const sns = new SNS({ region: process.env.AWS_REGION });
const slack = new WebClient(process.env.SLACK_TOKEN);

interface AlertConfig {
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  metadata?: Record<string, any>;
  channels: {
    slack?: boolean;
    email?: boolean;
    sns?: boolean;
  };
}

export async function sendAlert(config: AlertConfig) {
  try {
    const promises = [];

    if (config.channels.slack) {
      promises.push(
        slack.chat.postMessage({
          channel: process.env.SLACK_CHANNEL!,
          text: formatSlackMessage(config),
          attachments: [
            {
              color: getAlertColor(config.type),
              fields: formatMetadataFields(config.metadata),
            },
          ],
        })
      );
    }

    if (config.channels.email) {
      promises.push(
        sendEmailAlert({
          subject: `[${config.type.toUpperCase()}] ${config.title}`,
          body: formatEmailBody(config),
          recipients: process.env.ALERT_EMAIL_RECIPIENTS!.split(','),
        })
      );
    }

    if (config.channels.sns) {
      promises.push(
        sns.publish({
          TopicArn: process.env.SNS_TOPIC_ARN,
          Message: JSON.stringify(config),
          MessageAttributes: {
            AlertType: {
              DataType: 'String',
              StringValue: config.type,
            },
          },
        })
      );
    }

    await Promise.all(promises);

    logEvent('info', 'Alert sent', config);
  } catch (error) {
    logEvent('error', 'Failed to send alert', { error, config });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-013.md: 보안 감사 및 컴플라이언스 고도화 