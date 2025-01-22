# Step 7-027: 성능 최적화 시스템 고도화

## 1. 성능 모니터링 시스템
### 1.1 성능 메트릭 수집기
```typescript
// lib/performance/collector.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { Datadog } from '@datadog/datadog-api-client';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });
const datadog = new Datadog({
  apiKey: process.env.DATADOG_API_KEY,
  appKey: process.env.DATADOG_APP_KEY,
});

interface PerformanceMetrics {
  id: string;
  timestamp: Date;
  metrics: {
    apiLatency: {
      p50: number;
      p90: number;
      p99: number;
    };
    databaseLatency: {
      p50: number;
      p90: number;
      p99: number;
    };
    cacheHitRate: number;
    errorRate: number;
    cpuUtilization: number;
    memoryUtilization: number;
  };
  slowestEndpoints: Array<{
    path: string;
    method: string;
    latency: number;
    count: number;
  }>;
}

export async function collectPerformanceMetrics(): Promise<PerformanceMetrics> {
  try {
    const metrics: PerformanceMetrics = {
      id: uuidv4(),
      timestamp: new Date(),
      metrics: {
        apiLatency: {
          p50: 0,
          p90: 0,
          p99: 0,
        },
        databaseLatency: {
          p50: 0,
          p90: 0,
          p99: 0,
        },
        cacheHitRate: 0,
        errorRate: 0,
        cpuUtilization: 0,
        memoryUtilization: 0,
      },
      slowestEndpoints: [],
    };

    // API 지연 시간 조회
    const apiLatencyMetrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        {
          Id: 'p50',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApiGateway',
              MetricName: 'Latency',
              Dimensions: [
                {
                  Name: 'ApiName',
                  Value: process.env.API_NAME!,
                },
              ],
            },
            Period: 300,
            Stat: 'p50',
          },
        },
        {
          Id: 'p90',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApiGateway',
              MetricName: 'Latency',
              Dimensions: [
                {
                  Name: 'ApiName',
                  Value: process.env.API_NAME!,
                },
              ],
            },
            Period: 300,
            Stat: 'p90',
          },
        },
        {
          Id: 'p99',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApiGateway',
              MetricName: 'Latency',
              Dimensions: [
                {
                  Name: 'ApiName',
                  Value: process.env.API_NAME!,
                },
              ],
            },
            Period: 300,
            Stat: 'p99',
          },
        },
      ],
      StartTime: new Date(Date.now() - 5 * 60 * 1000),
      EndTime: new Date(),
    });

    metrics.metrics.apiLatency = {
      p50: apiLatencyMetrics.MetricDataResults![0].Values![0] || 0,
      p90: apiLatencyMetrics.MetricDataResults![1].Values![0] || 0,
      p99: apiLatencyMetrics.MetricDataResults![2].Values![0] || 0,
    };

    // 데이터베이스 지연 시간 조회
    const dbLatencyMetrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        {
          Id: 'db_p50',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/RDS',
              MetricName: 'ReadLatency',
              Dimensions: [
                {
                  Name: 'DBInstanceIdentifier',
                  Value: process.env.DB_INSTANCE_ID!,
                },
              ],
            },
            Period: 300,
            Stat: 'p50',
          },
        },
        {
          Id: 'db_p90',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/RDS',
              MetricName: 'ReadLatency',
              Dimensions: [
                {
                  Name: 'DBInstanceIdentifier',
                  Value: process.env.DB_INSTANCE_ID!,
                },
              ],
            },
            Period: 300,
            Stat: 'p90',
          },
        },
        {
          Id: 'db_p99',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/RDS',
              MetricName: 'ReadLatency',
              Dimensions: [
                {
                  Name: 'DBInstanceIdentifier',
                  Value: process.env.DB_INSTANCE_ID!,
                },
              ],
            },
            Period: 300,
            Stat: 'p99',
          },
        },
      ],
      StartTime: new Date(Date.now() - 5 * 60 * 1000),
      EndTime: new Date(),
    });

    metrics.metrics.databaseLatency = {
      p50: dbLatencyMetrics.MetricDataResults![0].Values![0] || 0,
      p90: dbLatencyMetrics.MetricDataResults![1].Values![0] || 0,
      p99: dbLatencyMetrics.MetricDataResults![2].Values![0] || 0,
    };

    // 캐시 히트율 조회
    const cacheMetrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        {
          Id: 'cache_hits',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ElastiCache',
              MetricName: 'CacheHits',
              Dimensions: [
                {
                  Name: 'CacheClusterId',
                  Value: process.env.CACHE_CLUSTER_ID!,
                },
              ],
            },
            Period: 300,
            Stat: 'Sum',
          },
        },
        {
          Id: 'cache_misses',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ElastiCache',
              MetricName: 'CacheMisses',
              Dimensions: [
                {
                  Name: 'CacheClusterId',
                  Value: process.env.CACHE_CLUSTER_ID!,
                },
              ],
            },
            Period: 300,
            Stat: 'Sum',
          },
        },
      ],
      StartTime: new Date(Date.now() - 5 * 60 * 1000),
      EndTime: new Date(),
    });

    const cacheHits = cacheMetrics.MetricDataResults![0].Values![0] || 0;
    const cacheMisses = cacheMetrics.MetricDataResults![1].Values![0] || 0;
    metrics.metrics.cacheHitRate = (cacheHits / (cacheHits + cacheMisses)) * 100;

    // 가장 느린 엔드포인트 조회
    const slowEndpoints = await datadog.metrics.queryMetrics({
      from: Math.floor((Date.now() - 5 * 60 * 1000) / 1000),
      to: Math.floor(Date.now() / 1000),
      query: 'avg:api.request.latency{*} by {path,method}.rollup(avg, 60)',
    });

    metrics.slowestEndpoints = slowEndpoints.series
      .map(series => ({
        path: series.scope.split(',')[0].split(':')[1],
        method: series.scope.split(',')[1].split(':')[1],
        latency: series.pointlist[series.pointlist.length - 1][1],
        count: series.pointlist.length,
      }))
      .sort((a, b) => b.latency - a.latency)
      .slice(0, 5);

    // 임계값 초과 시 알림 전송
    if (
      metrics.metrics.apiLatency.p99 > 1000 ||
      metrics.metrics.databaseLatency.p99 > 100 ||
      metrics.metrics.cacheHitRate < 80
    ) {
      await sendAlert({
        type: 'performance_metrics',
        title: '성능 지표 임계값 초과',
        message: '성능 지표가 임계값을 초과했습니다.',
        severity: 'warning',
        metadata: { metrics },
        channels: [
          {
            type: 'slack',
            target: process.env.PERFORMANCE_ALERT_SLACK_CHANNEL!,
          },
          {
            type: 'email',
            target: process.env.PERFORMANCE_ALERT_EMAIL!,
          },
        ],
      });
    }

    await logEvent('info', 'Performance metrics collected', { metrics });

    return metrics;
  } catch (error) {
    await logEvent('error', 'Failed to collect performance metrics', { error });
    throw error;
  }
}
```

### 1.2 성능 최적화 관리자
```typescript
// lib/performance/optimizer.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { AutoScaling } from '@aws-sdk/client-auto-scaling';
import { ElastiCache } from '@aws-sdk/client-elasticache';
import { logEvent } from '@/lib/logging/collector';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });
const autoscaling = new AutoScaling({ region: process.env.AWS_REGION });
const elasticache = new ElastiCache({ region: process.env.AWS_REGION });

interface OptimizationAction {
  id: string;
  timestamp: Date;
  type: 'scaling' | 'caching' | 'database';
  action: string;
  reason: string;
  parameters: Record<string, any>;
}

export async function optimizePerformance(
  metrics: PerformanceMetrics
): Promise<OptimizationAction[]> {
  try {
    const actions: OptimizationAction[] = [];

    // CPU 사용률에 따른 스케일링
    if (metrics.metrics.cpuUtilization > 70) {
      const action: OptimizationAction = {
        id: uuidv4(),
        timestamp: new Date(),
        type: 'scaling',
        action: 'increase_capacity',
        reason: 'High CPU utilization',
        parameters: {
          metric: 'cpuUtilization',
          currentValue: metrics.metrics.cpuUtilization,
          threshold: 70,
        },
      };

      await autoscaling.setDesiredCapacity({
        AutoScalingGroupName: process.env.ASG_NAME!,
        DesiredCapacity: (await autoscaling.describeAutoScalingGroups({
          AutoScalingGroupNames: [process.env.ASG_NAME!],
        })).AutoScalingGroups![0].DesiredCapacity! + 1,
      });

      actions.push(action);
    }

    // 캐시 히트율에 따른 캐시 최적화
    if (metrics.metrics.cacheHitRate < 80) {
      const action: OptimizationAction = {
        id: uuidv4(),
        timestamp: new Date(),
        type: 'caching',
        action: 'increase_cache_size',
        reason: 'Low cache hit rate',
        parameters: {
          metric: 'cacheHitRate',
          currentValue: metrics.metrics.cacheHitRate,
          threshold: 80,
        },
      };

      await elasticache.modifyReplicationGroup({
        ReplicationGroupId: process.env.CACHE_REPLICATION_GROUP_ID!,
        CacheNodeType: 'cache.t3.medium', // 더 큰 캐시 노드 타입으로 변경
      });

      actions.push(action);
    }

    await logEvent('info', 'Performance optimization completed', { actions });

    return actions;
  } catch (error) {
    await logEvent('error', 'Failed to optimize performance', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-028.md: 장애 복구 시스템 고도화 