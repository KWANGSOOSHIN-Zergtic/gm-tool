# Step 7-023: 배포 자동화 고도화

## 1. 배포 파이프라인 시스템
### 1.1 배포 파이프라인 관리자
```typescript
// lib/deployment/pipeline-manager.ts
import { CodePipeline } from '@aws-sdk/client-codepipeline';
import { CodeBuild } from '@aws-sdk/client-codebuild';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const codepipeline = new CodePipeline({ region: process.env.AWS_REGION });
const codebuild = new CodeBuild({ region: process.env.AWS_REGION });

interface DeploymentPipeline {
  id: string;
  environment: string;
  version: string;
  stages: Array<{
    name: string;
    actions: Array<{
      name: string;
      type: string;
      configuration: Record<string, any>;
    }>;
  }>;
  artifacts: Array<{
    name: string;
    type: string;
    location: string;
  }>;
}

export async function createDeploymentPipeline(
  environment: string,
  version: string
): Promise<DeploymentPipeline> {
  try {
    const pipeline: DeploymentPipeline = {
      id: uuidv4(),
      environment,
      version,
      stages: [
        {
          name: 'Source',
          actions: [
            {
              name: 'Source',
              type: 'Source',
              configuration: {
                Owner: process.env.GITHUB_OWNER,
                Repo: process.env.GITHUB_REPO,
                Branch: environment,
                OAuthToken: process.env.GITHUB_TOKEN,
              },
            },
          ],
        },
        {
          name: 'Build',
          actions: [
            {
              name: 'Build',
              type: 'Build',
              configuration: {
                ProjectName: `gm-tool-${environment}-build`,
                EnvironmentVariables: [
                  {
                    name: 'VERSION',
                    value: version,
                  },
                ],
              },
            },
          ],
        },
        {
          name: 'Test',
          actions: [
            {
              name: 'UnitTest',
              type: 'Build',
              configuration: {
                ProjectName: `gm-tool-${environment}-test`,
                EnvironmentVariables: [
                  {
                    name: 'TEST_TYPE',
                    value: 'unit',
                  },
                ],
              },
            },
            {
              name: 'IntegrationTest',
              type: 'Build',
              configuration: {
                ProjectName: `gm-tool-${environment}-test`,
                EnvironmentVariables: [
                  {
                    name: 'TEST_TYPE',
                    value: 'integration',
                  },
                ],
              },
            },
          ],
        },
        {
          name: 'Deploy',
          actions: [
            {
              name: 'Deploy',
              type: 'Deploy',
              configuration: {
                ClusterName: `gm-tool-${environment}`,
                ServiceName: 'gm-tool',
                FileName: 'taskdef.json',
              },
            },
          ],
        },
      ],
      artifacts: [
        {
          name: 'BuildOutput',
          type: 'S3',
          location: `gm-tool-${environment}-artifacts`,
        },
      ],
    };

    // CodePipeline 생성
    await codepipeline.createPipeline({
      pipeline: {
        name: `gm-tool-${environment}`,
        roleArn: process.env.PIPELINE_ROLE_ARN,
        artifactStore: {
          type: 'S3',
          location: `gm-tool-${environment}-artifacts`,
        },
        stages: pipeline.stages.map(stage => ({
          name: stage.name,
          actions: stage.actions.map(action => ({
            name: action.name,
            actionTypeId: {
              category: action.type,
              owner: 'AWS',
              provider: 'CodeBuild',
              version: '1',
            },
            configuration: action.configuration,
            outputArtifacts: [
              {
                name: `${action.name}Output`,
              },
            ],
          })),
        })),
      },
    });

    await logEvent('info', 'Deployment pipeline created', {
      environment,
      version,
      pipeline,
    });

    return pipeline;
  } catch (error) {
    await logEvent('error', 'Failed to create deployment pipeline', { error });
    throw error;
  }
}
```

### 1.2 배포 검증기
```typescript
// lib/deployment/validator.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface DeploymentValidation {
  id: string;
  timestamp: Date;
  environment: string;
  version: string;
  checks: Array<{
    name: string;
    type: 'metric' | 'log' | 'endpoint';
    status: 'success' | 'failure';
    value: any;
    threshold?: any;
    message?: string;
  }>;
  status: 'success' | 'failure';
}

export async function validateDeployment(
  environment: string,
  version: string
): Promise<DeploymentValidation> {
  try {
    const validation: DeploymentValidation = {
      id: uuidv4(),
      timestamp: new Date(),
      environment,
      version,
      checks: [],
      status: 'success',
    };

    // 에러율 확인
    const errorRate = await cloudwatch.getMetricData({
      MetricDataQueries: [
        {
          Id: 'errors',
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
            Stat: 'Average',
          },
        },
      ],
      StartTime: new Date(Date.now() - 5 * 60 * 1000),
      EndTime: new Date(),
    });

    validation.checks.push({
      name: 'error_rate',
      type: 'metric',
      status: errorRate.MetricDataResults![0].Values![0] < 0.01 ? 'success' : 'failure',
      value: errorRate.MetricDataResults![0].Values![0],
      threshold: 0.01,
      message: '에러율이 1% 미만이어야 합니다.',
    });

    // 응답 시간 확인
    const latency = await cloudwatch.getMetricData({
      MetricDataQueries: [
        {
          Id: 'latency',
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
            Stat: 'p95',
          },
        },
      ],
      StartTime: new Date(Date.now() - 5 * 60 * 1000),
      EndTime: new Date(),
    });

    validation.checks.push({
      name: 'latency',
      type: 'metric',
      status: latency.MetricDataResults![0].Values![0] < 1000 ? 'success' : 'failure',
      value: latency.MetricDataResults![0].Values![0],
      threshold: 1000,
      message: 'P95 응답 시간이 1초 미만이어야 합니다.',
    });

    // 전체 상태 결정
    validation.status = validation.checks.some(check => check.status === 'failure')
      ? 'failure'
      : 'success';

    // 검증 실패 시 알림 발송
    if (validation.status === 'failure') {
      await sendAlert({
        type: 'deployment_validation',
        title: '배포 검증 실패',
        message: '하나 이상의 검증 항목이 실패했습니다.',
        metadata: { validation },
      });
    }

    await logEvent('info', 'Deployment validation completed', {
      environment,
      version,
      validation,
    });

    return validation;
  } catch (error) {
    await logEvent('error', 'Failed to validate deployment', { error });
    throw error;
  }
}
```

## 2. 배포 롤백 시스템
### 2.1 롤백 관리자
```typescript
// lib/deployment/rollback-manager.ts
import { ECS } from '@aws-sdk/client-ecs';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const ecs = new ECS({ region: process.env.AWS_REGION });
const dynamodb = new DynamoDB({ region: process.env.AWS_REGION });

interface RollbackPlan {
  id: string;
  environment: string;
  currentVersion: string;
  targetVersion: string;
  reason: string;
  steps: Array<{
    order: number;
    action: string;
    description: string;
    configuration: Record<string, any>;
  }>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export async function createRollbackPlan(
  environment: string,
  currentVersion: string,
  reason: string
): Promise<RollbackPlan> {
  try {
    // 이전 배포 버전 조회
    const deployments = await dynamodb.query({
      TableName: `gm-tool-${environment}-deployments`,
      IndexName: 'StatusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': { S: 'success' },
      },
      Limit: 2,
      ScanIndexForward: false,
    });

    const targetVersion = deployments.Items![1].version.S!;

    const plan: RollbackPlan = {
      id: uuidv4(),
      environment,
      currentVersion,
      targetVersion,
      reason,
      steps: [
        {
          order: 1,
          action: 'update_service',
          description: '이전 버전으로 서비스 업데이트',
          configuration: {
            cluster: `gm-tool-${environment}`,
            service: 'gm-tool',
            taskDefinition: `gm-tool-${targetVersion}`,
          },
        },
        {
          order: 2,
          action: 'verify_deployment',
          description: '롤백 배포 상태 확인',
          configuration: {
            timeout: 300,
            successThreshold: 0.9,
          },
        },
      ],
      status: 'pending',
    };

    // 롤백 계획 저장
    await dynamodb.putItem({
      TableName: `gm-tool-${environment}-rollbacks`,
      Item: {
        id: { S: plan.id },
        environment: { S: plan.environment },
        currentVersion: { S: plan.currentVersion },
        targetVersion: { S: plan.targetVersion },
        reason: { S: plan.reason },
        status: { S: plan.status },
        createdAt: { S: new Date().toISOString() },
      },
    });

    await logEvent('info', 'Rollback plan created', {
      environment,
      plan,
    });

    return plan;
  } catch (error) {
    await logEvent('error', 'Failed to create rollback plan', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-024.md: 모니터링 및 알림 고도화 