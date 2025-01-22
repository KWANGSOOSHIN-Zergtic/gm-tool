# Step 7-018: 모니터링 및 알림 고도화

## 1. 통합 모니터링 시스템
### 1.1 메트릭 통합 수집기
```typescript
// lib/monitoring/unified-collector.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { Datadog } from '@aws-sdk/client-datadog';
import { logEvent } from '@/lib/logging/collector';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });
const datadog = new Datadog({ region: process.env.AWS_REGION });

interface UnifiedMetrics {
  infrastructure: {
    cpu: {
      usage: number;
      load: number;
    };
    memory: {
      used: number;
      available: number;
    };
    disk: {
      usage: number;
      iops: number;
    };
    network: {
      inbound: number;
      outbound: number;
      latency: number;
    };
  };
  application: {
    requests: {
      total: number;
      success: number;
      failed: number;
      latency: {
        p50: number;
        p90: number;
        p99: number;
      };
    };
    database: {
      connections: number;
      queryTime: number;
      errors: number;
    };
    cache: {
      hits: number;
      misses: number;
      latency: number;
    };
  };
  business: {
    activeUsers: number;
    transactions: number;
    errors: number;
  };
}

export async function collectUnifiedMetrics(
  environment: string,
  startTime: Date,
  endTime: Date
): Promise<UnifiedMetrics> {
  try {
    // CloudWatch 메트릭 수집
    const cwMetrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        // 인프라 메트릭
        {
          Id: 'cpu_usage',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ECS',
              MetricName: 'CPUUtilization',
              Dimensions: [
                {
                  Name: 'ClusterName',
                  Value: `gm-tool-${environment}`,
                },
              ],
            },
            Period: 300,
            Stat: 'Average',
          },
        },
        // 기타 메트릭...
      ],
      StartTime: startTime,
      EndTime: endTime,
    });

    // Datadog 메트릭 수집
    const ddMetrics = await datadog.queryMetrics({
      query: `avg:system.cpu.user{env:${environment}}`,
      from: Math.floor(startTime.getTime() / 1000),
      to: Math.floor(endTime.getTime() / 1000),
    });

    // 메트릭 통합
    const metrics: UnifiedMetrics = {
      infrastructure: {
        cpu: {
          usage: cwMetrics.MetricDataResults![0].Values![0] || 0,
          load: cwMetrics.MetricDataResults![1].Values![0] || 0,
        },
        memory: {
          used: cwMetrics.MetricDataResults![2].Values![0] || 0,
          available: cwMetrics.MetricDataResults![3].Values![0] || 0,
        },
        disk: {
          usage: cwMetrics.MetricDataResults![4].Values![0] || 0,
          iops: cwMetrics.MetricDataResults![5].Values![0] || 0,
        },
        network: {
          inbound: cwMetrics.MetricDataResults![6].Values![0] || 0,
          outbound: cwMetrics.MetricDataResults![7].Values![0] || 0,
          latency: cwMetrics.MetricDataResults![8].Values![0] || 0,
        },
      },
      application: {
        requests: {
          total: ddMetrics.series[0].pointlist[0][1] || 0,
          success: ddMetrics.series[1].pointlist[0][1] || 0,
          failed: ddMetrics.series[2].pointlist[0][1] || 0,
          latency: {
            p50: ddMetrics.series[3].pointlist[0][1] || 0,
            p90: ddMetrics.series[4].pointlist[0][1] || 0,
            p99: ddMetrics.series[5].pointlist[0][1] || 0,
          },
        },
        database: {
          connections: ddMetrics.series[6].pointlist[0][1] || 0,
          queryTime: ddMetrics.series[7].pointlist[0][1] || 0,
          errors: ddMetrics.series[8].pointlist[0][1] || 0,
        },
        cache: {
          hits: ddMetrics.series[9].pointlist[0][1] || 0,
          misses: ddMetrics.series[10].pointlist[0][1] || 0,
          latency: ddMetrics.series[11].pointlist[0][1] || 0,
        },
      },
      business: {
        activeUsers: ddMetrics.series[12].pointlist[0][1] || 0,
        transactions: ddMetrics.series[13].pointlist[0][1] || 0,
        errors: ddMetrics.series[14].pointlist[0][1] || 0,
      },
    };

    await logEvent('info', 'Unified metrics collected', {
      environment,
      metrics,
    });

    return metrics;
  } catch (error) {
    await logEvent('error', 'Failed to collect unified metrics', { error });
    throw error;
  }
}
```

### 1.2 통합 대시보드 생성기
```typescript
// lib/monitoring/dashboard-generator.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/collector';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface DashboardConfig {
  name: string;
  widgets: Array<{
    type: 'metric' | 'text' | 'alarm';
    width: number;
    height: number;
    properties: Record<string, any>;
  }>;
}

export async function generateUnifiedDashboard(
  environment: string,
  config: DashboardConfig
) {
  try {
    const dashboard = {
      widgets: config.widgets.map((widget, index) => ({
        type: widget.type,
        width: widget.width,
        height: widget.height,
        x: (index * widget.width) % 24,
        y: Math.floor((index * widget.width) / 24) * widget.height,
        properties: {
          ...widget.properties,
          region: process.env.AWS_REGION,
          title: `${widget.properties.title} (${environment})`,
        },
      })),
    };

    await cloudwatch.putDashboard({
      DashboardName: `${config.name}-${environment}`,
      DashboardBody: JSON.stringify(dashboard),
    });

    await logEvent('info', 'Unified dashboard generated', {
      environment,
      dashboardName: `${config.name}-${environment}`,
      widgetCount: config.widgets.length,
    });
  } catch (error) {
    await logEvent('error', 'Failed to generate unified dashboard', { error });
    throw error;
  }
}
```

## 2. 알림 시스템 고도화
### 2.1 알림 라우터
```typescript
// lib/monitoring/alert-router.ts
import { SNS } from '@aws-sdk/client-sns';
import { SES } from '@aws-sdk/client-ses';
import { WebClient } from '@slack/web-api';
import { logEvent } from '@/lib/logging/collector';

const sns = new SNS({ region: process.env.AWS_REGION });
const ses = new SES({ region: process.env.AWS_REGION });
const slack = new WebClient(process.env.SLACK_TOKEN);

interface Alert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  title: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  routing?: {
    slack?: {
      channel: string;
      mentions?: string[];
    };
    email?: {
      recipients: string[];
      cc?: string[];
    };
    sns?: {
      topicArn: string;
    };
  };
}

export async function routeAlert(alert: Alert) {
  try {
    const promises = [];

    // Slack 알림
    if (alert.routing?.slack) {
      const mentions = alert.routing.slack.mentions
        ? alert.routing.slack.mentions.join(' ')
        : '';
      
      promises.push(
        slack.chat.postMessage({
          channel: alert.routing.slack.channel,
          text: `${mentions}\n*[${alert.type.toUpperCase()}] ${alert.title}*\n${alert.message}`,
          attachments: [
            {
              color: getAlertColor(alert.type),
              fields: formatMetadataFields(alert.metadata),
              footer: `Source: ${alert.source} | ID: ${alert.id}`,
              ts: Math.floor(alert.timestamp.getTime() / 1000),
            },
          ],
        })
      );
    }

    // 이메일 알림
    if (alert.routing?.email) {
      promises.push(
        ses.sendEmail({
          Source: process.env.ALERT_EMAIL_FROM!,
          Destination: {
            ToAddresses: alert.routing.email.recipients,
            CcAddresses: alert.routing.email.cc,
          },
          Message: {
            Subject: {
              Data: `[${alert.type.toUpperCase()}] ${alert.title}`,
            },
            Body: {
              Html: {
                Data: formatEmailBody(alert),
              },
            },
          },
        })
      );
    }

    // SNS 알림
    if (alert.routing?.sns) {
      promises.push(
        sns.publish({
          TopicArn: alert.routing.sns.topicArn,
          Message: JSON.stringify(alert),
          MessageAttributes: {
            AlertType: {
              DataType: 'String',
              StringValue: alert.type,
            },
            Source: {
              DataType: 'String',
              StringValue: alert.source,
            },
          },
        })
      );
    }

    await Promise.all(promises);

    await logEvent('info', 'Alert routed', {
      alertId: alert.id,
      type: alert.type,
      channels: Object.keys(alert.routing || {}),
    });
  } catch (error) {
    await logEvent('error', 'Failed to route alert', { error, alert });
    throw error;
  }
}
```

### 2.2 알림 집계기
```typescript
// lib/monitoring/alert-aggregator.ts
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { logEvent } from '@/lib/logging/collector';

const dynamodb = new DynamoDB({ region: process.env.AWS_REGION });

interface AlertGroup {
  id: string;
  type: string;
  source: string;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  status: 'active' | 'resolved';
  alerts: string[];
}

export async function aggregateAlerts(
  environment: string,
  timeWindow: number
) {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - timeWindow);

    // 활성 알림 그룹 조회
    const activeGroups = await dynamodb.query({
      TableName: `gm-tool-${environment}-alert-groups`,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': { S: 'active' },
      },
    });

    // 알림 그룹 업데이트
    for (const group of activeGroups.Items!) {
      const alerts = await dynamodb.query({
        TableName: `gm-tool-${environment}-alerts`,
        KeyConditionExpression: 'groupId = :groupId',
        ExpressionAttributeValues: {
          ':groupId': { S: group.id.S! },
        },
      });

      // 시간 창 내의 알림 수 확인
      const recentAlerts = alerts.Items!.filter(
        alert => new Date(alert.timestamp.S!).getTime() > windowStart.getTime()
      );

      if (recentAlerts.length === 0) {
        // 그룹 해결됨으로 표시
        await dynamodb.updateItem({
          TableName: `gm-tool-${environment}-alert-groups`,
          Key: { id: { S: group.id.S! } },
          UpdateExpression: 'SET #status = :status',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':status': { S: 'resolved' },
          },
        });
      }
    }

    await logEvent('info', 'Alerts aggregated', {
      environment,
      timeWindow,
      groupCount: activeGroups.Items!.length,
    });
  } catch (error) {
    await logEvent('error', 'Failed to aggregate alerts', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-019.md: 로깅 시스템 고도화 