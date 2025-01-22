import { SNS, PublishCommandInput } from '@aws-sdk/client-sns';
import { SES, SendEmailCommandInput } from '@aws-sdk/client-ses';
import axios from 'axios';
import { env } from '../env';
import { logEvent } from '../logging/collector';
import { Alert, AlertSeverity } from './types';

const sns = new SNS({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY
  }
});

const ses = new SES({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY
  }
});

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export type AlertChannel = 'email' | 'sns' | 'slack';

export interface AlertConfig {
  channels: {
    [severity in AlertSeverity]: AlertChannel[];
  };
}

const defaultAlertConfig: AlertConfig = {
  channels: {
    [AlertSeverity.INFO]: ['slack'],
    [AlertSeverity.WARNING]: ['slack', 'email'],
    [AlertSeverity.ERROR]: ['slack', 'email', 'sns'],
    [AlertSeverity.CRITICAL]: ['slack', 'email', 'sns'],
  },
};

const getSeverityColor = (severity: AlertSeverity): string => {
  switch (severity) {
    case AlertSeverity.INFO:
      return '#17A2B8';
    case AlertSeverity.WARNING:
      return '#FFC107';
    case AlertSeverity.CRITICAL:
      return '#DC3545';
    default:
      return '#17A2B8';
  }
};

export const sendAlert = async (alert: Alert): Promise<void> => {
  const promises: Promise<unknown>[] = [];

  // Slack 알림
  if (env.ALERT_SLACK_WEBHOOK_URL) {
    const slackMessage = {
      attachments: [
        {
          title: `[${alert.severity}] ${alert.title}`,
          text: alert.message,
          color: getSeverityColor(alert.severity),
          fields: alert.metadata ? Object.entries(alert.metadata).map(([key, value]) => ({
            title: key,
            value: JSON.stringify(value),
            short: true
          })) : []
        }
      ]
    };

    promises.push(
      axios.post(env.ALERT_SLACK_WEBHOOK_URL, slackMessage)
        .catch(error => console.error('Failed to send Slack alert:', error))
    );
  }

  // 이메일 알림
  const emailParams: SendEmailCommandInput = {
    Source: env.ALERT_EMAIL_FROM,
    Destination: {
      ToAddresses: [env.ALERT_EMAIL_FROM] // 테스트를 위해 동일한 주소 사용
    },
    Message: {
      Subject: {
        Data: `[${alert.severity}] ${alert.title}`
      },
      Body: {
        Text: {
          Data: `
Alert Details:
-------------
Severity: ${alert.severity}
Time: ${alert.timestamp.toISOString()}
Message: ${alert.message}

${alert.metadata ? `
Metadata:
---------
${Object.entries(alert.metadata)
  .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  .join('\n')}
` : ''}`
        }
      }
    }
  };

  promises.push(
    ses.sendEmail(emailParams)
      .catch(error => console.error('Failed to send email alert:', error))
  );

  // CRITICAL 레벨일 때만 SNS 알림
  if (alert.severity === AlertSeverity.CRITICAL) {
    const snsParams: PublishCommandInput = {
      TopicArn: env.ALERT_SNS_TOPIC_ARN,
      Subject: `[${alert.severity}] ${alert.title}`,
      Message: `
Alert Details:
-------------
Severity: ${alert.severity}
Time: ${alert.timestamp.toISOString()}
Message: ${alert.message}

${alert.metadata ? `
Metadata:
---------
${Object.entries(alert.metadata)
  .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
  .join('\n')}
` : ''}`
    };

    promises.push(
      sns.publish(snsParams)
        .catch(error => console.error('Failed to send SNS alert:', error))
    );
  }

  await Promise.all(promises);
}; 