# Step 7-029: 배포 자동화 시스템 고도화

## 1. 배포 파이프라인 시스템
### 1.1 배포 파이프라인 관리자
```typescript
// lib/deployment/pipeline-manager.ts
import { CodePipeline } from '@aws-sdk/client-codepipeline';
import { CodeBuild } from '@aws-sdk/client-codebuild';
import { ECS } from '@aws-sdk/client-ecs';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const codepipeline = new CodePipeline({ region: process.env.AWS_REGION });
const codebuild = new CodeBuild({ region: process.env.AWS_REGION });
const ecs = new ECS({ region: process.env.AWS_REGION });

interface DeploymentPipeline {
  id: string;
  timestamp: Date;
  environment: string;
  version: string;
  stages: Array<{
    name: string;
    status: 'pending' | 'in_progress' | 'succeeded' | 'failed';
    actions: Array<{
      name: string;
      type: string;
      status: 'pending' | 'in_progress' | 'succeeded' | 'failed';
      configuration: Record<string, any>;
    }>;
  }>;
}

export async function createDeploymentPipeline(
  environment: string,
  version: string
): Promise<DeploymentPipeline> {
  try {
    const pipeline: DeploymentPipeline = {
      id: uuidv4(),
      timestamp: new Date(),
      environment,
      version,
      stages: [
        {
          name: 'Source',
          status: 'pending',
          actions: [
            {
              name: 'Source',
              type: 'Source',
              status: 'pending',
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
          status: 'pending',
          actions: [
            {
              name: 'Build',
              type: 'Build',
              status: 'pending',
              configuration: {
                ProjectName: `${process.env.PROJECT_NAME}-${environment}-build`,
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
          status: 'pending',
          actions: [
            {
              name: 'UnitTest',
              type: 'Test',
              status: 'pending',
              configuration: {
                ProjectName: `${process.env.PROJECT_NAME}-${environment}-test`,
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
              type: 'Test',
              status: 'pending',
              configuration: {
                ProjectName: `${process.env.PROJECT_NAME}-${environment}-test`,
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
          status: 'pending',
          actions: [
            {
              name: 'Deploy',
              type: 'Deploy',
              status: 'pending',
              configuration: {
                ClusterName: `${process.env.PROJECT_NAME}-${environment}`,
                ServiceName: process.env.PROJECT_NAME,
                FileName: 'taskdef.json',
              },
            },
          ],
        },
      ],
    };

    // CodePipeline 생성
    await codepipeline.createPipeline({
      pipeline: {
        name: `${process.env.PROJECT_NAME}-${environment}`,
        roleArn: process.env.PIPELINE_ROLE_ARN,
        artifactStore: {
          type: 'S3',
          location: `${process.env.PROJECT_NAME}-${environment}-artifacts`,
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

    await logEvent('info', 'Deployment pipeline created', { pipeline });

    return pipeline;
  } catch (error) {
    await logEvent('error', 'Failed to create deployment pipeline', { error });
    throw error;
  }
}

export async function monitorDeploymentPipeline(
  pipeline: DeploymentPipeline
): Promise<void> {
  try {
    const execution = await codepipeline.getPipelineExecution({
      pipelineName: `${process.env.PROJECT_NAME}-${pipeline.environment}`,
      pipelineExecutionId: pipeline.id,
    });

    for (const stage of execution.pipelineExecution?.stageStates || []) {
      const pipelineStage = pipeline.stages.find(s => s.name === stage.stageName);
      if (pipelineStage) {
        pipelineStage.status = stage.latestExecution?.status?.toLowerCase() as DeploymentPipeline['stages'][0]['status'];

        for (const action of stage.actionStates || []) {
          const pipelineAction = pipelineStage.actions.find(
            a => a.name === action.actionName
          );
          if (pipelineAction) {
            pipelineAction.status = action.latestExecution?.status?.toLowerCase() as DeploymentPipeline['stages'][0]['actions'][0]['status'];
          }
        }
      }
    }

    // 배포 실패 시 알림 전송
    const failedStage = pipeline.stages.find(stage => stage.status === 'failed');
    if (failedStage) {
      await sendAlert({
        type: 'deployment_pipeline',
        title: '배포 파이프라인 실패',
        message: `${pipeline.environment} 환경의 ${failedStage.name} 단계에서 배포가 실패했습니다.`,
        severity: 'critical',
        metadata: { pipeline },
        channels: [
          {
            type: 'slack',
            target: process.env.DEPLOYMENT_ALERT_SLACK_CHANNEL!,
          },
          {
            type: 'email',
            target: process.env.DEPLOYMENT_ALERT_EMAIL!,
          },
        ],
      });
    }

    await logEvent('info', 'Deployment pipeline monitored', { pipeline });
  } catch (error) {
    await logEvent('error', 'Failed to monitor deployment pipeline', { error });
    throw error;
  }
}
```

## 2. 배포 검증 시스템
### 2.1 배포 검증 관리자
```typescript
// lib/deployment/validator.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { ECS } from '@aws-sdk/client-ecs';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });
const ecs = new ECS({ region: process.env.AWS_REGION });

interface DeploymentValidation {
  id: string;
  timestamp: Date;
  environment: string;
  version: string;
  checks: Array<{
    name: string;
    type: 'metric' | 'health' | 'task';
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

    // ECS 작업 상태 확인
    const tasks = await ecs.listTasks({
      cluster: `${process.env.PROJECT_NAME}-${environment}`,
      serviceName: process.env.PROJECT_NAME,
    });

    const taskDetails = await ecs.describeTasks({
      cluster: `${process.env.PROJECT_NAME}-${environment}`,
      tasks: tasks.taskArns || [],
    });

    validation.checks.push({
      name: 'task_status',
      type: 'task',
      status:
        taskDetails.tasks?.every(task => task.lastStatus === 'RUNNING')
          ? 'success'
          : 'failure',
      value: taskDetails.tasks?.map(task => task.lastStatus),
      message: '모든 ECS 작업이 실행 중이어야 합니다.',
    });

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
                  Name: 'ApiName',
                  Value: `${process.env.PROJECT_NAME}-${environment}`,
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

    // 검증 실패 시 알림 전송
    validation.status = validation.checks.some(check => check.status === 'failure')
      ? 'failure'
      : 'success';

    if (validation.status === 'failure') {
      await sendAlert({
        type: 'deployment_validation',
        title: '배포 검증 실패',
        message: `${environment} 환경의 ${version} 버전 배포 검증이 실패했습니다.`,
        severity: 'critical',
        metadata: { validation },
        channels: [
          {
            type: 'slack',
            target: process.env.DEPLOYMENT_ALERT_SLACK_CHANNEL!,
          },
          {
            type: 'email',
            target: process.env.DEPLOYMENT_ALERT_EMAIL!,
          },
        ],
      });
    }

    await logEvent('info', 'Deployment validation completed', { validation });

    return validation;
  } catch (error) {
    await logEvent('error', 'Failed to validate deployment', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-030.md: 모니터링 및 알림 시스템 고도화 