# Step 7-030: 모니터링 및 알림 시스템 고도화

## 1. 통합 모니터링 시스템
### 1.1 메트릭 수집기
```typescript
// lib/monitoring/collector.ts
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
  metadata?: Record<string, any>;
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

### 1.2 메트릭 분석기
```typescript
// lib/monitoring/analyzer.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface MetricAnalysis {
  id: string;
  timestamp: Date;
  metrics: MetricData[];
  anomalies: Array<{
    metric: MetricData;
    type: 'threshold' | 'deviation' | 'trend';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    value: number;
    threshold?: number;
    baseline?: number;
  }>;
}

export async function analyzeMetrics(metrics: MetricData[]): Promise<MetricAnalysis> {
  try {
    const analysis: MetricAnalysis = {
      id: uuidv4(),
      timestamp: new Date(),
      metrics,
      anomalies: [],
    };

    for (const metric of metrics) {
      // 임계값 기반 분석
      const thresholds = await getMetricThresholds(metric.namespace, metric.name);
      if (thresholds && metric.value > thresholds.critical) {
        analysis.anomalies.push({
          metric,
          type: 'threshold',
          severity: 'critical',
          description: `${metric.name} 지표가 임계값을 초과했습니다.`,
          value: metric.value,
          threshold: thresholds.critical,
        });
      } else if (thresholds && metric.value > thresholds.warning) {
        analysis.anomalies.push({
          metric,
          type: 'threshold',
          severity: 'high',
          description: `${metric.name} 지표가 경고 수준을 초과했습니다.`,
          value: metric.value,
          threshold: thresholds.warning,
        });
      }

      // 편차 기반 분석
      const baseline = await getMetricBaseline(metric.namespace, metric.name);
      if (baseline) {
        const deviation = Math.abs(metric.value - baseline.average) / baseline.stddev;
        if (deviation > 3) {
          analysis.anomalies.push({
            metric,
            type: 'deviation',
            severity: 'high',
            description: `${metric.name} 지표가 정상 범위를 벗어났습니다.`,
            value: metric.value,
            baseline: baseline.average,
          });
        }
      }
    }

    // 심각한 이상 감지 시 알림 전송
    const criticalAnomalies = analysis.anomalies.filter(
      anomaly => anomaly.severity === 'critical'
    );

    if (criticalAnomalies.length > 0) {
      await sendAlert({
        type: 'metric_anomaly',
        title: '심각한 지표 이상 감지',
        message: `${criticalAnomalies.length}개의 심각한 지표 이상이 감지되었습니다.`,
        severity: 'critical',
        metadata: { analysis },
        channels: [
          {
            type: 'slack',
            target: process.env.MONITORING_ALERT_SLACK_CHANNEL!,
          },
          {
            type: 'email',
            target: process.env.MONITORING_ALERT_EMAIL!,
          },
        ],
      });
    }

    await logEvent('info', 'Metrics analysis completed', { analysis });

    return analysis;
  } catch (error) {
    await logEvent('error', 'Failed to analyze metrics', { error });
    throw error;
  }
}

async function getMetricThresholds(
  namespace: string,
  metricName: string
): Promise<{ warning: number; critical: number } | null> {
  // 지표별 임계값 설정을 조회하는 로직 구현
  return {
    warning: 80,
    critical: 90,
  };
}

async function getMetricBaseline(
  namespace: string,
  metricName: string
): Promise<{ average: number; stddev: number } | null> {
  // 지표의 기준선을 계산하는 로직 구현
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const data = await cloudwatch.getMetricStatistics({
    Namespace: namespace,
    MetricName: metricName,
    StartTime: twoWeeksAgo,
    EndTime: now,
    Period: 3600,
    Statistics: ['Average', 'StandardDeviation'],
  });

  if (data.Datapoints && data.Datapoints.length > 0) {
    const lastPoint = data.Datapoints[data.Datapoints.length - 1];
    return {
      average: lastPoint.Average!,
      stddev: lastPoint.StandardDeviation!,
    };
  }

  return null;
}
```

## 2. 알림 관리 시스템
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
- step7-deployment-031.md: 로깅 시스템 고도화 