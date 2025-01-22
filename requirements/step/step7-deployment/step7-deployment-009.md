# Step 7-009: 보안 감사 및 컴플라이언스

## 1. 보안 감사
### 1.1 보안 검사 자동화
```typescript
// lib/security/audit/automation.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { logEvent } from '@/lib/logging/logger';

const execAsync = promisify(exec);

interface SecurityScan {
  name: string;
  command: string;
  severity: 'low' | 'medium' | 'high';
  parser: (output: string) => any;
}

const SECURITY_SCANS: SecurityScan[] = [
  {
    name: 'npm audit',
    command: 'npm audit --json',
    severity: 'high',
    parser: (output) => JSON.parse(output),
  },
  {
    name: 'snyk test',
    command: 'snyk test --json',
    severity: 'high',
    parser: (output) => JSON.parse(output),
  },
  {
    name: 'OWASP ZAP',
    command: 'zap-cli quick-scan --self-contained --spider -r http://localhost:3000',
    severity: 'medium',
    parser: (output) => {
      const lines = output.split('\n');
      return {
        alerts: lines.filter(line => line.includes('WARN') || line.includes('FAIL')),
      };
    },
  },
];

export async function runSecurityScans() {
  const results = [];

  for (const scan of SECURITY_SCANS) {
    try {
      const { stdout } = await execAsync(scan.command);
      const parsedOutput = scan.parser(stdout);

      results.push({
        name: scan.name,
        severity: scan.severity,
        output: parsedOutput,
        timestamp: new Date().toISOString(),
      });

      logEvent('info', `Security scan completed: ${scan.name}`, {
        output: parsedOutput,
      });
    } catch (error) {
      logEvent('error', `Security scan failed: ${scan.name}`, { error });
      results.push({
        name: scan.name,
        severity: scan.severity,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return results;
}
```

### 1.2 취약점 관리
```typescript
// lib/security/audit/vulnerabilities.ts
import { prisma } from '@/lib/db/client';
import { sendSlackAlert } from '@/lib/monitoring/notifications/slack';
import { sendEmailAlert } from '@/lib/monitoring/notifications/email';
import { logEvent } from '@/lib/logging/logger';

interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'wontfix';
  affectedComponents: string[];
  remediation?: string;
}

export async function processVulnerabilities(scanResults: any[]) {
  const vulnerabilities: Vulnerability[] = [];

  // 스캔 결과 분석
  for (const result of scanResults) {
    const extracted = extractVulnerabilities(result);
    vulnerabilities.push(...extracted);
  }

  // 취약점 저장 및 알림
  for (const vuln of vulnerabilities) {
    await prisma.vulnerability.upsert({
      where: { id: vuln.id },
      update: {
        status: vuln.status,
        updatedAt: new Date(),
      },
      create: {
        ...vuln,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    if (vuln.severity === 'high' || vuln.severity === 'critical') {
      await notifyVulnerability(vuln);
    }
  }

  return vulnerabilities;
}

function extractVulnerabilities(scanResult: any): Vulnerability[] {
  switch (scanResult.name) {
    case 'npm audit':
      return extractNpmVulnerabilities(scanResult.output);
    case 'snyk test':
      return extractSnykVulnerabilities(scanResult.output);
    case 'OWASP ZAP':
      return extractZapVulnerabilities(scanResult.output);
    default:
      return [];
  }
}

async function notifyVulnerability(vuln: Vulnerability) {
  const message = formatVulnerabilityMessage(vuln);

  // Slack 알림
  await sendSlackAlert('security', message, [
    {
      color: vuln.severity === 'critical' ? 'danger' : 'warning',
      fields: [
        {
          title: 'Severity',
          value: vuln.severity,
          short: true,
        },
        {
          title: 'Status',
          value: vuln.status,
          short: true,
        },
        {
          title: 'Affected Components',
          value: vuln.affectedComponents.join(', '),
        },
      ],
    },
  ]);

  // 이메일 알림
  await sendEmailAlert({
    subject: `🚨 Security Alert: ${vuln.severity.toUpperCase()} Vulnerability Detected`,
    body: message,
    recipients: process.env.SECURITY_EMAIL_RECIPIENTS!.split(','),
    isHtml: true,
  });
}
```

## 2. 컴플라이언스 관리
### 2.1 정책 관리
```typescript
// lib/compliance/policies.ts
import { prisma } from '@/lib/db/client';
import { logEvent } from '@/lib/logging/logger';

interface CompliancePolicy {
  id: string;
  name: string;
  description: string;
  category: 'security' | 'privacy' | 'operational';
  requirements: string[];
  controls: Array<{
    id: string;
    name: string;
    implementation: string;
    validation: () => Promise<boolean>;
  }>;
}

const COMPLIANCE_POLICIES: CompliancePolicy[] = [
  {
    id: 'gdpr-data-protection',
    name: 'GDPR Data Protection',
    description: 'Ensure compliance with GDPR data protection requirements',
    category: 'privacy',
    requirements: [
      'Implement data encryption at rest and in transit',
      'Provide mechanism for data subject access requests',
      'Implement data retention policies',
    ],
    controls: [
      {
        id: 'encryption-check',
        name: 'Data Encryption Check',
        implementation: 'Verify encryption settings in database and API calls',
        validation: async () => {
          try {
            // 데이터베이스 암호화 설정 확인
            const dbSettings = await prisma.setting.findFirst({
              where: { key: 'database_encryption' },
            });

            // API 엔드포인트 SSL 확인
            const apiEndpoint = process.env.API_URL || '';
            const isSSL = apiEndpoint.startsWith('https');

            return dbSettings?.value === 'enabled' && isSSL;
          } catch (error) {
            logEvent('error', 'Encryption check failed', { error });
            return false;
          }
        },
      },
    ],
  },
];

export async function validateCompliance() {
  const results = [];

  for (const policy of COMPLIANCE_POLICIES) {
    const controlResults = await Promise.all(
      policy.controls.map(async (control) => {
        try {
          const isValid = await control.validation();
          return {
            controlId: control.id,
            name: control.name,
            status: isValid ? 'passed' : 'failed',
          };
        } catch (error) {
          logEvent('error', `Compliance validation failed: ${control.id}`, {
            error,
          });
          return {
            controlId: control.id,
            name: control.name,
            status: 'error',
            error: error.message,
          };
        }
      })
    );

    results.push({
      policyId: policy.id,
      name: policy.name,
      category: policy.category,
      controls: controlResults,
      status: controlResults.every((r) => r.status === 'passed')
        ? 'compliant'
        : 'non_compliant',
    });
  }

  return results;
}
```

### 2.2 감사 로그 관리
```typescript
// lib/compliance/audit-logs.ts
import { prisma } from '@/lib/db/client';
import { logEvent } from '@/lib/logging/logger';

interface AuditLogEntry {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
}

export async function createAuditLog(entry: AuditLogEntry) {
  try {
    const log = await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        changes: entry.changes,
        metadata: {
          ...entry.metadata,
          userAgent: process.env.USER_AGENT,
          ipAddress: process.env.IP_ADDRESS,
          timestamp: new Date().toISOString(),
        },
      },
    });

    logEvent('info', 'Audit log created', {
      logId: log.id,
      ...entry,
    });

    return log;
  } catch (error) {
    logEvent('error', 'Failed to create audit log', {
      error,
      entry,
    });
    throw error;
  }
}

export async function queryAuditLogs(filters: {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}) {
  const {
    page = 1,
    limit = 50,
    ...whereClause
  } = filters;

  try {
    const [total, logs] = await Promise.all([
      prisma.auditLog.count({
        where: whereClause,
      }),
      prisma.auditLog.findMany({
        where: whereClause,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      total,
      page,
      limit,
      data: logs,
    };
  } catch (error) {
    logEvent('error', 'Failed to query audit logs', {
      error,
      filters,
    });
    throw error;
  }
}
```

## 3. 보고서 생성
### 3.1 보안 보고서
```typescript
// lib/reporting/security.ts
import { prisma } from '@/lib/db/client';
import { generatePDF } from '@/lib/utils/pdf';
import { logEvent } from '@/lib/logging/logger';

interface SecurityReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalIncidents: number;
    resolvedIncidents: number;
    criticalVulnerabilities: number;
    complianceScore: number;
  };
  details: {
    incidents: any[];
    vulnerabilities: any[];
    auditResults: any[];
  };
}

export async function generateSecurityReport(
  startDate: Date,
  endDate: Date
): Promise<SecurityReport> {
  try {
    // 보안 사고 통계
    const incidents = await prisma.securityIncident.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // 취약점 통계
    const vulnerabilities = await prisma.vulnerability.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // 감사 결과
    const auditResults = await prisma.auditResult.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const report: SecurityReport = {
      period: { start: startDate, end: endDate },
      summary: {
        totalIncidents: incidents.length,
        resolvedIncidents: incidents.filter(i => i.status === 'resolved').length,
        criticalVulnerabilities: vulnerabilities.filter(
          v => v.severity === 'critical'
        ).length,
        complianceScore: calculateComplianceScore(auditResults),
      },
      details: {
        incidents,
        vulnerabilities,
        auditResults,
      },
    };

    // PDF 생성
    const pdf = await generatePDF('security-report', report);

    logEvent('info', 'Security report generated', {
      period: report.period,
      summary: report.summary,
    });

    return report;
  } catch (error) {
    logEvent('error', 'Failed to generate security report', { error });
    throw error;
  }
}
```

### 3.2 컴플라이언스 보고서
```typescript
// lib/reporting/compliance.ts
import { prisma } from '@/lib/db/client';
import { generatePDF } from '@/lib/utils/pdf';
import { logEvent } from '@/lib/logging/logger';

interface ComplianceReport {
  timestamp: Date;
  policies: Array<{
    id: string;
    name: string;
    status: 'compliant' | 'non_compliant';
    controls: Array<{
      id: string;
      name: string;
      status: string;
      lastChecked: Date;
    }>;
  }>;
  summary: {
    totalPolicies: number;
    compliantPolicies: number;
    complianceRate: number;
  };
}

export async function generateComplianceReport(): Promise<ComplianceReport> {
  try {
    const policies = await prisma.compliancePolicy.findMany({
      include: {
        controls: {
          include: {
            lastCheck: true,
          },
        },
      },
    });

    const report: ComplianceReport = {
      timestamp: new Date(),
      policies: policies.map(policy => ({
        id: policy.id,
        name: policy.name,
        status: policy.controls.every(c => c.lastCheck?.status === 'passed')
          ? 'compliant'
          : 'non_compliant',
        controls: policy.controls.map(control => ({
          id: control.id,
          name: control.name,
          status: control.lastCheck?.status || 'unknown',
          lastChecked: control.lastCheck?.timestamp || new Date(),
        })),
      })),
      summary: {
        totalPolicies: policies.length,
        compliantPolicies: policies.filter(p =>
          p.controls.every(c => c.lastCheck?.status === 'passed')
        ).length,
        complianceRate: 0,
      },
    };

    report.summary.complianceRate =
      (report.summary.compliantPolicies / report.summary.totalPolicies) * 100;

    // PDF 생성
    const pdf = await generatePDF('compliance-report', report);

    logEvent('info', 'Compliance report generated', {
      timestamp: report.timestamp,
      summary: report.summary,
    });

    return report;
  } catch (error) {
    logEvent('error', 'Failed to generate compliance report', { error });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-010.md: 배포 자동화 및 CI/CD 