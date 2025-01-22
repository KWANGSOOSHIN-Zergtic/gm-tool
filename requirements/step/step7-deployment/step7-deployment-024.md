# Step 7-024: 모니터링 및 알림 고도화

## 1. 통합 모니터링 시스템
### 1.1 메트릭 수집기
```typescript
// lib/monitoring/metric-collector.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { Datadog } from '@datadog/datadog-api-client';
import { logEvent } from '@/lib/logging/collector';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });
const datadog = new Datadog({
  apiKey: process.env.DATADOG_API_KEY,
  appKey: process.env.DATADOG_APP_KEY,
});

interface MetricData {
  id: string;
  timestamp: Date;
  source: 'cloudwatch' | 'datadog';
  namespace: string;
  name: string;
  value: number;
  unit: string;
  dimensions: Record<string, string>;
}

export async function collectMetrics(
  namespace: string,
  metricNames: string[],
  dimensions: Record<string, string>
): Promise<MetricData[]> {
  try {
    const metrics: MetricData[] = [];

    // CloudWatch 메트릭 수집
    const cwMetrics = await cloudwatch.getMetricData({
      MetricDataQueries: metricNames.map((name, index) => ({
        Id: `m${index}`,
        MetricStat: {
          Metric: {
            Namespace: namespace,
            MetricName: name,
            Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({
              Name,
              Value,
            })),
          },
          Period: 300,
          Stat: 'Average',
        },
      })),
      StartTime: new Date(Date.now() - 5 * 60 * 1000),
      EndTime: new Date(),
    });

    cwMetrics.MetricDataResults!.forEach((result, index) => {
      if (result.Values && result.Values.length > 0) {
        metrics.push({
          id: uuidv4(),
          timestamp: new Date(),
          source: 'cloudwatch',
          namespace,
          name: metricNames[index],
          value: result.Values[0],
          unit: 'Count',
          dimensions,
        });
      }
    });

    // Datadog 메트릭 수집
    const ddMetrics = await datadog.metrics.queryMetrics({
      from: Math.floor((Date.now() - 5 * 60 * 1000) / 1000),
      to: Math.floor(Date.now() / 1000),
      query: metricNames.map(name => `avg:${namespace}.${name}{${Object.entries(dimensions)
        .map(([key, value]) => `${key}:${value}`)
        .join(',')}}`).join(','),
    });

    ddMetrics.series.forEach(series => {
      if (series.pointlist && series.pointlist.length > 0) {
        metrics.push({
          id: uuidv4(),
          timestamp: new Date(series.pointlist[0][0]),
          source: 'datadog',
          namespace,
          name: series.metric,
          value: series.pointlist[0][1],
          unit: 'Count',
          dimensions,
        });
      }
    });

    await logEvent('info', 'Metrics collected', {
      namespace,
      metricNames,
      dimensions,
      count: metrics.length,
    });

    return metrics;
  } catch (error) {
    await logEvent('error', 'Failed to collect metrics', { error });
    throw error;
  }
}
```

### 1.2 대시보드 생성기
```typescript
// lib/monitoring/dashboard-generator.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { Datadog } from '@datadog/datadog-api-client';
import { logEvent } from '@/lib/logging/collector';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });
const datadog = new Datadog({
  apiKey: process.env.DATADOG_API_KEY,
  appKey: process.env.DATADOG_APP_KEY,
});

interface DashboardConfig {
  id: string;
  title: string;
  description: string;
  widgets: Array<{
    type: 'metric' | 'log' | 'text';
    title: string;
    width: number;
    height: number;
    x: number;
    y: number;
    properties: Record<string, any>;
  }>;
}

export async function createDashboard(config: DashboardConfig): Promise<void> {
  try {
    // CloudWatch 대시보드 생성
    await cloudwatch.putDashboard({
      DashboardName: config.id,
      DashboardBody: JSON.stringify({
        widgets: config.widgets.map(widget => ({
          type: widget.type,
          x: widget.x,
          y: widget.y,
          width: widget.width,
          height: widget.height,
          properties: {
            title: widget.title,
            ...widget.properties,
          },
        })),
      }),
    });

    // Datadog 대시보드 생성
    await datadog.dashboards.createDashboard({
      title: config.title,
      description: config.description,
      widgets: config.widgets.map(widget => ({
        definition: {
          type: widget.type,
          title: widget.title,
          ...widget.properties,
        },
        layout: {
          x: widget.x,
          y: widget.y,
          width: widget.width,
          height: widget.height,
        },
      })),
    });

    await logEvent('info', 'Dashboard created', { config });
  } catch (error) {
    await logEvent('error', 'Failed to create dashboard', { error });
    throw error;
  }
}
```

## 2. 알림 시스템
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
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metadata?: Record<string, any>;
  channels: Array<{
    type: 'slack' | 'email' | 'sns';
    target: string;
  }>;
}

export async function sendAlert(alert: Alert): Promise<void> {
  try {
    for (const channel of alert.channels) {
      switch (channel.type) {
        case 'slack':
          await slack.chat.postMessage({
            channel: channel.target,
            text: `[${alert.severity.toUpperCase()}] ${alert.title}\n${alert.message}`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*[${alert.severity.toUpperCase()}] ${alert.title}*\n${alert.message}`,
                },
              },
              {
                type: 'divider',
              },
              {
                type: 'section',
                fields: Object.entries(alert.metadata || {}).map(([key, value]) => ({
                  type: 'mrkdwn',
                  text: `*${key}:*\n${JSON.stringify(value)}`,
                })),
              },
            ],
          });
          break;

        case 'email':
          await ses.sendEmail({
            Source: process.env.ALERT_EMAIL_FROM,
            Destination: {
              ToAddresses: [channel.target],
            },
            Message: {
              Subject: {
                Data: `[${alert.severity.toUpperCase()}] ${alert.title}`,
              },
              Body: {
                Text: {
                  Data: `${alert.message}\n\nMetadata:\n${JSON.stringify(
                    alert.metadata,
                    null,
                    2
                  )}`,
                },
              },
            },
          });
          break;

        case 'sns':
          await sns.publish({
            TopicArn: channel.target,
            Message: JSON.stringify({
              type: alert.type,
              title: alert.title,
              message: alert.message,
              severity: alert.severity,
              metadata: alert.metadata,
            }),
            MessageAttributes: {
              type: {
                DataType: 'String',
                StringValue: alert.type,
              },
              severity: {
                DataType: 'String',
                StringValue: alert.severity,
              },
            },
          });
          break;
      }
    }

    await logEvent('info', 'Alert sent', { alert });
  } catch (error) {
    await logEvent('error', 'Failed to send alert', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-025.md: 로깅 시스템 고도화 