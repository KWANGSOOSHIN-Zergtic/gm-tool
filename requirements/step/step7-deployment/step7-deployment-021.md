# Step 7-021: 성능 모니터링 및 최적화 고도화

## 1. 성능 모니터링 시스템
### 1.1 성능 메트릭 수집기
```typescript
// lib/performance/collector.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { Datadog } from '@aws-sdk/client-datadog';
import { logEvent } from '@/lib/logging/collector';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });
const datadog = new Datadog({ region: process.env.AWS_REGION });

interface PerformanceMetrics {
  application: {
    responseTime: {
      p50: number;
      p90: number;
      p99: number;
    };
    errorRate: number;
    throughput: number;
    concurrentUsers: number;
  };
  database: {
    queryTime: {
      p50: number;
      p90: number;
      p99: number;
    };
    connections: number;
    deadlocks: number;
    slowQueries: number;
  };
  cache: {
    hitRate: number;
    missRate: number;
    evictions: number;
    memory: {
      used: number;
      available: number;
    };
  };
  resources: {
    cpu: {
      usage: number;
      throttling: number;
    };
    memory: {
      used: number;
      available: number;
      swap: number;
    };
    disk: {
      iops: number;
      latency: number;
      throughput: number;
    };
  };
}

export async function collectPerformanceMetrics(
  environment: string,
  startTime: Date,
  endTime: Date
): Promise<PerformanceMetrics> {
  try {
    // CloudWatch에서 메트릭 수집
    const cwMetrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        {
          Id: 'api_latency_p50',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApiGateway',
              MetricName: 'Latency',
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

    // Datadog에서 추가 메트릭 수집
    const ddMetrics = await datadog.queryMetrics({
      query: `avg:system.cpu.user{env:${environment}}`,
      from: Math.floor(startTime.getTime() / 1000),
      to: Math.floor(endTime.getTime() / 1000),
    });

    const metrics: PerformanceMetrics = {
      application: {
        responseTime: {
          p50: cwMetrics.MetricDataResults![0].Values![0] || 0,
          p90: cwMetrics.MetricDataResults![1].Values![0] || 0,
          p99: cwMetrics.MetricDataResults![2].Values![0] || 0,
        },
        errorRate: cwMetrics.MetricDataResults![3].Values![0] || 0,
        throughput: cwMetrics.MetricDataResults![4].Values![0] || 0,
        concurrentUsers: cwMetrics.MetricDataResults![5].Values![0] || 0,
      },
      database: {
        queryTime: {
          p50: cwMetrics.MetricDataResults![6].Values![0] || 0,
          p90: cwMetrics.MetricDataResults![7].Values![0] || 0,
          p99: cwMetrics.MetricDataResults![8].Values![0] || 0,
        },
        connections: cwMetrics.MetricDataResults![9].Values![0] || 0,
        deadlocks: cwMetrics.MetricDataResults![10].Values![0] || 0,
        slowQueries: cwMetrics.MetricDataResults![11].Values![0] || 0,
      },
      cache: {
        hitRate: cwMetrics.MetricDataResults![12].Values![0] || 0,
        missRate: cwMetrics.MetricDataResults![13].Values![0] || 0,
        evictions: cwMetrics.MetricDataResults![14].Values![0] || 0,
        memory: {
          used: cwMetrics.MetricDataResults![15].Values![0] || 0,
          available: cwMetrics.MetricDataResults![16].Values![0] || 0,
        },
      },
      resources: {
        cpu: {
          usage: ddMetrics.series[0].pointlist[0][1] || 0,
          throttling: ddMetrics.series[1].pointlist[0][1] || 0,
        },
        memory: {
          used: ddMetrics.series[2].pointlist[0][1] || 0,
          available: ddMetrics.series[3].pointlist[0][1] || 0,
          swap: ddMetrics.series[4].pointlist[0][1] || 0,
        },
        disk: {
          iops: ddMetrics.series[5].pointlist[0][1] || 0,
          latency: ddMetrics.series[6].pointlist[0][1] || 0,
          throughput: ddMetrics.series[7].pointlist[0][1] || 0,
        },
      },
    };

    await logEvent('info', 'Performance metrics collected', {
      environment,
      metrics,
    });

    return metrics;
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
import { sendAlert } from '@/lib/monitoring/alert-router';

interface PerformanceAnalysis {
  status: 'healthy' | 'warning' | 'critical';
  issues: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    metrics: Record<string, number>;
    recommendation: string;
  }>;
  recommendations: Array<{
    type: string;
    priority: 'low' | 'medium' | 'high';
    description: string;
    impact: string;
    effort: string;
  }>;
}

export async function analyzePerformance(
  environment: string,
  metrics: PerformanceMetrics
): Promise<PerformanceAnalysis> {
  try {
    const analysis: PerformanceAnalysis = {
      status: 'healthy',
      issues: [],
      recommendations: [],
    };

    // API 응답 시간 분석
    if (metrics.application.responseTime.p99 > 1000) {
      analysis.issues.push({
        type: 'high_latency',
        severity: 'high',
        description: 'API 응답 시간이 너무 높습니다.',
        metrics: {
          p99: metrics.application.responseTime.p99,
          p90: metrics.application.responseTime.p90,
          p50: metrics.application.responseTime.p50,
        },
        recommendation: '캐싱 전략을 검토하고 데이터베이스 쿼리를 최적화하세요.',
      });
    }

    // 데이터베이스 성능 분석
    if (metrics.database.queryTime.p90 > 500) {
      analysis.issues.push({
        type: 'slow_queries',
        severity: 'medium',
        description: '데이터베이스 쿼리 시간이 높습니다.',
        metrics: {
          queryTime: metrics.database.queryTime.p90,
          slowQueries: metrics.database.slowQueries,
        },
        recommendation: '인덱스를 검토하고 쿼리 실행 계획을 분석하세요.',
      });
    }

    // 캐시 성능 분석
    if (metrics.cache.hitRate < 0.8) {
      analysis.issues.push({
        type: 'low_cache_hit_rate',
        severity: 'medium',
        description: '캐시 히트율이 낮습니다.',
        metrics: {
          hitRate: metrics.cache.hitRate,
          missRate: metrics.cache.missRate,
        },
        recommendation: '캐시 키 설계를 검토하고 TTL 설정을 조정하세요.',
      });
    }

    // 리소스 사용량 분석
    if (metrics.resources.cpu.usage > 80) {
      analysis.issues.push({
        type: 'high_cpu_usage',
        severity: 'high',
        description: 'CPU 사용률이 높습니다.',
        metrics: {
          usage: metrics.resources.cpu.usage,
          throttling: metrics.resources.cpu.throttling,
        },
        recommendation: '컨테이너 리소스 제한을 조정하거나 스케일 아웃을 고려하세요.',
      });
    }

    // 분석 결과에 따른 상태 결정
    analysis.status = analysis.issues.some(i => i.severity === 'high')
      ? 'critical'
      : analysis.issues.some(i => i.severity === 'medium')
      ? 'warning'
      : 'healthy';

    // 심각한 이슈가 있는 경우 알림 발송
    if (analysis.status !== 'healthy') {
      await sendAlert({
        type: analysis.status,
        title: '성능 이슈 발견',
        message: `${analysis.issues.length}개의 성능 이슈가 발견되었습니다.`,
        metadata: { analysis },
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

## 2. 성능 최적화
### 2.1 캐시 최적화 관리자
```typescript
// lib/performance/cache-optimizer.ts
import { ElastiCache } from '@aws-sdk/client-elasticache';
import { CloudFront } from '@aws-sdk/client-cloudfront';
import { logEvent } from '@/lib/logging/collector';

const elasticache = new ElastiCache({ region: process.env.AWS_REGION });
const cloudfront = new CloudFront({ region: process.env.AWS_REGION });

interface CacheOptimizationConfig {
  redis: {
    maxmemoryPolicy: string;
    maxmemorySamples: number;
    keyspaceHits: number;
    keyspaceMisses: number;
  };
  cdn: {
    defaultTTL: number;
    maxTTL: number;
    minTTL: number;
    queryStringWhitelist: string[];
  };
}

export async function optimizeCache(
  environment: string,
  metrics: PerformanceMetrics,
  config: CacheOptimizationConfig
) {
  try {
    // Redis 설정 최적화
    if (metrics.cache.hitRate < 0.8) {
      await elasticache.modifyCacheParameterGroup({
        CacheParameterGroupName: `${environment}-redis-params`,
        ParameterNameValues: [
          {
            ParameterName: 'maxmemory-policy',
            ParameterValue: config.redis.maxmemoryPolicy,
          },
          {
            ParameterName: 'maxmemory-samples',
            ParameterValue: config.redis.maxmemorySamples.toString(),
          },
        ],
      });
    }

    // CloudFront 설정 최적화
    const distributions = await cloudfront.listDistributions({});
    
    for (const distribution of distributions.DistributionList!.Items!) {
      if (distribution.Tags!.Items!.some(tag => 
        tag.Key === 'Environment' && tag.Value === environment
      )) {
        await cloudfront.updateDistribution({
          Id: distribution.Id!,
          DistributionConfig: {
            ...distribution.DistributionConfig!,
            DefaultCacheBehavior: {
              ...distribution.DistributionConfig!.DefaultCacheBehavior!,
              DefaultTTL: config.cdn.defaultTTL,
              MaxTTL: config.cdn.maxTTL,
              MinTTL: config.cdn.minTTL,
              ForwardedValues: {
                QueryString: true,
                QueryStringCacheKeys: {
                  Quantity: config.cdn.queryStringWhitelist.length,
                  Items: config.cdn.queryStringWhitelist,
                },
              },
            },
          },
        });
      }
    }

    await logEvent('info', 'Cache optimization completed', {
      environment,
      config,
    });
  } catch (error) {
    await logEvent('error', 'Failed to optimize cache', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-022.md: 장애 복구 및 비상 대응 고도화 