# Step 7-020: 보안 감사 및 컴플라이언스 고도화

## 1. 보안 감사 시스템
### 1.1 보안 스캐너
```typescript
// lib/security/scanner.ts
import { SecurityHub } from '@aws-sdk/client-securityhub';
import { Inspector } from '@aws-sdk/client-inspector';
import { logEvent } from '@/lib/logging/collector';

const securityHub = new SecurityHub({ region: process.env.AWS_REGION });
const inspector = new Inspector({ region: process.env.AWS_REGION });

interface SecurityScan {
  id: string;
  timestamp: Date;
  type: 'dependency' | 'container' | 'infrastructure' | 'code';
  findings: Array<{
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    title: string;
    description: string;
    resource: string;
    remediation: string;
  }>;
}

export async function runSecurityScan(
  environment: string,
  scanType: SecurityScan['type']
): Promise<SecurityScan> {
  try {
    const scan: SecurityScan = {
      id: uuidv4(),
      timestamp: new Date(),
      type: scanType,
      findings: [],
    };

    switch (scanType) {
      case 'dependency':
        // npm audit 실행
        const npmAudit = await execCommand('npm audit --json');
        const auditResults = JSON.parse(npmAudit);
        
        scan.findings.push(
          ...auditResults.vulnerabilities.map((vuln: any) => ({
            severity: vuln.severity.toUpperCase(),
            title: `Vulnerable Package: ${vuln.module_name}`,
            description: vuln.overview,
            resource: `${vuln.module_name}@${vuln.version}`,
            remediation: vuln.recommendation,
          }))
        );
        break;

      case 'container':
        // Amazon ECR 이미지 스캔
        const imageScanFindings = await inspector.describeFindings({
          filter: {
            resourceTags: [
              {
                key: 'Environment',
                value: environment,
              },
            ],
          },
        });

        scan.findings.push(
          ...imageScanFindings.findings!.map(finding => ({
            severity: finding.severity as SecurityScan['findings'][0]['severity'],
            title: finding.title!,
            description: finding.description!,
            resource: finding.resourceId!,
            remediation: finding.recommendation!.text!,
          }))
        );
        break;

      case 'infrastructure':
        // AWS Security Hub 결과 조회
        const securityHubFindings = await securityHub.getFindings({
          Filters: {
            RecordState: [{ Value: 'ACTIVE', Comparison: 'EQUALS' }],
            ResourceTags: [
              {
                Value: environment,
                Comparison: 'EQUALS',
                Key: 'Environment',
              },
            ],
          },
        });

        scan.findings.push(
          ...securityHubFindings.Findings!.map(finding => ({
            severity: finding.Severity!.Label as SecurityScan['findings'][0]['severity'],
            title: finding.Title!,
            description: finding.Description!,
            resource: finding.Resources![0].Id!,
            remediation: finding.Remediation!.Recommendation!.Text!,
          }))
        );
        break;

      case 'code':
        // SAST 도구 실행 (예: SonarQube)
        const sonarResults = await runSonarAnalysis(environment);
        
        scan.findings.push(
          ...sonarResults.issues.map(issue => ({
            severity: issue.severity,
            title: issue.message,
            description: issue.description,
            resource: `${issue.component}:${issue.line}`,
            remediation: issue.remediation,
          }))
        );
        break;
    }

    await logEvent('info', 'Security scan completed', {
      scanId: scan.id,
      type: scan.type,
      findingCount: scan.findings.length,
    });

    return scan;
  } catch (error) {
    await logEvent('error', 'Failed to run security scan', { error });
    throw error;
  }
}
```

### 1.2 취약점 관리자
```typescript
// lib/security/vulnerability-manager.ts
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { SNS } from '@aws-sdk/client-sns';
import { logEvent } from '@/lib/logging/collector';

const dynamodb = new DynamoDB({ region: process.env.AWS_REGION });
const sns = new SNS({ region: process.env.AWS_REGION });

interface Vulnerability {
  id: string;
  scanId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  resource: string;
  remediation: string;
  status: 'open' | 'in_progress' | 'resolved' | 'accepted_risk';
  assignee?: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function manageVulnerabilities(
  environment: string,
  scan: SecurityScan
) {
  try {
    // 새로운 취약점 저장
    for (const finding of scan.findings) {
      const vulnerability: Vulnerability = {
        id: uuidv4(),
        scanId: scan.id,
        ...finding,
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await dynamodb.putItem({
        TableName: `gm-tool-${environment}-vulnerabilities`,
        Item: {
          id: { S: vulnerability.id },
          scanId: { S: vulnerability.scanId },
          severity: { S: vulnerability.severity },
          title: { S: vulnerability.title },
          description: { S: vulnerability.description },
          resource: { S: vulnerability.resource },
          remediation: { S: vulnerability.remediation },
          status: { S: vulnerability.status },
          createdAt: { S: vulnerability.createdAt.toISOString() },
          updatedAt: { S: vulnerability.updatedAt.toISOString() },
        },
      });

      // 심각도가 HIGH 이상인 경우 알림 발송
      if (['HIGH', 'CRITICAL'].includes(vulnerability.severity)) {
        await sns.publish({
          TopicArn: process.env.SECURITY_ALERT_TOPIC_ARN,
          Message: JSON.stringify(vulnerability),
          MessageAttributes: {
            Severity: {
              DataType: 'String',
              StringValue: vulnerability.severity,
            },
          },
        });
      }
    }

    await logEvent('info', 'Vulnerabilities managed', {
      scanId: scan.id,
      vulnerabilityCount: scan.findings.length,
    });
  } catch (error) {
    await logEvent('error', 'Failed to manage vulnerabilities', { error });
    throw error;
  }
}
```

## 2. 컴플라이언스 관리
### 2.1 컴플라이언스 검사기
```typescript
// lib/compliance/checker.ts
import { Config } from '@aws-sdk/client-config-service';
import { logEvent } from '@/lib/logging/collector';

const config = new Config({ region: process.env.AWS_REGION });

interface ComplianceCheck {
  id: string;
  timestamp: Date;
  type: 'security' | 'privacy' | 'operational';
  results: Array<{
    control: string;
    status: 'compliant' | 'non_compliant' | 'not_applicable';
    details: string;
    evidence?: string;
  }>;
}

export async function runComplianceCheck(
  environment: string,
  checkType: ComplianceCheck['type']
): Promise<ComplianceCheck> {
  try {
    const check: ComplianceCheck = {
      id: uuidv4(),
      timestamp: new Date(),
      type: checkType,
      results: [],
    };

    // AWS Config 규칙 평가 결과 조회
    const configRules = await config.describeConfigRules();
    const evaluations = await Promise.all(
      configRules.ConfigRules!.map(rule =>
        config.getComplianceDetailsByConfigRule({
          ConfigRuleName: rule.ConfigRuleName!,
        })
      )
    );

    // 평가 결과 변환
    check.results = evaluations.flatMap(evaluation =>
      evaluation.EvaluationResults!.map(result => ({
        control: result.EvaluationResultIdentifier!.EvaluationResultQualifier!.ConfigRuleName!,
        status: result.ComplianceType!.toLowerCase() as ComplianceCheck['results'][0]['status'],
        details: result.Annotation || '',
        evidence: JSON.stringify(result.EvaluationResultIdentifier!.OrderingTimestamp),
      }))
    );

    await logEvent('info', 'Compliance check completed', {
      checkId: check.id,
      type: check.type,
      resultCount: check.results.length,
    });

    return check;
  } catch (error) {
    await logEvent('error', 'Failed to run compliance check', { error });
    throw error;
  }
}
```

### 2.2 감사 로그 관리자
```typescript
// lib/compliance/audit-log-manager.ts
import { CloudTrail } from '@aws-sdk/client-cloudtrail';
import { S3 } from '@aws-sdk/client-s3';
import { logEvent } from '@/lib/logging/collector';

const cloudTrail = new CloudTrail({ region: process.env.AWS_REGION });
const s3 = new S3({ region: process.env.AWS_REGION });

interface AuditLogConfig {
  retentionDays: number;
  archiveAfterDays: number;
}

export async function manageAuditLogs(
  environment: string,
  config: AuditLogConfig
) {
  try {
    const now = new Date();
    const archiveDate = new Date(
      now.getTime() - config.archiveAfterDays * 24 * 60 * 60 * 1000
    );

    // CloudTrail 로그 조회
    const trails = await cloudTrail.describeTrails();
    
    for (const trail of trails.trailList!) {
      // S3에서 CloudTrail 로그 아카이브
      const objects = await s3.listObjectsV2({
        Bucket: trail.S3BucketName!,
        Prefix: `${environment}/`,
      });

      for (const object of objects.Contents!) {
        const objectDate = new Date(object.LastModified!);
        
        if (objectDate <= archiveDate) {
          // 아카이브 버킷으로 복사
          await s3.copyObject({
            Bucket: process.env.AUDIT_LOG_ARCHIVE_BUCKET!,
            Key: object.Key!,
            CopySource: `${trail.S3BucketName}/${object.Key}`,
          });

          // 원본 삭제
          await s3.deleteObject({
            Bucket: trail.S3BucketName!,
            Key: object.Key!,
          });
        }
      }
    }

    await logEvent('info', 'Audit logs managed', {
      environment,
      archiveDate,
    });
  } catch (error) {
    await logEvent('error', 'Failed to manage audit logs', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-021.md: 성능 모니터링 및 최적화 고도화 