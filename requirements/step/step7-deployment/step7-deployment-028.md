# Step 7-028: 장애 복구 시스템 고도화

## 1. 장애 감지 시스템
### 1.1 장애 감지기
```typescript
// lib/recovery/detector.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { Route53 } from '@aws-sdk/client-route-53';
import { ECS } from '@aws-sdk/client-ecs';
import { RDS } from '@aws-sdk/client-rds';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });
const route53 = new Route53({ region: process.env.AWS_REGION });
const ecs = new ECS({ region: process.env.AWS_REGION });
const rds = new RDS({ region: process.env.AWS_REGION });

interface IncidentDetection {
  id: string;
  timestamp: Date;
  type: 'service' | 'database' | 'network';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'detected' | 'investigating' | 'mitigating' | 'resolved';
  service: string;
  description: string;
  metrics: Record<string, any>;
  affectedComponents: string[];
}

export async function detectIncidents(): Promise<IncidentDetection[]> {
  try {
    const incidents: IncidentDetection[] = [];

    // ECS 서비스 상태 확인
    const services = await ecs.describeServices({
      cluster: process.env.ECS_CLUSTER_NAME,
      services: [process.env.ECS_SERVICE_NAME!],
    });

    for (const service of services.services || []) {
      if (service.runningCount! < service.desiredCount!) {
        incidents.push({
          id: uuidv4(),
          timestamp: new Date(),
          type: 'service',
          severity: 'high',
          status: 'detected',
          service: service.serviceName!,
          description: `Service ${service.serviceName} has ${service.runningCount} running tasks out of ${service.desiredCount} desired tasks`,
          metrics: {
            runningCount: service.runningCount,
            desiredCount: service.desiredCount,
          },
          affectedComponents: ['application'],
        });
      }
    }

    // RDS 인스턴스 상태 확인
    const dbInstances = await rds.describeDBInstances({
      DBInstanceIdentifier: process.env.DB_INSTANCE_ID,
    });

    for (const instance of dbInstances.DBInstances || []) {
      if (instance.DBInstanceStatus !== 'available') {
        incidents.push({
          id: uuidv4(),
          timestamp: new Date(),
          type: 'database',
          severity: 'critical',
          status: 'detected',
          service: instance.DBInstanceIdentifier!,
          description: `Database instance ${instance.DBInstanceIdentifier} is in ${instance.DBInstanceStatus} state`,
          metrics: {
            status: instance.DBInstanceStatus,
            endpoint: instance.Endpoint?.Address,
          },
          affectedComponents: ['database'],
        });
      }
    }

    // Route53 헬스 체크 상태 확인
    const healthChecks = await route53.listHealthChecks({});

    for (const check of healthChecks.HealthChecks || []) {
      const status = await route53.getHealthCheckStatus({
        HealthCheckId: check.Id!,
      });

      const unhealthyChecks = status.HealthCheckObservations?.filter(
        obs => !obs.StatusReport?.Status?.includes('Success')
      );

      if (unhealthyChecks && unhealthyChecks.length > 0) {
        incidents.push({
          id: uuidv4(),
          timestamp: new Date(),
          type: 'network',
          severity: 'high',
          status: 'detected',
          service: check.HealthCheckConfig?.FullyQualifiedDomainName || 'unknown',
          description: `Health check failed for ${check.HealthCheckConfig?.FullyQualifiedDomainName}`,
          metrics: {
            failedChecks: unhealthyChecks.length,
            totalChecks: status.HealthCheckObservations?.length,
          },
          affectedComponents: ['network'],
        });
      }
    }

    // 장애 감지 시 알림 전송
    for (const incident of incidents) {
      await sendAlert({
        type: 'incident_detection',
        title: `[${incident.severity.toUpperCase()}] ${incident.type} Incident Detected`,
        message: incident.description,
        severity: incident.severity,
        metadata: { incident },
        channels: [
          {
            type: 'slack',
            target: process.env.INCIDENT_ALERT_SLACK_CHANNEL!,
          },
          {
            type: 'email',
            target: process.env.INCIDENT_ALERT_EMAIL!,
          },
        ],
      });
    }

    await logEvent('info', 'Incident detection completed', { incidents });

    return incidents;
  } catch (error) {
    await logEvent('error', 'Failed to detect incidents', { error });
    throw error;
  }
}
```

## 2. 장애 복구 시스템
### 2.1 복구 관리자
```typescript
// lib/recovery/manager.ts
import { ECS } from '@aws-sdk/client-ecs';
import { RDS } from '@aws-sdk/client-rds';
import { Route53 } from '@aws-sdk/client-route-53';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const ecs = new ECS({ region: process.env.AWS_REGION });
const rds = new RDS({ region: process.env.AWS_REGION });
const route53 = new Route53({ region: process.env.AWS_REGION });

interface RecoveryPlan {
  id: string;
  timestamp: Date;
  incident: IncidentDetection;
  steps: Array<{
    order: number;
    action: string;
    service: string;
    parameters: Record<string, any>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
  }>;
  status: 'created' | 'executing' | 'completed' | 'failed';
}

export async function createRecoveryPlan(
  incident: IncidentDetection
): Promise<RecoveryPlan> {
  try {
    const plan: RecoveryPlan = {
      id: uuidv4(),
      timestamp: new Date(),
      incident,
      steps: [],
      status: 'created',
    };

    switch (incident.type) {
      case 'service':
        plan.steps = [
          {
            order: 1,
            action: 'restart_service',
            service: incident.service,
            parameters: {
              cluster: process.env.ECS_CLUSTER_NAME,
              service: incident.service,
            },
            status: 'pending',
          },
          {
            order: 2,
            action: 'verify_service',
            service: incident.service,
            parameters: {
              cluster: process.env.ECS_CLUSTER_NAME,
              service: incident.service,
              desiredCount: incident.metrics.desiredCount,
            },
            status: 'pending',
          },
        ];
        break;

      case 'database':
        plan.steps = [
          {
            order: 1,
            action: 'failover_database',
            service: incident.service,
            parameters: {
              dbInstanceIdentifier: incident.service,
            },
            status: 'pending',
          },
          {
            order: 2,
            action: 'verify_database',
            service: incident.service,
            parameters: {
              dbInstanceIdentifier: incident.service,
            },
            status: 'pending',
          },
        ];
        break;

      case 'network':
        plan.steps = [
          {
            order: 1,
            action: 'update_dns',
            service: incident.service,
            parameters: {
              domainName: incident.service,
              healthCheckId: incident.metrics.healthCheckId,
            },
            status: 'pending',
          },
          {
            order: 2,
            action: 'verify_dns',
            service: incident.service,
            parameters: {
              domainName: incident.service,
            },
            status: 'pending',
          },
        ];
        break;
    }

    await logEvent('info', 'Recovery plan created', { plan });

    return plan;
  } catch (error) {
    await logEvent('error', 'Failed to create recovery plan', { error });
    throw error;
  }
}

export async function executeRecoveryPlan(plan: RecoveryPlan): Promise<void> {
  try {
    plan.status = 'executing';

    for (const step of plan.steps) {
      step.status = 'in_progress';

      switch (step.action) {
        case 'restart_service':
          await ecs.updateService({
            cluster: step.parameters.cluster,
            service: step.parameters.service,
            forceNewDeployment: true,
          });
          break;

        case 'failover_database':
          await rds.rebootDBInstance({
            DBInstanceIdentifier: step.parameters.dbInstanceIdentifier,
            ForceFailover: true,
          });
          break;

        case 'update_dns':
          await route53.changeResourceRecordSets({
            HostedZoneId: process.env.ROUTE53_HOSTED_ZONE_ID!,
            ChangeBatch: {
              Changes: [
                {
                  Action: 'UPSERT',
                  ResourceRecordSet: {
                    Name: step.parameters.domainName,
                    Type: 'A',
                    AliasTarget: {
                      HostedZoneId: process.env.ROUTE53_HOSTED_ZONE_ID!,
                      DNSName: process.env.BACKUP_ENDPOINT!,
                      EvaluateTargetHealth: true,
                    },
                  },
                },
              ],
            },
          });
          break;
      }

      step.status = 'completed';
    }

    plan.status = 'completed';

    await sendAlert({
      type: 'recovery_execution',
      title: '복구 계획 실행 완료',
      message: `Incident ${plan.incident.id}에 대한 복구 계획이 성공적으로 실행되었습니다.`,
      severity: 'info',
      metadata: { plan },
      channels: [
        {
          type: 'slack',
          target: process.env.INCIDENT_ALERT_SLACK_CHANNEL!,
        },
        {
          type: 'email',
          target: process.env.INCIDENT_ALERT_EMAIL!,
        },
      ],
    });

    await logEvent('info', 'Recovery plan executed', { plan });
  } catch (error) {
    plan.status = 'failed';
    await logEvent('error', 'Failed to execute recovery plan', { error, plan });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-029.md: 배포 자동화 시스템 고도화 