import { jest } from '@jest/globals';

// 테스트 환경 변수 설정
Object.assign(process.env, {
  NODE_ENV: 'test',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'test-key-id',
  AWS_SECRET_ACCESS_KEY: 'test-access-key',
  APP_NAME: 'test-app',
  ALERT_EMAIL_FROM: 'test@example.com',
  ALERT_SNS_TOPIC_ARN: 'arn:aws:sns:us-east-1:123456789012:test-topic',
  ALERT_SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/test',
  ELASTICSEARCH_URL: 'http://localhost:9200',
  ELASTICSEARCH_USERNAME: 'test-user',
  ELASTICSEARCH_PASSWORD: 'test-password',
  LOG_ARCHIVE_BUCKET: 'test-log-bucket'
});

// AWS SDK 모킹
jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatch: jest.fn().mockImplementation(() => ({
    putMetricData: jest.fn().mockReturnValue(Promise.resolve({})),
    getMetricData: jest.fn().mockReturnValue(Promise.resolve({
      MetricDataResults: [
        {
          Id: 'm0',
          Values: [1, 2, 3]
        }
      ]
    }))
  })),
  StandardUnit: {
    Percent: 'Percent',
    Milliseconds: 'Milliseconds',
    Count: 'Count'
  }
}));

jest.mock('@aws-sdk/client-sns', () => ({
  SNS: jest.fn().mockImplementation(() => ({
    publish: jest.fn().mockReturnValue(Promise.resolve({}))
  }))
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SES: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockReturnValue(Promise.resolve({}))
  }))
}));

jest.mock('@aws-sdk/client-cloudwatch-logs', () => ({
  CloudWatchLogs: jest.fn().mockImplementation(() => ({
    putLogEvents: jest.fn().mockReturnValue(Promise.resolve({}))
  }))
}));

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue(Promise.resolve({ result: 'created' }))
  }))
}));

jest.mock('axios', () => ({
  post: jest.fn().mockReturnValue(Promise.resolve({}))
}));

// 테스트 완료 후 모든 모킹 초기화
afterAll(() => {
  jest.clearAllMocks();
}); 