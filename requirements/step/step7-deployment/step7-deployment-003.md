# Step 7-003: 배포 모니터링 및 알림 구성

## 1. 모니터링 대시보드
### 1.1 Datadog 대시보드 설정
```typescript
// lib/monitoring/dashboard.ts
import { datadogRum } from '@datadog/browser-rum';
import { datadogLogs } from '@datadog/browser-logs';

interface MetricData {
  name: string;
  value: number;
  tags?: string[];
}

export function sendMetric({ name, value, tags = [] }: MetricData) {
  if (process.env.NODE_ENV === 'production') {
    datadogRum.addRumEvent('metric', {
      name,
      value,
      tags: [...tags, `env:${process.env.NODE_ENV}`],
    });
  }
}

export function setupDashboardMetrics() {
  // 성능 메트릭
  datadogRum.onLoad(() => {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        sendMetric({
          name: 'performance.metric',
          value: entry.startTime,
          tags: [`metric_name:${entry.name}`],
        });
      }
    }).observe({ entryTypes: ['largest-contentful-paint', 'first-input'] });
  });

  // 에러 모니터링
  window.addEventListener('error', (event) => {
    datadogLogs.logger.error('Client error', {
      error: {
        message: event.message,
        stack: event.error?.stack,
      },
    });
  });
}
```

### 1.2 CloudWatch 메트릭 설정
```typescript
// lib/monitoring/cloudwatch.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatch({
  region: process.env.AWS_REGION,
});

interface CloudWatchMetric {
  namespace: string;
  metricName: string;
  value: number;
  dimensions?: { Name: string; Value: string }[];
}

export async function putMetric({
  namespace,
  metricName,
  value,
  dimensions = [],
}: CloudWatchMetric) {
  try {
    await cloudwatch.putMetricData({
      Namespace: namespace,
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Dimensions: dimensions,
          Timestamp: new Date(),
          Unit: 'Count',
        },
      ],
    });
  } catch (error) {
    console.error('Failed to put CloudWatch metric:', error);
  }
}
```

## 2. 알림 설정
### 2.1 Slack 알림 통합
```typescript
// lib/monitoring/notifications/slack.ts
import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_TOKEN);

interface AlertConfig {
  channel: string;
  username: string;
  icon_emoji: string;
}

const ALERT_CONFIGS: Record<string, AlertConfig> = {
  deployment: {
    channel: '#deployments',
    username: 'Deployment Bot',
    icon_emoji: ':rocket:',
  },
  error: {
    channel: '#alerts',
    username: 'Error Bot',
    icon_emoji: ':warning:',
  },
  performance: {
    channel: '#performance',
    username: 'Performance Bot',
    icon_emoji: ':chart_with_upwards_trend:',
  },
};

export async function sendSlackAlert(
  type: keyof typeof ALERT_CONFIGS,
  message: string,
  attachments: any[] = []
) {
  const config = ALERT_CONFIGS[type];
  
  try {
    await slack.chat.postMessage({
      channel: config.channel,
      text: message,
      username: config.username,
      icon_emoji: config.icon_emoji,
      attachments,
    });
  } catch (error) {
    console.error('Failed to send Slack alert:', error);
  }
}
```

### 2.2 이메일 알림 설정
```typescript
// lib/monitoring/notifications/email.ts
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({
  region: process.env.AWS_REGION,
});

interface EmailAlert {
  subject: string;
  body: string;
  recipients: string[];
  isHtml?: boolean;
}

export async function sendEmailAlert({
  subject,
  body,
  recipients,
  isHtml = false,
}: EmailAlert) {
  try {
    const command = new SendEmailCommand({
      Destination: {
        ToAddresses: recipients,
      },
      Message: {
        Body: {
          [isHtml ? 'Html' : 'Text']: {
            Data: body,
            Charset: 'UTF-8',
          },
        },
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
      },
      Source: process.env.ALERT_EMAIL_FROM,
    });

    await ses.send(command);
  } catch (error) {
    console.error('Failed to send email alert:', error);
  }
}
```

## 3. 모니터링 API
### 3.1 상태 모니터링 API
```typescript
// app/api/monitoring/status/route.ts
import { NextResponse } from 'next/server';
import { performHealthCheck } from '@/lib/monitoring/health';
import { putMetric } from '@/lib/monitoring/cloudwatch';
import { sendSlackAlert } from '@/lib/monitoring/notifications/slack';

export async function GET() {
  const healthCheck = await performHealthCheck();
  
  // CloudWatch 메트릭 전송
  await putMetric({
    namespace: 'GMTool/Status',
    metricName: 'HealthStatus',
    value: healthCheck.status === 'healthy' ? 1 : 0,
    dimensions: [
      { Name: 'Environment', Value: process.env.NODE_ENV! },
    ],
  });

  // 상태가 unhealthy인 경우 알림 전송
  if (healthCheck.status === 'unhealthy') {
    const failedChecks = Object.entries(healthCheck.checks)
      .filter(([, status]) => !status)
      .map(([name]) => name)
      .join(', ');

    await sendSlackAlert(
      'error',
      `❌ Health check failed for: ${failedChecks}`,
      [{
        color: 'danger',
        fields: Object.entries(healthCheck.checks).map(([name, status]) => ({
          title: name,
          value: status ? '✅ Healthy' : '❌ Unhealthy',
          short: true,
        })),
      }]
    );
  }

  return NextResponse.json(healthCheck);
}
```

### 3.2 성능 모니터링 API
```typescript
// app/api/monitoring/performance/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { putMetric } from '@/lib/monitoring/cloudwatch';
import { prisma } from '@/lib/db/client';

export async function POST(request: Request) {
  const session = await getServerSession();
  const data = await request.json();
  
  // 성능 메트릭 저장
  await prisma.performanceMetric.create({
    data: {
      userId: session?.user?.id,
      metricName: data.name,
      value: data.value,
      userAgent: request.headers.get('user-agent') || '',
      path: data.path,
    },
  });

  // CloudWatch 메트릭 전송
  await putMetric({
    namespace: 'GMTool/Performance',
    metricName: data.name,
    value: data.value,
    dimensions: [
      { Name: 'Path', Value: data.path },
      { Name: 'Environment', Value: process.env.NODE_ENV! },
    ],
  });

  return NextResponse.json({ success: true });
}
```

## 4. 알림 규칙
### 4.1 CloudWatch 알림 규칙
```typescript
// lib/monitoring/rules/cloudwatch.ts
import { CloudWatchClient, PutMetricAlarmCommand } from '@aws-sdk/client-cloudwatch';

const cloudwatch = new CloudWatchClient({
  region: process.env.AWS_REGION,
});

interface AlarmConfig {
  name: string;
  metric: string;
  threshold: number;
  evaluationPeriods: number;
  datapointsToAlarm: number;
}

export async function setupAlarms(configs: AlarmConfig[]) {
  for (const config of configs) {
    const command = new PutMetricAlarmCommand({
      AlarmName: config.name,
      MetricName: config.metric,
      Namespace: 'GMTool',
      Statistic: 'Average',
      Period: 300,
      EvaluationPeriods: config.evaluationPeriods,
      DatapointsToAlarm: config.datapointsToAlarm,
      Threshold: config.threshold,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [process.env.SNS_ALARM_TOPIC!],
    });

    try {
      await cloudwatch.send(command);
    } catch (error) {
      console.error(`Failed to create alarm ${config.name}:`, error);
    }
  }
}
```

### 4.2 알림 필터링
```typescript
// lib/monitoring/rules/filters.ts
interface AlertRule {
  type: string;
  condition: (data: any) => boolean;
  message: (data: any) => string;
  channels: string[];
}

const alertRules: AlertRule[] = [
  {
    type: 'error_rate',
    condition: (data) => data.errorRate > 0.05,
    message: (data) => `Error rate exceeded 5%: ${(data.errorRate * 100).toFixed(2)}%`,
    channels: ['slack', 'email'],
  },
  {
    type: 'response_time',
    condition: (data) => data.p95 > 1000,
    message: (data) => `P95 response time exceeded 1s: ${data.p95}ms`,
    channels: ['slack'],
  },
  {
    type: 'disk_usage',
    condition: (data) => data.usage > 85,
    message: (data) => `Disk usage exceeded 85%: ${data.usage}%`,
    channels: ['slack', 'email'],
  },
];

export function processAlertRules(type: string, data: any) {
  const matchingRules = alertRules.filter((rule) => rule.type === type);
  
  for (const rule of matchingRules) {
    if (rule.condition(data)) {
      return {
        message: rule.message(data),
        channels: rule.channels,
      };
    }
  }
  
  return null;
}
```

## 다음 단계
- step7-deployment-004.md: 로그 관리 및 분석 