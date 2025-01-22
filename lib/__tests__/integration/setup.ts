import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { SNS } from '@aws-sdk/client-sns';
import { SES } from '@aws-sdk/client-ses';
import axios from 'axios';

// 실제 AWS 서비스 호출을 모킹하되, 통합 테스트에 필요한 응답 구조 유지
export const mockCloudWatch = {
  putMetricData: jest.fn().mockResolvedValue({}),
  getMetricData: jest.fn().mockResolvedValue({
    MetricDataResults: [
      {
        Id: 'm0',
        Values: [75, 85, 95], // CPU 사용량 시뮬레이션
      },
    ],
  }),
};

export const mockSNS = {
  publish: jest.fn().mockResolvedValue({}),
};

export const mockSES = {
  sendEmail: jest.fn().mockResolvedValue({}),
};

export const mockSlack = jest.fn().mockResolvedValue({});

// 모킹 설정
jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatch: jest.fn().mockImplementation(() => mockCloudWatch),
  StandardUnit: {
    Count: 'Count',
    Seconds: 'Seconds',
    Percent: 'Percent',
  },
}));

jest.mock('@aws-sdk/client-sns', () => ({
  SNS: jest.fn().mockImplementation(() => mockSNS),
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SES: jest.fn().mockImplementation(() => mockSES),
}));

jest.mock('axios', () => ({
  post: mockSlack,
}));

// 테스트 환경 변수 설정
process.env = {
  ...process.env,
  NODE_ENV: 'test',
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'test-access-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
  APP_NAME: 'test-app',
  ALERT_EMAIL_FROM: 'test@example.com',
  ALERT_SNS_TOPIC_ARN: 'arn:aws:sns:us-east-1:123456789012:test-topic',
  ALERT_SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/test',
};

// 테스트 후 정리
afterAll(() => {
  jest.clearAllMocks();
}); 