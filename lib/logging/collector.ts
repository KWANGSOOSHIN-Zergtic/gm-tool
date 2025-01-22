import { CloudWatchLogs } from '@aws-sdk/client-cloudwatch-logs';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { env } from '../env';

const cloudwatchLogs = new CloudWatchLogs({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const elasticsearch = new ElasticsearchClient({
  node: env.ELASTICSEARCH_URL,
  auth: {
    username: env.ELASTICSEARCH_USERNAME,
    password: env.ELASTICSEARCH_PASSWORD,
  },
});

export interface LogMetadata {
  requestId?: string;
  userId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  responseTime?: number;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string;
  traceId?: string | undefined;
  spanId?: string | undefined;
  metadata?: LogMetadata | undefined;
}

export async function logEvent(event: {
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    // Elasticsearch에 로그 저장
    await elasticsearch.index({
      index: `${env.APP_NAME}-${env.NODE_ENV}-logs-${new Date().toISOString().split('T')[0]}`,
      document: {
        timestamp: new Date().toISOString(),
        level: event.level,
        message: event.message,
        metadata: event.metadata,
      },
    });

    // CloudWatch Logs에 로그 전송
    await cloudwatchLogs.putLogEvents({
      logGroupName: `/${env.APP_NAME}/${env.NODE_ENV}`,
      logStreamName: new Date().toISOString().split('T')[0],
      logEvents: [
        {
          timestamp: Date.now(),
          message: JSON.stringify({
            level: event.level,
            message: event.message,
            metadata: event.metadata,
          }),
        },
      ],
    });
  } catch (error) {
    console.error('Failed to log event:', error);
  }
} 