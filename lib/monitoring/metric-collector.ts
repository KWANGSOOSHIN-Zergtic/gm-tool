import { CloudWatch, StandardUnit, MetricDatum } from '@aws-sdk/client-cloudwatch';
import { env } from '../env';
import { logEvent } from '../logging/collector';

const cloudwatch = new CloudWatch({ region: env.AWS_REGION });

// 메트릭 배치 크기 제한
const MAX_BATCH_SIZE = 20;
const BATCH_INTERVAL = 60 * 1000; // 1분

export interface Metric {
  name: string;
  value: number;
  unit: StandardUnit;
  timestamp: Date;
  dimensions?: Record<string, string>;
}

export interface MetricBatch {
  namespace: string;
  metrics: Metric[];
}

interface MetricAggregation {
  sum: number;
  count: number;
  min: number;
  max: number;
  timestamp: Date;
}

// 메트릭 배치 큐
let metricQueue: MetricBatch[] = [];
let batchTimeout: NodeJS.Timeout | null = null;

// 메트릭 집계 캐시
const aggregationCache = new Map<string, MetricAggregation>();

function getMetricKey(namespace: string, name: string, dimensions?: Record<string, string>): string {
  const dimensionString = dimensions 
    ? Object.entries(dimensions).sort().map(([k, v]) => `${k}=${v}`).join(',')
    : '';
  return `${namespace}:${name}:${dimensionString}`;
}

function updateAggregation(key: string, value: number, timestamp: Date): void {
  const current = aggregationCache.get(key) || {
    sum: 0,
    count: 0,
    min: value,
    max: value,
    timestamp
  };

  aggregationCache.set(key, {
    sum: current.sum + value,
    count: current.count + 1,
    min: Math.min(current.min, value),
    max: Math.max(current.max, value),
    timestamp
  });
}

async function flushMetricBatch(): Promise<void> {
  if (metricQueue.length === 0) return;

  const batchesToProcess = [...metricQueue];
  metricQueue = [];

  try {
    // 배치 단위로 처리
    for (let i = 0; i < batchesToProcess.length; i += MAX_BATCH_SIZE) {
      const currentBatch = batchesToProcess.slice(i, i + MAX_BATCH_SIZE);
      if (currentBatch.length === 0) continue;

      const firstBatch = currentBatch[0];
      if (!firstBatch) continue;

      const metricData: MetricDatum[] = [];
      const namespace = firstBatch.namespace;

      for (const batch of currentBatch) {
        for (const metric of batch.metrics) {
          const key = getMetricKey(batch.namespace, metric.name, metric.dimensions);
          updateAggregation(key, metric.value, metric.timestamp);

          metricData.push({
            MetricName: metric.name,
            Value: metric.value,
            Unit: metric.unit,
            Timestamp: metric.timestamp,
            Dimensions: metric.dimensions
              ? Object.entries(metric.dimensions).map(([Name, Value]) => ({
                  Name,
                  Value,
                }))
              : undefined,
          });
        }
      }

      await cloudwatch.putMetricData({
        Namespace: namespace,
        MetricData: metricData,
      });
    }

    await logEvent({
      level: 'INFO',
      message: 'Metrics batch processed successfully',
      metadata: {
        batchCount: batchesToProcess.length,
        metricCount: batchesToProcess.reduce((sum, batch) => sum + batch.metrics.length, 0),
      },
    });
  } catch (error) {
    await logEvent({
      level: 'ERROR',
      message: 'Failed to process metrics batch',
      metadata: { error },
    });
    throw error;
  }
}

export async function publishMetrics(batch: MetricBatch): Promise<void> {
  metricQueue.push(batch);

  // 배치 타이머 설정
  if (!batchTimeout) {
    batchTimeout = setTimeout(async () => {
      batchTimeout = null;
      await flushMetricBatch();
    }, BATCH_INTERVAL);
  }

  // 큐가 가득 차면 즉시 처리
  if (metricQueue.length >= MAX_BATCH_SIZE) {
    if (batchTimeout) {
      clearTimeout(batchTimeout);
      batchTimeout = null;
    }
    await flushMetricBatch();
  }
}

export async function getMetrics(
  namespace: string,
  metricNames: string[],
  startTime: Date,
  endTime: Date,
  period: number = 300,
  dimensions?: Record<string, string>
): Promise<Record<string, number[]>> {
  try {
    const response = await cloudwatch.getMetricData({
      MetricDataQueries: metricNames.map((name, index) => ({
        Id: `m${index}`,
        MetricStat: {
          Metric: {
            Namespace: namespace,
            MetricName: name,
            Dimensions: dimensions
              ? Object.entries(dimensions).map(([Name, Value]) => ({
                  Name,
                  Value,
                }))
              : undefined,
          },
          Period: period,
          Stat: 'Average',
        },
      })),
      StartTime: startTime,
      EndTime: endTime,
    });

    const result: Record<string, number[]> = {};
    if (response.MetricDataResults) {
      response.MetricDataResults.forEach((data, index) => {
        const name = metricNames[index];
        if (name && data.Values) {
          result[name] = data.Values;
        }
      });
    }

    return result;
  } catch (error) {
    await logEvent({
      level: 'ERROR',
      message: 'Failed to retrieve metrics',
      metadata: {
        error,
        namespace,
        metricNames,
        startTime,
        endTime,
        period,
        dimensions,
      },
    });
    throw error;
  }
}

export function getMetricAggregation(
  namespace: string,
  name: string,
  dimensions?: Record<string, string>
): MetricAggregation | undefined {
  const key = getMetricKey(namespace, name, dimensions);
  return aggregationCache.get(key);
}

// 캐시 정리
export function clearMetricAggregations(): void {
  aggregationCache.clear();
}

// 배치 큐 정리
export async function flushAllMetrics(): Promise<void> {
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  await flushMetricBatch();
} 