import { jest } from '@jest/globals';
import { CloudWatch, StandardUnit, GetMetricDataCommandOutput } from '@aws-sdk/client-cloudwatch';
import {
  publishMetrics,
  getMetrics,
  getMetricAggregation,
  clearMetricAggregations,
  flushAllMetrics,
  type Metric,
  type MetricBatch,
} from '../metric-collector';

jest.mock('@aws-sdk/client-cloudwatch');
jest.mock('../../logging/collector');

describe('metric-collector', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearMetricAggregations();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    await flushAllMetrics();
  });

  describe('publishMetrics', () => {
    it('should batch metrics and send them after interval', async () => {
      const mockPutMetricData = jest.spyOn(CloudWatch.prototype, 'putMetricData');
      const batch: MetricBatch = {
        namespace: 'test/namespace',
        metrics: [
          {
            name: 'test_metric',
            value: 100,
            unit: StandardUnit.Count,
            timestamp: new Date(),
          },
        ],
      };

      await publishMetrics(batch);
      expect(mockPutMetricData).not.toHaveBeenCalled();

      // 배치 간격만큼 시간 진행
      await jest.advanceTimersByTimeAsync(60 * 1000);
      expect(mockPutMetricData).toHaveBeenCalledTimes(1);
    });

    it('should immediately flush metrics when batch size is reached', async () => {
      const mockPutMetricData = jest.spyOn(CloudWatch.prototype, 'putMetricData');
      const batches: MetricBatch[] = Array.from({ length: 21 }, () => ({
        namespace: 'test/namespace',
        metrics: [
          {
            name: 'test_metric',
            value: 100,
            unit: StandardUnit.Count,
            timestamp: new Date(),
          },
        ],
      }));

      for (const batch of batches) {
        await publishMetrics(batch);
      }

      // 배치 크기(20)를 초과하면 즉시 처리
      expect(mockPutMetricData).toHaveBeenCalled();
    });

    it('should aggregate metrics correctly', async () => {
      const metrics: Metric[] = [
        {
          name: 'test_metric',
          value: 100,
          unit: StandardUnit.Count,
          timestamp: new Date(),
          dimensions: { service: 'test-service' },
        },
        {
          name: 'test_metric',
          value: 200,
          unit: StandardUnit.Count,
          timestamp: new Date(),
          dimensions: { service: 'test-service' },
        },
      ];

      for (const metric of metrics) {
        await publishMetrics({
          namespace: 'test/namespace',
          metrics: [metric],
        });
      }

      const aggregation = getMetricAggregation('test/namespace', 'test_metric', {
        service: 'test-service',
      });

      expect(aggregation).toBeDefined();
      expect(aggregation?.sum).toBe(300);
      expect(aggregation?.count).toBe(2);
      expect(aggregation?.min).toBe(100);
      expect(aggregation?.max).toBe(200);
    });

    it('should handle different dimensions separately', async () => {
      const batch: MetricBatch = {
        namespace: 'test/namespace',
        metrics: [
          {
            name: 'test_metric',
            value: 100,
            unit: StandardUnit.Count,
            timestamp: new Date(),
            dimensions: { service: 'service-1' },
          },
          {
            name: 'test_metric',
            value: 200,
            unit: StandardUnit.Count,
            timestamp: new Date(),
            dimensions: { service: 'service-2' },
          },
        ],
      };

      await publishMetrics(batch);

      const agg1 = getMetricAggregation('test/namespace', 'test_metric', {
        service: 'service-1',
      });
      const agg2 = getMetricAggregation('test/namespace', 'test_metric', {
        service: 'service-2',
      });

      expect(agg1?.sum).toBe(100);
      expect(agg2?.sum).toBe(200);
    });
  });

  describe('getMetrics', () => {
    it('should retrieve metrics from CloudWatch', async () => {
      const mockResponse: GetMetricDataCommandOutput = {
        MetricDataResults: [
          {
            Id: 'm0',
            Values: [1, 2, 3],
          },
        ],
        $metadata: {},
      };

      const mockGetMetricData = jest.spyOn(CloudWatch.prototype, 'getMetricData')
        .mockResolvedValueOnce(mockResponse);

      const startTime = new Date();
      const endTime = new Date();
      const result = await getMetrics(
        'test/namespace',
        ['test_metric'],
        startTime,
        endTime
      );

      expect(mockGetMetricData).toHaveBeenCalledWith({
        MetricDataQueries: expect.arrayContaining([
          expect.objectContaining({
            Id: 'm0',
            MetricStat: expect.objectContaining({
              Metric: expect.objectContaining({
                Namespace: 'test/namespace',
                MetricName: 'test_metric',
              }),
            }),
          }),
        ]),
        StartTime: startTime,
        EndTime: endTime,
      });

      expect(result).toEqual({
        test_metric: [1, 2, 3],
      });
    });

    it('should handle missing metric values', async () => {
      const mockResponse: GetMetricDataCommandOutput = {
        MetricDataResults: [],
        $metadata: {},
      };

      jest.spyOn(CloudWatch.prototype, 'getMetricData')
        .mockResolvedValueOnce(mockResponse);

      const result = await getMetrics(
        'test/namespace',
        ['test_metric'],
        new Date(),
        new Date()
      );

      expect(result).toEqual({});
    });
  });

  describe('metric aggregation', () => {
    it('should clear aggregation cache', async () => {
      const batch: MetricBatch = {
        namespace: 'test/namespace',
        metrics: [
          {
            name: 'test_metric',
            value: 100,
            unit: StandardUnit.Count,
            timestamp: new Date(),
          },
        ],
      };

      await publishMetrics(batch);
      expect(getMetricAggregation('test/namespace', 'test_metric')).toBeDefined();

      clearMetricAggregations();
      expect(getMetricAggregation('test/namespace', 'test_metric')).toBeUndefined();
    });

    it('should handle undefined dimensions', async () => {
      const batch: MetricBatch = {
        namespace: 'test/namespace',
        metrics: [
          {
            name: 'test_metric',
            value: 100,
            unit: StandardUnit.Count,
            timestamp: new Date(),
          },
        ],
      };

      await publishMetrics(batch);
      const aggregation = getMetricAggregation('test/namespace', 'test_metric');

      expect(aggregation).toBeDefined();
      expect(aggregation?.sum).toBe(100);
    });
  });
}); 