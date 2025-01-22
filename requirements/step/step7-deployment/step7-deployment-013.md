# Step 7-013: 보안 감사 및 컴플라이언스 고도화

## 1. 보안 감사 시스템
### 1.1 보안 스캐너
```typescript
// lib/security/scanner.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { logEvent } from '@/lib/logging/collector';
import { sendAlert } from '@/lib/monitoring/notifications';

const execAsync = promisify(exec);

interface SecurityScanResult {
  tool: string;
  findings: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    recommendation?: string;
  }>;
  timestamp: string;
}

export async function runSecurityScans(): Promise<SecurityScanResult[]> {
  try {
    const results: SecurityScanResult[] = [];

    // npm audit 실행
    const npmAuditResult = await execAsync('npm audit --json');
    results.push(parseNpmAuditResult(npmAuditResult.stdout));

    // Snyk 테스트 실행
    const snykResult = await execAsync('snyk test --json');
    results.push(parseSnykResult(snykResult.stdout));

    // OWASP Dependency Check 실행
    const owaspResult = await execAsync('dependency-check --project "GM Tool" --scan . --format JSON');
    results.push(parseOwaspResult(owaspResult.stdout));

    // 심각한 취약점 발견 시 알림 전송
    const criticalFindings = results.flatMap(r => 
      r.findings.filter(f => f.severity === 'critical')
    );

    if (criticalFindings.length > 0) {
      await sendAlert({
        type: 'critical',
        title: '심각한 보안 취약점 발견',
        message: `${criticalFindings.length}개의 심각한 취약점이 발견되었습니다.`,
        metadata: { findings: criticalFindings },
        channels: { slack: true, email: true },
      });
    }

    await logEvent('info', 'Security scans completed', { results });
    return results;
  } catch (error) {
    await logEvent('error', 'Security scan failed', { error });
    throw error;
  }
}
```

### 1.2 취약점 관리자
```typescript
// lib/security/vulnerability-manager.ts
import { PrismaClient } from '@prisma/client';
import { logEvent } from '@/lib/logging/collector';

const prisma = new PrismaClient();

interface Vulnerability {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'accepted_risk';
  discoveredAt: Date;
  resolvedAt?: Date;
  assignedTo?: string;
  notes?: string;
}

export async function saveVulnerability(vulnerability: Omit<Vulnerability, 'id'>) {
  try {
    const result = await prisma.vulnerability.create({
      data: {
        ...vulnerability,
        id: generateVulnerabilityId(),
      },
    });

    await logEvent('info', 'Vulnerability saved', { vulnerability: result });
    return result;
  } catch (error) {
    await logEvent('error', 'Failed to save vulnerability', { error, vulnerability });
    throw error;
  }
}

export async function updateVulnerabilityStatus(
  id: string,
  status: Vulnerability['status'],
  notes?: string
) {
  try {
    const result = await prisma.vulnerability.update({
      where: { id },
      data: {
        status,
        notes: notes ? `${notes}\n${new Date().toISOString()}` : undefined,
        resolvedAt: status === 'resolved' ? new Date() : undefined,
      },
    });

    await logEvent('info', 'Vulnerability status updated', { vulnerability: result });
    return result;
  } catch (error) {
    await logEvent('error', 'Failed to update vulnerability status', { error, id, status });
    throw error;
  }
}
```

## 2. 컴플라이언스 관리
### 2.1 정책 관리자
```typescript
// lib/compliance/policy-manager.ts
import { PrismaClient } from '@prisma/client';
import { logEvent } from '@/lib/logging/collector';

const prisma = new PrismaClient();

interface CompliancePolicy {
  id: string;
  name: string;
  description: string;
  category: 'security' | 'privacy' | 'operational';
  controls: Array<{
    id: string;
    name: string;
    description: string;
    implementation: string;
    validation: string;
  }>;
  status: 'active' | 'draft' | 'archived';
  lastReviewedAt: Date;
  nextReviewAt: Date;
}

export async function validatePolicyControls(policyId: string) {
  try {
    const policy = await prisma.compliancePolicy.findUnique({
      where: { id: policyId },
      include: { controls: true },
    });

    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    const validationResults = await Promise.all(
      policy.controls.map(async control => {
        const result = await validateControl(control);
        return { controlId: control.id, ...result };
      })
    );

    await logEvent('info', 'Policy controls validated', {
      policyId,
      results: validationResults,
    });

    return validationResults;
  } catch (error) {
    await logEvent('error', 'Failed to validate policy controls', { error, policyId });
    throw error;
  }
}
```

### 2.2 감사 로그 관리자
```typescript
// lib/compliance/audit-log-manager.ts
import { PrismaClient } from '@prisma/client';
import { logEvent } from '@/lib/logging/collector';

const prisma = new PrismaClient();

interface AuditLogEntry {
  id: string;
  action: string;
  category: 'user' | 'system' | 'security' | 'data';
  actor: {
    id: string;
    type: 'user' | 'system';
    name: string;
  };
  target: {
    type: string;
    id: string;
    name: string;
  };
  changes?: Record<string, { before: any; after: any }>;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export async function createAuditLog(entry: Omit<AuditLogEntry, 'id'>) {
  try {
    const result = await prisma.auditLog.create({
      data: {
        ...entry,
        id: generateAuditLogId(),
        changes: entry.changes ? JSON.stringify(entry.changes) : undefined,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : undefined,
      },
    });

    await logEvent('info', 'Audit log created', { entry: result });
    return result;
  } catch (error) {
    await logEvent('error', 'Failed to create audit log', { error, entry });
    throw error;
  }
}
```

## 3. 보고서 생성
### 3.1 보안 보고서 생성기
```typescript
// lib/reporting/security-report-generator.ts
import { PrismaClient } from '@prisma/client';
import { logEvent } from '@/lib/logging/collector';

const prisma = new PrismaClient();

interface SecurityReport {
  id: string;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    vulnerabilitiesByStatus: Record<string, number>;
    vulnerabilitiesBySeverity: Record<string, number>;
    incidentCount: number;
    averageTimeToResolve: number;
  };
  details: {
    newVulnerabilities: Array<any>;
    resolvedVulnerabilities: Array<any>;
    openIncidents: Array<any>;
    securityEvents: Array<any>;
  };
  recommendations: Array<{
    category: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }>;
}

export async function generateSecurityReport(
  startDate: Date,
  endDate: Date
): Promise<SecurityReport> {
  try {
    const vulnerabilities = await prisma.vulnerability.findMany({
      where: {
        OR: [
          { discoveredAt: { gte: startDate, lte: endDate } },
          { resolvedAt: { gte: startDate, lte: endDate } },
          {
            AND: [
              { discoveredAt: { lt: endDate } },
              { status: { in: ['open', 'in_progress'] } },
            ],
          },
        ],
      },
    });

    const report: SecurityReport = {
      id: generateReportId(),
      period: { start: startDate, end: endDate },
      summary: calculateSummary(vulnerabilities),
      details: {
        newVulnerabilities: filterNewVulnerabilities(vulnerabilities, startDate, endDate),
        resolvedVulnerabilities: filterResolvedVulnerabilities(vulnerabilities, startDate, endDate),
        openIncidents: await getOpenIncidents(endDate),
        securityEvents: await getSecurityEvents(startDate, endDate),
      },
      recommendations: generateRecommendations(vulnerabilities),
    };

    await logEvent('info', 'Security report generated', {
      reportId: report.id,
      period: report.period,
    });

    return report;
  } catch (error) {
    await logEvent('error', 'Failed to generate security report', { error, startDate, endDate });
    throw error;
  }
}
```

## 다음 단계
- step7-deployment-014.md: 배포 자동화 및 CI/CD 고도화 