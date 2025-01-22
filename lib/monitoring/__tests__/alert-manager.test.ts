import { jest } from '@jest/globals';
import { sendAlert } from '../alert-manager';
import { Alert, AlertSeverity } from '../types';
import { SES } from '@aws-sdk/client-ses';
import { SNS } from '@aws-sdk/client-sns';
import axios from 'axios';

jest.mock('axios');
jest.mock('@aws-sdk/client-ses');
jest.mock('@aws-sdk/client-sns');

const mockSES = {
  sendEmail: jest.fn().mockResolvedValue({})
};

const mockSNS = {
  publish: jest.fn().mockResolvedValue({})
};

(SES as jest.Mock).mockImplementation(() => mockSES);
(SNS as jest.Mock).mockImplementation(() => mockSNS);

describe('alert-manager', () => {
  const mockAlert: Alert = {
    id: 'test-alert-id',
    title: 'Test Alert',
    message: 'This is a test alert',
    severity: AlertSeverity.WARNING,
    timestamp: new Date('2024-01-01T00:00:00.000Z'),
    metadata: {
      testKey: 'testValue'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendAlert', () => {
    it('should send alert through all configured channels for WARNING severity', async () => {
      await sendAlert(mockAlert);

      expect(axios.post).toHaveBeenCalledWith(
        process.env.ALERT_SLACK_WEBHOOK_URL,
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              title: '[WARNING] Test Alert',
              text: 'This is a test alert',
              color: '#FFC107'
            })
          ]
        })
      );

      expect(mockSES.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          Source: process.env.ALERT_EMAIL_FROM,
          Message: expect.objectContaining({
            Subject: {
              Data: '[WARNING] Test Alert'
            },
            Body: {
              Text: {
                Data: expect.stringContaining('This is a test alert')
              }
            }
          })
        })
      );
    });

    it('should send alert through all channels for CRITICAL severity', async () => {
      const criticalAlert: Alert = {
        ...mockAlert,
        severity: AlertSeverity.CRITICAL
      };

      await sendAlert(criticalAlert);

      // 모든 채널 확인
      expect(axios.post).toHaveBeenCalled();
      expect(mockSES.sendEmail).toHaveBeenCalled();
      expect(mockSNS.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          TopicArn: process.env.ALERT_SNS_TOPIC_ARN,
          Message: expect.stringContaining('This is a test alert')
        })
      );
    });

    it('should handle missing Slack webhook URL gracefully', async () => {
      const originalUrl = process.env.ALERT_SLACK_WEBHOOK_URL;
      delete process.env.ALERT_SLACK_WEBHOOK_URL;

      await sendAlert(mockAlert);

      expect(axios.post).not.toHaveBeenCalled();
      expect(mockSES.sendEmail).toHaveBeenCalled();

      process.env.ALERT_SLACK_WEBHOOK_URL = originalUrl;
    });

    it('should handle channel errors and continue with other channels', async () => {
      // Slack 실패 시뮬레이션
      (axios.post as jest.Mock).mockRejectedValueOnce(new Error('Slack error'));
      
      await sendAlert(mockAlert);

      // 다른 채널은 계속 시도되어야 함
      expect(mockSES.sendEmail).toHaveBeenCalled();
    });

    it('should include metadata in alert messages', async () => {
      await sendAlert(mockAlert);

      // Slack 메시지에 메타데이터 포함 확인
      expect(axios.post).toHaveBeenCalledWith(
        process.env.ALERT_SLACK_WEBHOOK_URL,
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              fields: [
                expect.objectContaining({
                  title: 'testKey',
                  value: '"testValue"'
                })
              ]
            })
          ]
        })
      );

      // 이메일 메시지에 메타데이터 포함 확인
      expect(mockSES.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          Message: expect.objectContaining({
            Body: expect.objectContaining({
              Text: {
                Data: expect.stringContaining('testKey: "testValue"')
              }
            })
          })
        })
      );
    });
  });
}); 