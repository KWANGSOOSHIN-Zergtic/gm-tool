# Step 7-022: 장애 복구 및 비상 대응 고도화

## 1. 장애 감지 시스템
### 1.1 장애 감지기
```typescript
// lib/emergency/detector.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface IncidentDetection {
  id: string;
  timestamp: Date;
  type: 'service_down' | 'high_error_rate' | 'resource_exhaustion' | 'data_corruption';
  severity: 'low' | 'medium' | 'high' | 'critical';
  service: string;
  description: string;
  metrics: Record<string, number>;
  affectedResources: string[];
}

export async function detectIncidents(
  environment: string
): Promise<IncidentDetection[]> {
  try {
    const incidents: IncidentDetection[] = [];
    const now = new Date();
    const startTime = new Date(now.getTime() - 5 * 60 * 1000); // 5분 전

    // 서비스 상태 확인
    const serviceMetrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        {
          Id: 'api_errors',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/ApiGateway',
              MetricName: '5XXError',
              Dimensions: [
                {
                  Name: 'Environment',
                  Value: environment,
                },
              ],
            },
            Period: 300,
            Stat: 'Sum',
          },
        },
        // 기타 메트릭...
      ],
      StartTime: startTime,
      EndTime: now,
    });

    // 에러율이 높은 경우
    const errorRate = serviceMetrics.MetricDataResults![0].Values![0] || 0;
    if (errorRate > 0.1) {
      incidents.push({
        id: uuidv4(),
        timestamp: now,
        type: 'high_error_rate',
        severity: errorRate > 0.3 ? 'critical' : 'high',
        service: 'api-gateway',
        description: `높은 에러율 감지: ${(errorRate * 100).toFixed(2)}%`,
        metrics: { errorRate },
        affectedResources: ['api-gateway'],
      });
    }

    // 심각한 장애 발생 시 알림 발송
    for (const incident of incidents) {
      if (['high', 'critical'].includes(incident.severity)) {
        await sendAlert({
          type: 'incident',
          title: `[${incident.severity.toUpperCase()}] ${incident.type} 감지`,
          message: incident.description,
          metadata: { incident },
        });
      }
    }

    await logEvent('info', 'Incident detection completed', {
      environment,
      incidentCount: incidents.length,
    });

    return incidents;
  } catch (error) {
    await logEvent('error', 'Failed to detect incidents', { error });
    throw error;
  }
}
```

### 1.2 장애 분류기
```typescript
// lib/emergency/classifier.ts
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { logEvent } from '@/lib/logging/collector';

const dynamodb = new DynamoDB({ region: process.env.AWS_REGION });

interface IncidentClassification {
  id: string;
  incidentId: string;
  timestamp: Date;
  category: string;
  rootCause: string;
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  requiredActions: string[];
  priority: number;
  estimatedResolutionTime: number;
}

export async function classifyIncident(
  environment: string,
  incident: IncidentDetection
): Promise<IncidentClassification> {
  try {
    // 과거 유사 장애 조회
    const similarIncidents = await dynamodb.query({
      TableName: `gm-tool-${environment}-incidents`,
      IndexName: 'TypeIndex',
      KeyConditionExpression: '#type = :type',
      ExpressionAttributeNames: {
        '#type': 'type',
      },
      ExpressionAttributeValues: {
        ':type': { S: incident.type },
      },
      Limit: 10,
    });

    // 장애 분류
    const classification: IncidentClassification = {
      id: uuidv4(),
      incidentId: incident.id,
      timestamp: new Date(),
      category: determineCategory(incident),
      rootCause: analyzeRootCause(incident, similarIncidents.Items || []),
      impactLevel: determineImpactLevel(incident),
      requiredActions: determineRequiredActions(incident),
      priority: calculatePriority(incident),
      estimatedResolutionTime: estimateResolutionTime(incident, similarIncidents.Items || []),
    };

    // 분류 결과 저장
    await dynamodb.putItem({
      TableName: `gm-tool-${environment}-incident-classifications`,
      Item: {
        id: { S: classification.id },
        incidentId: { S: classification.incidentId },
        timestamp: { S: classification.timestamp.toISOString() },
        category: { S: classification.category },
        rootCause: { S: classification.rootCause },
        impactLevel: { S: classification.impactLevel },
        requiredActions: { SS: classification.requiredActions },
        priority: { N: classification.priority.toString() },
        estimatedResolutionTime: { N: classification.estimatedResolutionTime.toString() },
      },
    });

    await logEvent('info', 'Incident classified', {
      incidentId: incident.id,
      classification,
    });

    return classification;
  } catch (error) {
    await logEvent('error', 'Failed to classify incident', { error });
    throw error;
  }
}
```

## 2. 장애 복구 시스템
### 2.1 복구 계획 생성기
```typescript
// lib/emergency/recovery-planner.ts
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { logEvent } from '@/lib/logging/collector';

const dynamodb = new DynamoDB({ region: process.env.AWS_REGION });

interface RecoveryPlan {
  id: string;
  incidentId: string;
  classification: IncidentClassification;
  steps: Array<{
    order: number;
    action: string;
    description: string;
    estimatedDuration: number;
    requiredResources: string[];
    rollbackProcedure?: string;
    validation: {
      type: 'metric' | 'log' | 'manual';
      criteria: string;
    };
  }>;
  estimatedTotalDuration: number;
  requiredApprovals: string[];
  risks: Array<{
    description: string;
    probability: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    mitigation: string;
  }>;
}

export async function createRecoveryPlan(
  environment: string,
  incident: IncidentDetection,
  classification: IncidentClassification
): Promise<RecoveryPlan> {
  try {
    const plan: RecoveryPlan = {
      id: uuidv4(),
      incidentId: incident.id,
      classification,
      steps: [],
      estimatedTotalDuration: 0,
      requiredApprovals: [],
      risks: [],
    };

    // 복구 단계 정의
    switch (incident.type) {
      case 'service_down':
        plan.steps = [
          {
            order: 1,
            action: 'health_check',
            description: '서비스 상태 확인 및 로그 분석',
            estimatedDuration: 5,
            requiredResources: ['logs'],
            validation: {
              type: 'log',
              criteria: 'error_pattern_analysis',
            },
          },
          {
            order: 2,
            action: 'service_restart',
            description: '서비스 재시작',
            estimatedDuration: 10,
            requiredResources: ['ecs_service'],
            rollbackProcedure: 'rollback_to_previous_version',
            validation: {
              type: 'metric',
              criteria: 'health_check_pass',
            },
          },
        ];
        break;

      case 'high_error_rate':
        plan.steps = [
          {
            order: 1,
            action: 'scale_out',
            description: '서비스 스케일 아웃',
            estimatedDuration: 15,
            requiredResources: ['ecs_service'],
            validation: {
              type: 'metric',
              criteria: 'error_rate_decrease',
            },
          },
        ];
        break;
    }

    // 총 예상 시간 계산
    plan.estimatedTotalDuration = plan.steps.reduce(
      (total, step) => total + step.estimatedDuration,
      0
    );

    // 위험 요소 정의
    plan.risks = [
      {
        description: '서비스 재시작 중 일시적인 서비스 중단',
        probability: 'high',
        impact: 'medium',
        mitigation: '무중단 배포 전략 사용',
      },
    ];

    // 승인자 정의
    if (['high', 'critical'].includes(incident.severity)) {
      plan.requiredApprovals.push('system_admin', 'service_owner');
    }

    await logEvent('info', 'Recovery plan created', {
      incidentId: incident.id,
      plan,
    });

    return plan;
  } catch (error) {
    await logEvent('error', 'Failed to create recovery plan', { error });
    throw error;
  }
}
```

### 2.2 복구 실행기
```typescript
// lib/emergency/recovery-executor.ts
import { ECS } from '@aws-sdk/client-ecs';
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const ecs = new ECS({ region: process.env.AWS_REGION });
const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface RecoveryExecution {
  id: string;
  planId: string;
  startTime: Date;
  endTime?: Date;
  status: 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  steps: Array<{
    order: number;
    action: string;
    startTime: Date;
    endTime?: Date;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    output?: string;
  }>;
  metrics: Record<string, number>;
}

export async function executeRecoveryPlan(
  environment: string,
  plan: RecoveryPlan
): Promise<RecoveryExecution> {
  try {
    const execution: RecoveryExecution = {
      id: uuidv4(),
      planId: plan.id,
      startTime: new Date(),
      status: 'in_progress',
      steps: plan.steps.map(step => ({
        order: step.order,
        action: step.action,
        startTime: new Date(),
        status: 'pending',
      })),
      metrics: {},
    };

    // 각 복구 단계 실행
    for (const step of execution.steps) {
      step.status = 'in_progress';
      
      try {
        switch (step.action) {
          case 'health_check':
            // 서비스 상태 확인
            const healthCheck = await checkServiceHealth(environment);
            step.output = JSON.stringify(healthCheck);
            break;

          case 'service_restart':
            // 서비스 재시작
            await restartService(environment);
            break;

          case 'scale_out':
            // 스케일 아웃
            await scaleOutService(environment);
            break;
        }

        step.status = 'completed';
      } catch (error) {
        step.status = 'failed';
        execution.status = 'failed';
        
        // 실패 시 알림 발송
        await sendAlert({
          type: 'recovery_failed',
          title: `복구 단계 실패: ${step.action}`,
          message: error.message,
          metadata: { execution, error },
        });

        break;
      }

      step.endTime = new Date();
    }

    if (execution.status !== 'failed') {
      execution.status = 'completed';
      execution.endTime = new Date();

      // 복구 완료 알림
      await sendAlert({
        type: 'recovery_completed',
        title: '복구 계획 실행 완료',
        message: `모든 복구 단계가 성공적으로 완료되었습니다.`,
        metadata: { execution },
      });
    }

    await logEvent('info', 'Recovery plan executed', {
      planId: plan.id,
      execution,
    });

    return execution;
  } catch (error) {
    await logEvent('error', 'Failed to execute recovery plan', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-023.md: 배포 자동화 고도화 