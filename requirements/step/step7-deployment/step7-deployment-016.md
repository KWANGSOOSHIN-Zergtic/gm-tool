# Step 7-016: 보안 및 규정 준수 자동화

## 1. 보안 설정 자동화
### 1.1 보안 그룹 설정
```typescript
// lib/security/security-groups.ts
import { EC2 } from '@aws-sdk/client-ec2';
import { logEvent } from '@/lib/logging/collector';

const ec2 = new EC2({ region: process.env.AWS_REGION });

interface SecurityGroupRule {
  protocol: string;
  fromPort: number;
  toPort: number;
  cidrIp: string;
  description: string;
}

export async function updateSecurityGroups(
  environment: string,
  rules: SecurityGroupRule[]
) {
  try {
    const securityGroups = await ec2.describeSecurityGroups({
      Filters: [
        {
          Name: 'tag:Environment',
          Values: [environment],
        },
        {
          Name: 'tag:Project',
          Values: ['gm-tool'],
        },
      ],
    });

    for (const group of securityGroups.SecurityGroups!) {
      // 기존 규칙 제거
      if (group.IpPermissions!.length > 0) {
        await ec2.revokeSecurityGroupIngress({
          GroupId: group.GroupId,
          IpPermissions: group.IpPermissions,
        });
      }

      // 새 규칙 추가
      await ec2.authorizeSecurityGroupIngress({
        GroupId: group.GroupId,
        IpPermissions: rules.map(rule => ({
          IpProtocol: rule.protocol,
          FromPort: rule.fromPort,
          ToPort: rule.toPort,
          IpRanges: [
            {
              CidrIp: rule.cidrIp,
              Description: rule.description,
            },
          ],
        })),
      });
    }

    await logEvent('info', 'Security groups updated', {
      environment,
      ruleCount: rules.length,
    });
  } catch (error) {
    await logEvent('error', 'Failed to update security groups', { error });
    throw error;
  }
}
```

### 1.2 IAM 정책 관리
```typescript
// lib/security/iam-policies.ts
import { IAM } from '@aws-sdk/client-iam';
import { logEvent } from '@/lib/logging/collector';

const iam = new IAM({ region: process.env.AWS_REGION });

interface PolicyDocument {
  Version: string;
  Statement: Array<{
    Effect: 'Allow' | 'Deny';
    Action: string[];
    Resource: string[];
    Condition?: Record<string, any>;
  }>;
}

export async function updateServicePolicies(
  environment: string,
  policies: Record<string, PolicyDocument>
) {
  try {
    for (const [name, document] of Object.entries(policies)) {
      const policyName = `gm-tool-${environment}-${name}`;
      
      // 기존 정책 검색
      const existingPolicies = await iam.listPolicies({
        Scope: 'Local',
        PathPrefix: `/gm-tool/${environment}/`,
      });

      const existingPolicy = existingPolicies.Policies!.find(
        p => p.PolicyName === policyName
      );

      if (existingPolicy) {
        // 정책 업데이트
        await iam.createPolicyVersion({
          PolicyArn: existingPolicy.Arn,
          PolicyDocument: JSON.stringify(document),
          SetAsDefault: true,
        });

        // 이전 버전 정리
        const versions = await iam.listPolicyVersions({
          PolicyArn: existingPolicy.Arn,
        });

        for (const version of versions.Versions!) {
          if (!version.IsDefaultVersion) {
            await iam.deletePolicyVersion({
              PolicyArn: existingPolicy.Arn,
              VersionId: version.VersionId,
            });
          }
        }
      } else {
        // 새 정책 생성
        await iam.createPolicy({
          PolicyName: policyName,
          Path: `/gm-tool/${environment}/`,
          PolicyDocument: JSON.stringify(document),
        });
      }
    }

    await logEvent('info', 'Service policies updated', {
      environment,
      policyCount: Object.keys(policies).length,
    });
  } catch (error) {
    await logEvent('error', 'Failed to update service policies', { error });
    throw error;
  }
}
```

## 2. 규정 준수 자동화
### 2.1 규정 준수 검사
```typescript
// lib/compliance/checker.ts
import { ConfigService } from '@aws-sdk/client-config-service';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/notifications';

const config = new ConfigService({ region: process.env.AWS_REGION });

interface ComplianceRule {
  name: string;
  description: string;
  scope: {
    resourceTypes: string[];
    tags?: Record<string, string>;
  };
  parameters?: Record<string, string>;
}

export async function checkCompliance(
  environment: string,
  rules: ComplianceRule[]
) {
  try {
    for (const rule of rules) {
      // AWS Config 규칙 생성 또는 업데이트
      await config.putConfigRule({
        ConfigRule: {
          ConfigRuleName: `gm-tool-${environment}-${rule.name}`,
          Description: rule.description,
          Scope: {
            ComplianceResourceTypes: rule.scope.resourceTypes,
          },
          Source: {
            Owner: 'AWS',
            SourceIdentifier: rule.name,
          },
          InputParameters: rule.parameters
            ? JSON.stringify(rule.parameters)
            : undefined,
        },
      });
    }

    // 규정 준수 상태 확인
    const evaluations = await config.getComplianceDetailsByConfigRule({
      ConfigRuleName: rules.map(r => `gm-tool-${environment}-${r.name}`),
    });

    const nonCompliantResources = evaluations.EvaluationResults!.filter(
      e => e.ComplianceType === 'NON_COMPLIANT'
    );

    if (nonCompliantResources.length > 0) {
      await sendAlert({
        type: 'warning',
        title: '규정 준수 위반 발견',
        message: `${nonCompliantResources.length}개의 리소스가 규정을 준수하지 않습니다.`,
        metadata: { resources: nonCompliantResources },
        channels: { slack: true, email: true },
      });
    }

    await logEvent('info', 'Compliance check completed', {
      environment,
      ruleCount: rules.length,
      nonCompliantCount: nonCompliantResources.length,
    });

    return nonCompliantResources;
  } catch (error) {
    await logEvent('error', 'Failed to check compliance', { error });
    throw error;
  }
}
```

### 2.2 규정 준수 보고서
```typescript
// lib/compliance/reporter.ts
import { S3 } from '@aws-sdk/client-s3';
import { logEvent } from '@/lib/logging/collector';

const s3 = new S3({ region: process.env.AWS_REGION });

interface ComplianceReport {
  timestamp: string;
  environment: string;
  summary: {
    totalRules: number;
    compliantRules: number;
    nonCompliantRules: number;
    resourcesChecked: number;
    resourcesNonCompliant: number;
  };
  details: Array<{
    ruleName: string;
    resourceId: string;
    complianceType: string;
    annotation?: string;
  }>;
  recommendations: Array<{
    ruleName: string;
    resourceId: string;
    action: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export async function generateComplianceReport(
  environment: string
): Promise<ComplianceReport> {
  try {
    // 규정 준수 데이터 수집
    const report = await collectComplianceData(environment);

    // 보고서 S3에 저장
    const reportKey = `compliance-reports/${environment}/${new Date().toISOString().split('T')[0]}.json`;
    
    await s3.putObject({
      Bucket: process.env.REPORTS_BUCKET!,
      Key: reportKey,
      Body: JSON.stringify(report, null, 2),
      ContentType: 'application/json',
    });

    await logEvent('info', 'Compliance report generated', {
      environment,
      reportKey,
      summary: report.summary,
    });

    return report;
  } catch (error) {
    await logEvent('error', 'Failed to generate compliance report', { error });
    throw error;
  }
}
```

## 3. 보안 모니터링 자동화
### 3.1 보안 이벤트 모니터링
```typescript
// lib/security/monitor.ts
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { GuardDuty } from '@aws-sdk/client-guardduty';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/notifications';

const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });
const guardduty = new GuardDuty({ region: process.env.AWS_REGION });

interface SecurityEvent {
  id: string;
  type: string;
  severity: number;
  description: string;
  resource: {
    type: string;
    id: string;
  };
  timestamp: string;
}

export async function monitorSecurityEvents(environment: string) {
  try {
    // GuardDuty 결과 확인
    const findings = await guardduty.listFindings({
      DetectorId: process.env.GUARDDUTY_DETECTOR_ID!,
      FindingCriteria: {
        Criterion: {
          severity: {
            Gte: 4, // 중간 이상 심각도
          },
        },
      },
    });

    const events: SecurityEvent[] = findings.FindingIds!.map(id => ({
      id,
      type: 'GuardDuty',
      severity: 7,
      description: '보안 위협 발견',
      resource: {
        type: 'AWS::EC2::Instance',
        id: 'i-1234567890abcdef0',
      },
      timestamp: new Date().toISOString(),
    }));

    // 심각한 이벤트에 대한 알림 전송
    const criticalEvents = events.filter(e => e.severity >= 7);
    if (criticalEvents.length > 0) {
      await sendAlert({
        type: 'critical',
        title: '심각한 보안 이벤트 발생',
        message: `${criticalEvents.length}개의 심각한 보안 이벤트가 발생했습니다.`,
        metadata: { events: criticalEvents },
        channels: { slack: true, email: true, sns: true },
      });
    }

    await logEvent('info', 'Security events monitored', {
      environment,
      eventCount: events.length,
      criticalCount: criticalEvents.length,
    });

    return events;
  } catch (error) {
    await logEvent('error', 'Failed to monitor security events', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-017.md: 성능 최적화 및 스케일링 자동화 