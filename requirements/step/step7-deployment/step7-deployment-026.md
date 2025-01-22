# Step 7-026: 보안 시스템 고도화

## 1. 보안 스캔 시스템
### 1.1 보안 스캐너
```typescript
// lib/security/scanner.ts
import { SecurityHub } from '@aws-sdk/client-securityhub';
import { Inspector } from '@aws-sdk/client-inspector2';
import { ECR } from '@aws-sdk/client-ecr';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const securityhub = new SecurityHub({ region: process.env.AWS_REGION });
const inspector = new Inspector({ region: process.env.AWS_REGION });
const ecr = new ECR({ region: process.env.AWS_REGION });

interface SecurityScan {
  id: string;
  timestamp: Date;
  type: 'dependency' | 'container' | 'infrastructure' | 'code';
  findings: Array<{
    id: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description: string;
    resource: string;
    remediation?: string;
  }>;
}

export async function runSecurityScan(type: SecurityScan['type']): Promise<SecurityScan> {
  try {
    const scan: SecurityScan = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      findings: [],
    };

    switch (type) {
      case 'dependency':
        // npm audit 실행
        const { stdout: npmAuditOutput } = await exec('npm audit --json');
        const npmAuditResult = JSON.parse(npmAuditOutput);

        for (const vulnerability of npmAuditResult.vulnerabilities) {
          scan.findings.push({
            id: uuidv4(),
            severity: vulnerability.severity.toUpperCase(),
            title: vulnerability.title,
            description: vulnerability.description,
            resource: vulnerability.module_name,
            remediation: vulnerability.recommendation,
          });
        }
        break;

      case 'container':
        // ECR 이미지 스캔
        const images = await ecr.describeImageScanFindings({
          repositoryName: process.env.ECR_REPOSITORY_NAME,
          imageId: {
            imageTag: 'latest',
          },
        });

        for (const finding of images.imageScanFindings?.findings || []) {
          scan.findings.push({
            id: uuidv4(),
            severity: finding.severity as SecurityScan['findings'][0]['severity'],
            title: finding.name || '',
            description: finding.description || '',
            resource: `${process.env.ECR_REPOSITORY_NAME}:latest`,
            remediation: finding.recommendation,
          });
        }
        break;

      case 'infrastructure':
        // AWS Inspector 결과 조회
        const inspectorFindings = await inspector.listFindings({
          filterCriteria: {
            lastObservedAt: [
              {
                startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
                endTime: new Date(),
              },
            ],
          },
        });

        for (const finding of inspectorFindings.findings || []) {
          scan.findings.push({
            id: uuidv4(),
            severity: finding.severity as SecurityScan['findings'][0]['severity'],
            title: finding.title || '',
            description: finding.description || '',
            resource: finding.resourceId || '',
            remediation: finding.remediation?.recommendation,
          });
        }
        break;

      case 'code':
        // SonarQube 분석 결과 조회
        const sonarqubeUrl = process.env.SONARQUBE_URL;
        const sonarqubeToken = process.env.SONARQUBE_TOKEN;
        const projectKey = process.env.SONARQUBE_PROJECT_KEY;

        const response = await fetch(
          `${sonarqubeUrl}/api/issues/search?projectKeys=${projectKey}&types=VULNERABILITY`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${sonarqubeToken}:`).toString('base64')}`,
            },
          }
        );

        const sonarqubeResult = await response.json();

        for (const issue of sonarqubeResult.issues) {
          scan.findings.push({
            id: uuidv4(),
            severity: issue.severity.toUpperCase(),
            title: issue.message,
            description: issue.rule,
            resource: `${issue.component}:${issue.line}`,
            remediation: issue.debt,
          });
        }
        break;
    }

    // 심각한 취약점 발견 시 알림 전송
    const criticalFindings = scan.findings.filter(
      finding => finding.severity === 'HIGH' || finding.severity === 'CRITICAL'
    );

    if (criticalFindings.length > 0) {
      await sendAlert({
        type: 'security_scan',
        title: '심각한 보안 취약점 발견',
        message: `${type} 스캔에서 ${criticalFindings.length}개의 심각한 취약점이 발견되었습니다.`,
        severity: 'critical',
        metadata: {
          scan,
          criticalFindings,
        },
        channels: [
          {
            type: 'slack',
            target: process.env.SECURITY_ALERT_SLACK_CHANNEL!,
          },
          {
            type: 'email',
            target: process.env.SECURITY_ALERT_EMAIL!,
          },
        ],
      });
    }

    await logEvent('info', 'Security scan completed', { scan });

    return scan;
  } catch (error) {
    await logEvent('error', 'Failed to run security scan', { error });
    throw error;
  }
}
```

## 2. 보안 모니터링 시스템
### 2.1 보안 모니터링 관리자
```typescript
// lib/security/monitor.ts
import { GuardDuty } from '@aws-sdk/client-guardduty';
import { WAFv2 } from '@aws-sdk/client-wafv2';
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/alert-router';

const guardduty = new GuardDuty({ region: process.env.AWS_REGION });
const wafv2 = new WAFv2({ region: process.env.AWS_REGION });
const cloudwatch = new CloudWatch({ region: process.env.AWS_REGION });

interface SecurityMetrics {
  id: string;
  timestamp: Date;
  metrics: {
    blockedRequests: number;
    suspiciousActivities: number;
    failedLogins: number;
    apiErrors: number;
  };
  findings: Array<{
    id: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    type: string;
    description: string;
    source: string;
    timestamp: Date;
  }>;
}

export async function monitorSecurityMetrics(): Promise<SecurityMetrics> {
  try {
    const metrics: SecurityMetrics = {
      id: uuidv4(),
      timestamp: new Date(),
      metrics: {
        blockedRequests: 0,
        suspiciousActivities: 0,
        failedLogins: 0,
        apiErrors: 0,
      },
      findings: [],
    };

    // WAF 차단된 요청 수 조회
    const wafMetrics = await cloudwatch.getMetricData({
      MetricDataQueries: [
        {
          Id: 'blocked_requests',
          MetricStat: {
            Metric: {
              Namespace: 'AWS/WAFV2',
              MetricName: 'BlockedRequests',
              Dimensions: [
                {
                  Name: 'WebACL',
                  Value: process.env.WAF_WEB_ACL_NAME!,
                },
                {
                  Name: 'Region',
                  Value: process.env.AWS_REGION!,
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

    metrics.metrics.blockedRequests =
      wafMetrics.MetricDataResults![0].Values![0] || 0;

    // GuardDuty 의심스러운 활동 조회
    const guardDutyFindings = await guardduty.listFindings({
      DetectorId: process.env.GUARD_DUTY_DETECTOR_ID!,
      FindingCriteria: {
        Criterion: {
          updatedAt: {
            Gte: Math.floor((Date.now() - 5 * 60 * 1000) / 1000),
          },
        },
      },
    });

    const findings = await guardduty.getFindings({
      DetectorId: process.env.GUARD_DUTY_DETECTOR_ID!,
      FindingIds: guardDutyFindings.FindingIds || [],
    });

    metrics.metrics.suspiciousActivities = findings.Findings?.length || 0;

    for (const finding of findings.Findings || []) {
      metrics.findings.push({
        id: finding.Id!,
        severity: finding.Severity! >= 7 ? 'CRITICAL' : finding.Severity! >= 4 ? 'HIGH' : 'MEDIUM',
        type: finding.Type!,
        description: finding.Description!,
        source: 'GuardDuty',
        timestamp: new Date(finding.CreatedAt!),
      });
    }

    // 임계값 초과 시 알림 전송
    if (
      metrics.metrics.blockedRequests > 100 ||
      metrics.metrics.suspiciousActivities > 0
    ) {
      await sendAlert({
        type: 'security_metrics',
        title: '보안 지표 임계값 초과',
        message: '보안 지표가 임계값을 초과했습니다.',
        severity: 'critical',
        metadata: { metrics },
        channels: [
          {
            type: 'slack',
            target: process.env.SECURITY_ALERT_SLACK_CHANNEL!,
          },
          {
            type: 'email',
            target: process.env.SECURITY_ALERT_EMAIL!,
          },
        ],
      });
    }

    await logEvent('info', 'Security metrics collected', { metrics });

    return metrics;
  } catch (error) {
    await logEvent('error', 'Failed to monitor security metrics', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-027.md: 성능 최적화 시스템 고도화 