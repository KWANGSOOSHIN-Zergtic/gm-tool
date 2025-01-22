# Step 7-011: 성능 최적화 및 스케일링

## 1. 성능 모니터링
### 1.1 성능 메트릭 수집
```typescript
// lib/performance/metrics.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/logger';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface PerformanceMetrics {
  cpu: number;
  memory: number;
  responseTime: number;
  errorRate: number;
  requestCount: number;
}

export async function collectMetrics(): Promise<PerformanceMetrics> {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 300000); // 5분

    const metrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        {
          Id: 'cpu',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ECS',
              MetricName: 'CPUUtilization',
              Dimensions: [
                {
                  Name: 'ServiceName',
                  Value: process.env.ECS_SERVICE_NAME!,
                },
              ],
            },
            Period: 300,
            Stat: 'Average',
          },
        },
        // 기타 메트릭 쿼리...
      ],
      StartTime: startTime,
      EndTime: endTime,
    });

    return {
      cpu: metrics.MetricDataResults![0].Values![0] || 0,
      memory: metrics.MetricDataResults![1].Values![0] || 0,
      responseTime: metrics.MetricDataResults![2].Values![0] || 0,
      errorRate: metrics.MetricDataResults![3].Values![0] || 0,
      requestCount: metrics.MetricDataResults![4].Values![0] || 0,
    };
  } catch (error) {
    logEvent('error', 'Failed to collect performance metrics', { error });
    throw error;
  }
}
```

### 1.2 성능 알림
```typescript
// lib/performance/alerts.ts
import { sendSlackAlert } from '@/lib/monitoring/notifications/slack';
import { logEvent } from '@/lib/logging/logger';

interface PerformanceThresholds {
  cpu: number;
  memory: number;
  responseTime: number;
  errorRate: number;
}

const THRESHOLDS: PerformanceThresholds = {
  cpu: 80,
  memory: 80,
  responseTime: 1000,
  errorRate: 0.05,
};

export async function checkPerformanceAlerts(metrics: PerformanceMetrics) {
  const alerts = [];

  if (metrics.cpu > THRESHOLDS.cpu) {
    alerts.push({
      type: 'cpu',
      value: metrics.cpu,
      threshold: THRESHOLDS.cpu,
    });
  }

  if (metrics.memory > THRESHOLDS.memory) {
    alerts.push({
      type: 'memory',
      value: metrics.memory,
      threshold: THRESHOLDS.memory,
    });
  }

  if (metrics.responseTime > THRESHOLDS.responseTime) {
    alerts.push({
      type: 'response_time',
      value: metrics.responseTime,
      threshold: THRESHOLDS.responseTime,
    });
  }

  if (metrics.errorRate > THRESHOLDS.errorRate) {
    alerts.push({
      type: 'error_rate',
      value: metrics.errorRate,
      threshold: THRESHOLDS.errorRate,
    });
  }

  if (alerts.length > 0) {
    await notifyPerformanceAlerts(alerts);
  }
}

async function notifyPerformanceAlerts(alerts: any[]) {
  const message = formatAlertMessage(alerts);
  
  await sendSlackAlert('performance', message, [
    {
      color: 'danger',
      fields: alerts.map(alert => ({
        title: alert.type,
        value: `${alert.value} (threshold: ${alert.threshold})`,
        short: true,
      })),
    },
  ]);

  logEvent('warning', 'Performance alerts triggered', { alerts });
}
```

## 2. 자동 스케일링
### 2.1 ECS 스케일링 설정
```typescript
// lib/scaling/ecs.ts
import { ApplicationAutoScaling } from '@aws-sdk/client-application-auto-scaling';
import { logEvent } from '@/lib/logging/logger';

const autoScaling = new ApplicationAutoScaling({
  region: process.env.AWS_REGION,
});

interface ScalingConfig {
  minCapacity: number;
  maxCapacity: number;
  targetCpuUtilization: number;
  targetMemoryUtilization: number;
}

export async function configureAutoScaling(config: ScalingConfig) {
  try {
    // CPU 기반 스케일링 정책
    await autoScaling.putScalingPolicy({
      PolicyName: 'cpu-scaling',
      ServiceNamespace: 'ecs',
      ResourceId: `service/${process.env.ECS_CLUSTER}/${process.env.ECS_SERVICE}`,
      ScalableDimension: 'ecs:service:DesiredCount',
      PolicyType: 'TargetTrackingScaling',
      TargetTrackingScalingPolicyConfiguration: {
        TargetValue: config.targetCpuUtilization,
        PredefinedMetricSpecification: {
          PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
        },
        ScaleOutCooldown: 300,
        ScaleInCooldown: 300,
      },
    });

    // 메모리 기반 스케일링 정책
    await autoScaling.putScalingPolicy({
      PolicyName: 'memory-scaling',
      ServiceNamespace: 'ecs',
      ResourceId: `service/${process.env.ECS_CLUSTER}/${process.env.ECS_SERVICE}`,
      ScalableDimension: 'ecs:service:DesiredCount',
      PolicyType: 'TargetTrackingScaling',
      TargetTrackingScalingPolicyConfiguration: {
        TargetValue: config.targetMemoryUtilization,
        PredefinedMetricSpecification: {
          PredefinedMetricType: 'ECSServiceAverageMemoryUtilization',
        },
        ScaleOutCooldown: 300,
        ScaleInCooldown: 300,
      },
    });

    logEvent('info', 'Auto scaling configured', config);
  } catch (error) {
    logEvent('error', 'Failed to configure auto scaling', { error });
    throw error;
  }
}
```

### 2.2 RDS 스케일링 설정
```typescript
// lib/scaling/rds.ts
import { RDS } from '@aws-sdk/client-rds';
import { logEvent } from '@/lib/logging/logger';

const rds = new RDS({ region: process.env.AWS_REGION });

interface DBScalingConfig {
  instanceClass: string;
  allocatedStorage: number;
  maxAllocatedStorage: number;
}

export async function configureDBScaling(config: DBScalingConfig) {
  try {
    await rds.modifyDBInstance({
      DBInstanceIdentifier: process.env.RDS_INSTANCE_ID,
      DBInstanceClass: config.instanceClass,
      AllocatedStorage: config.allocatedStorage,
      MaxAllocatedStorage: config.maxAllocatedStorage,
      ApplyImmediately: false,
    });

    logEvent('info', 'DB scaling configured', config);
  } catch (error) {
    logEvent('error', 'Failed to configure DB scaling', { error });
    throw error;
  }
}
```

## 3. 성능 최적화
### 3.1 데이터베이스 최적화
```typescript
// lib/optimization/database.ts
import { prisma } from '@/lib/db/client';
import { logEvent } from '@/lib/logging/logger';

interface QueryOptimizationResult {
  tableName: string;
  recommendations: string[];
  suggestedIndexes: string[];
}

export async function analyzeQueryPerformance(): Promise<QueryOptimizationResult[]> {
  try {
    // 느린 쿼리 분석
    const slowQueries = await prisma.$queryRaw`
      SELECT 
        relname as table_name,
        seq_scan,
        seq_tup_read,
        idx_scan,
        idx_tup_fetch
      FROM pg_stat_user_tables
      WHERE seq_scan > idx_scan
      AND seq_scan > 1000
    `;

    // 인덱스 사용 분석
    const indexUsage = await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes
      WHERE idx_scan = 0
      AND idx_tup_read = 0
    `;

    const results = [];

    for (const table of slowQueries) {
      const recommendations = [];
      const suggestedIndexes = [];

      if (table.seq_scan > table.idx_scan * 10) {
        recommendations.push(
          'Consider adding indexes to reduce sequential scans'
        );
        
        // 인덱스 추천
        const columns = await analyzeTableColumns(table.table_name);
        suggestedIndexes.push(...generateIndexSuggestions(columns));
      }

      results.push({
        tableName: table.table_name,
        recommendations,
        suggestedIndexes,
      });
    }

    logEvent('info', 'Database optimization analysis completed', {
      tableCount: results.length,
    });

    return results;
  } catch (error) {
    logEvent('error', 'Failed to analyze query performance', { error });
    throw error;
  }
}
```

### 3.2 캐시 최적화
```typescript
// lib/optimization/cache.ts
import { redis } from '@/lib/cache/redis';
import { logEvent } from '@/lib/logging/logger';

interface CacheAnalysis {
  hitRate: number;
  missRate: number;
  memoryUsage: number;
  recommendations: string[];
}

export async function analyzeCachePerformance(): Promise<CacheAnalysis> {
  try {
    const info = await redis.info();
    const stats = parseRedisInfo(info);

    const hitRate = stats.keyspace_hits / (stats.keyspace_hits + stats.keyspace_misses);
    const missRate = stats.keyspace_misses / (stats.keyspace_hits + stats.keyspace_misses);
    const memoryUsage = stats.used_memory / stats.total_system_memory;

    const recommendations = [];

    if (hitRate < 0.8) {
      recommendations.push(
        'Consider increasing cache TTL for frequently accessed keys'
      );
    }

    if (memoryUsage > 0.8) {
      recommendations.push(
        'Consider increasing Redis memory or implementing LRU eviction'
      );
    }

    const analysis = {
      hitRate,
      missRate,
      memoryUsage,
      recommendations,
    };

    logEvent('info', 'Cache performance analysis completed', analysis);

    return analysis;
  } catch (error) {
    logEvent('error', 'Failed to analyze cache performance', { error });
    throw error;
  }
}

export async function optimizeCacheSettings() {
  try {
    // 메모리 정책 설정
    await redis.config('SET', 'maxmemory-policy', 'allkeys-lru');
    
    // 키 만료 설정
    const keys = await redis.keys('*');
    for (const key of keys) {
      const ttl = await redis.ttl(key);
      if (ttl === -1) {
        // TTL이 설정되지 않은 키에 대해 기본 TTL 설정
        await redis.expire(key, 3600); // 1시간
      }
    }

    logEvent('info', 'Cache settings optimized');
  } catch (error) {
    logEvent('error', 'Failed to optimize cache settings', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-012.md: 로깅 및 모니터링 고도화 