# Step 7-017: 성능 최적화 및 스케일링 자동화

## 1. 성능 모니터링 자동화
### 1.1 성능 메트릭 수집
```typescript
// lib/performance/collector.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/collector';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface PerformanceMetrics {
  api: {
    responseTime: {
      p50: number;
      p90: number;
      p99: number;
    };
    errorRate: number;
    requestCount: number;
  };
  database: {
    queryTime: {
      p50: number;
      p90: number;
      p99: number;
    };
    connectionCount: number;
    deadlockCount: number;
  };
  cache: {
    hitRate: number;
    missRate: number;
    evictionCount: number;
  };
}

export async function collectPerformanceMetrics(
  environment: string,
  startTime: Date,
  endTime: Date
): Promise<PerformanceMetrics> {
  try {
    const metrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        // API 응답 시간
        {
          Id: 'api_response_p50',
          MetricStat: {
            Metric: {
              Namespace: 'GMTool/API',
              MetricName: 'ResponseTime',
              Dimensions: [
                {
                  Name: 'Environment',
                  Value: environment,
                },
              ],
            },
            Period: 300,
            Stat: 'p50',
          },
        },
        // 기타 메트릭...
      ],
      StartTime: startTime,
      EndTime: endTime,
    });

    const performanceMetrics: PerformanceMetrics = {
      api: {
        responseTime: {
          p50: metrics.MetricDataResults![0].Values![0] || 0,
          p90: metrics.MetricDataResults![1].Values![0] || 0,
          p99: metrics.MetricDataResults![2].Values![0] || 0,
        },
        errorRate: metrics.MetricDataResults![3].Values![0] || 0,
        requestCount: metrics.MetricDataResults![4].Values![0] || 0,
      },
      database: {
        queryTime: {
          p50: metrics.MetricDataResults![5].Values![0] || 0,
          p90: metrics.MetricDataResults![6].Values![0] || 0,
          p99: metrics.MetricDataResults![7].Values![0] || 0,
        },
        connectionCount: metrics.MetricDataResults![8].Values![0] || 0,
        deadlockCount: metrics.MetricDataResults![9].Values![0] || 0,
      },
      cache: {
        hitRate: metrics.MetricDataResults![10].Values![0] || 0,
        missRate: metrics.MetricDataResults![11].Values![0] || 0,
        evictionCount: metrics.MetricDataResults![12].Values![0] || 0,
      },
    };

    await logEvent('info', 'Performance metrics collected', {
      environment,
      metrics: performanceMetrics,
    });

    return performanceMetrics;
  } catch (error) {
    await logEvent('error', 'Failed to collect performance metrics', { error });
    throw error;
  }
}
```

### 1.2 성능 분석기
```typescript
// lib/performance/analyzer.ts
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/notifications';

interface PerformanceAnalysis {
  status: 'healthy' | 'warning' | 'critical';
  issues: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    recommendation: string;
  }>;
  recommendations: Array<{
    type: string;
    action: string;
    impact: 'low' | 'medium' | 'high';
    effort: 'low' | 'medium' | 'high';
  }>;
}

export async function analyzePerformance(
  environment: string,
  metrics: PerformanceMetrics
): Promise<PerformanceAnalysis> {
  try {
    const issues = [];
    const recommendations = [];

    // API 성능 분석
    if (metrics.api.responseTime.p99 > 1000) {
      issues.push({
        type: 'api_latency',
        severity: 'high',
        description: 'API 응답 시간이 너무 높습니다.',
        recommendation: 'API 엔드포인트 최적화 및 캐싱 검토가 필요합니다.',
      });
    }

    // 데이터베이스 성능 분석
    if (metrics.database.queryTime.p90 > 500) {
      issues.push({
        type: 'db_latency',
        severity: 'medium',
        description: '데이터베이스 쿼리 시간이 높습니다.',
        recommendation: '쿼리 최적화 및 인덱스 검토가 필요합니다.',
      });
    }

    // 캐시 성능 분석
    if (metrics.cache.hitRate < 0.8) {
      issues.push({
        type: 'cache_miss',
        severity: 'low',
        description: '캐시 히트율이 낮습니다.',
        recommendation: '캐시 전략 검토가 필요합니다.',
      });
    }

    const analysis: PerformanceAnalysis = {
      status: issues.some(i => i.severity === 'high')
        ? 'critical'
        : issues.some(i => i.severity === 'medium')
        ? 'warning'
        : 'healthy',
      issues,
      recommendations,
    };

    if (analysis.status !== 'healthy') {
      await sendAlert({
        type: analysis.status,
        title: '성능 이슈 발견',
        message: `${issues.length}개의 성능 이슈가 발견되었습니다.`,
        metadata: { analysis },
        channels: { slack: true, email: true },
      });
    }

    await logEvent('info', 'Performance analysis completed', { analysis });
    return analysis;
  } catch (error) {
    await logEvent('error', 'Failed to analyze performance', { error });
    throw error;
  }
}
```

## 2. 자동 스케일링 관리
### 2.1 ECS 서비스 스케일링
```typescript
// lib/scaling/ecs-scaler.ts
import { ECS } from '@aws-sdk/client-ecs';
import { ApplicationAutoScaling } from '@aws-sdk/client-application-auto-scaling';
import { logEvent } from '@/lib/logging/collector';

const ecs = new ECS({ region: process.env.AWS_REGION });
const autoScaling = new ApplicationAutoScaling({ region: process.env.AWS_REGION });

interface ScalingPolicy {
  targetMetric: string;
  targetValue: number;
  scaleOutCooldown: number;
  scaleInCooldown: number;
  minCapacity: number;
  maxCapacity: number;
}

export async function configureServiceAutoScaling(
  environment: string,
  serviceName: string,
  policy: ScalingPolicy
) {
  try {
    // 서비스 ARN 가져오기
    const services = await ecs.describeServices({
      cluster: `gm-tool-${environment}`,
      services: [serviceName],
    });

    const serviceArn = services.services![0].serviceArn!;

    // 스케일링 타겟 등록
    await autoScaling.registerScalableTarget({
      ServiceNamespace: 'ecs',
      ResourceId: `service/gm-tool-${environment}/${serviceName}`,
      ScalableDimension: 'ecs:service:DesiredCount',
      MinCapacity: policy.minCapacity,
      MaxCapacity: policy.maxCapacity,
    });

    // 스케일링 정책 설정
    await autoScaling.putScalingPolicy({
      PolicyName: `${serviceName}-target-tracking`,
      ServiceNamespace: 'ecs',
      ResourceId: `service/gm-tool-${environment}/${serviceName}`,
      ScalableDimension: 'ecs:service:DesiredCount',
      PolicyType: 'TargetTrackingScaling',
      TargetTrackingScalingPolicyConfiguration: {
        TargetValue: policy.targetValue,
        PredefinedMetricSpecification: {
          PredefinedMetricType: policy.targetMetric,
        },
        ScaleOutCooldown: policy.scaleOutCooldown,
        ScaleInCooldown: policy.scaleInCooldown,
      },
    });

    await logEvent('info', 'Service auto scaling configured', {
      environment,
      serviceName,
      policy,
    });
  } catch (error) {
    await logEvent('error', 'Failed to configure service auto scaling', { error });
    throw error;
  }
}
```

### 2.2 RDS 스케일링
```typescript
// lib/scaling/rds-scaler.ts
import { RDS } from '@aws-sdk/client-rds';
import { logEvent } from '@/lib/logging/collector';

const rds = new RDS({ region: process.env.AWS_REGION });

interface DBScalingConfig {
  instanceClass: string;
  allocatedStorage: number;
  maxAllocatedStorage: number;
  autoScaleStorage: boolean;
}

export async function configureDBScaling(
  environment: string,
  config: DBScalingConfig
) {
  try {
    const dbInstanceId = `gm-tool-${environment}`;

    // 인스턴스 클래스 수정
    await rds.modifyDBInstance({
      DBInstanceIdentifier: dbInstanceId,
      DBInstanceClass: config.instanceClass,
      AllocatedStorage: config.allocatedStorage,
      MaxAllocatedStorage: config.autoScaleStorage
        ? config.maxAllocatedStorage
        : undefined,
      ApplyImmediately: false,
    });

    await logEvent('info', 'Database scaling configured', {
      environment,
      config,
    });
  } catch (error) {
    await logEvent('error', 'Failed to configure database scaling', { error });
    throw error;
  }
}
```

## 3. 성능 최적화 자동화
### 3.1 캐시 최적화
```typescript
// lib/optimization/cache-optimizer.ts
import { ElastiCache } from '@aws-sdk/client-elasticache';
import { logEvent } from '@/lib/logging/collector';

const elasticache = new ElastiCache({ region: process.env.AWS_REGION });

interface CacheOptimizationConfig {
  maxMemoryPolicy: string;
  maxMemoryPercent: number;
  evictionPolicy: string;
}

export async function optimizeCacheSettings(
  environment: string,
  config: CacheOptimizationConfig
) {
  try {
    const clusterName = `gm-tool-${environment}`;

    // 캐시 파라미터 그룹 수정
    await elasticache.modifyCacheParameterGroup({
      CacheParameterGroupName: `${clusterName}-params`,
      ParameterNameValues: [
        {
          ParameterName: 'maxmemory-policy',
          ParameterValue: config.maxMemoryPolicy,
        },
        {
          ParameterName: 'maxmemory-percent',
          ParameterValue: config.maxMemoryPercent.toString(),
        },
      ],
    });

    await logEvent('info', 'Cache settings optimized', {
      environment,
      config,
    });
  } catch (error) {
    await logEvent('error', 'Failed to optimize cache settings', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-018.md: 모니터링 및 알림 고도화 