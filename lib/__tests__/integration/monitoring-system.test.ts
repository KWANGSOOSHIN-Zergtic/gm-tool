import { mockCloudWatch, mockSNS, mockSES } from './setup';
import { setupDefaultMonitoring } from '../../monitoring/examples';
import { startScheduler, stopScheduler } from '../../monitoring/scheduler';
import { publishMetrics } from '../../monitoring/metric-collector';
import { StandardUnit } from '@aws-sdk/client-cloudwatch';
import { jest } from '@jest/globals';
import { evaluateAllRules } from '../../monitoring/monitoring-rules';

describe('Monitoring System Integration', () => {
  beforeAll(() => {
    setupDefaultMonitoring();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    stopScheduler();
    await jest.runAllTimersAsync();
  });

  describe('CPU Usage Monitoring', () => {
    it('should trigger alerts for high CPU usage', async () => {
      // CPU 사용량 메트릭 발행
      await publishMetrics({
        namespace: `${process.env.APP_NAME}/${process.env.NODE_ENV}/system`,
        metrics: [{
          name: 'CPUUtilization',
          value: 95,
          unit: StandardUnit.Percent,
          dimensions: { Environment: String(process.env.NODE_ENV) },
          timestamp: new Date()
        }]
      });

      // 스케줄러 시작 및 평가 대기
      startScheduler(evaluateAllRules, 1000);
      await jest.advanceTimersByTimeAsync(1000);

      // 알림이 발송되었는지 확인
      expect(mockSES.sendEmail).toHaveBeenCalled();
    });
  });

  describe('Error Rate Monitoring', () => {
    it('should trigger alerts for high error rates', async () => {
      // 에러율 메트릭 발행
      await publishMetrics({
        namespace: `${process.env.APP_NAME}/${process.env.NODE_ENV}/errors`,
        metrics: [{
          name: 'ErrorRate',
          value: 15,
          unit: StandardUnit.Percent,
          dimensions: { Environment: String(process.env.NODE_ENV) },
          timestamp: new Date()
        }]
      });

      startScheduler(evaluateAllRules, 1000);
      await jest.advanceTimersByTimeAsync(1000);

      expect(mockSNS.publish).toHaveBeenCalled();
    });
  });

  describe('API Latency Monitoring', () => {
    it('should trigger alerts for high API latency', async () => {
      // API 응답 시간 메트릭 발행
      await publishMetrics({
        namespace: `${process.env.APP_NAME}/${process.env.NODE_ENV}/api`,
        metrics: [{
          name: 'ResponseTime',
          value: 2000,
          unit: StandardUnit.Milliseconds,
          dimensions: { Environment: String(process.env.NODE_ENV) },
          timestamp: new Date()
        }]
      });

      startScheduler(evaluateAllRules, 1000);
      await jest.advanceTimersByTimeAsync(1000);

      expect(mockSES.sendEmail).toHaveBeenCalled();
    });
  });

  describe('Multiple Metrics Monitoring', () => {
    it('should handle multiple metrics and alerts simultaneously', async () => {
      // 여러 메트릭 동시 발행
      await publishMetrics({
        namespace: `${process.env.APP_NAME}/${process.env.NODE_ENV}/system`,
        metrics: [
          {
            name: 'CPUUtilization',
            value: 95,
            unit: StandardUnit.Percent,
            dimensions: { Environment: String(process.env.NODE_ENV) },
            timestamp: new Date()
          },
          {
            name: 'MemoryUtilization',
            value: 90,
            unit: StandardUnit.Percent,
            dimensions: { Environment: String(process.env.NODE_ENV) },
            timestamp: new Date()
          }
        ]
      });

      startScheduler(evaluateAllRules, 1000);
      await jest.advanceTimersByTimeAsync(1000);

      // 여러 알림이 발송되었는지 확인
      expect(mockSES.sendEmail).toHaveBeenCalledTimes(2);
      expect(mockSNS.publish).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle service failures gracefully', async () => {
      // CloudWatch 실패 시뮬레이션
      mockCloudWatch.putMetricData.mockRejectedValueOnce(new Error('CloudWatch error'));
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await publishMetrics({
        namespace: `${process.env.APP_NAME}/${process.env.NODE_ENV}/system`,
        metrics: [{
          name: 'CPUUtilization',
          value: 95,
          unit: StandardUnit.Percent,
          dimensions: { Environment: String(process.env.NODE_ENV) },
          timestamp: new Date()
        }]
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});