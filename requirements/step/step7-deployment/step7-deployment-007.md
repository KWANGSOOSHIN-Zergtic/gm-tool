# Step 7-007: 유지보수 및 운영

## 1. 버전 관리
### 1.1 버전 관리 스크립트
```typescript
// scripts/version.ts
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

interface VersionInfo {
  version: string;
  buildNumber: string;
  commitHash: string;
  buildDate: string;
}

function generateVersion(): VersionInfo {
  const packageJson = require('../package.json');
  const buildNumber = process.env.BUILD_NUMBER || '0';
  const commitHash = execSync('git rev-parse --short HEAD').toString().trim();
  
  return {
    version: packageJson.version,
    buildNumber,
    commitHash,
    buildDate: new Date().toISOString(),
  };
}

function updateVersionFile() {
  const versionInfo = generateVersion();
  const versionPath = join(process.cwd(), 'public', 'version.json');
  
  writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));
  console.log('Version file updated:', versionInfo);
}

updateVersionFile();
```

### 1.2 버전 확인 API
```typescript
// app/api/version/route.ts
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const versionPath = join(process.cwd(), 'public', 'version.json');
    const versionInfo = JSON.parse(readFileSync(versionPath, 'utf-8'));
    
    return NextResponse.json(versionInfo);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read version info' },
      { status: 500 }
    );
  }
}
```

## 2. 백업 관리
### 2.1 데이터베이스 백업
```typescript
// scripts/backup/database.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { logEvent } from '@/lib/logging/logger';

const execAsync = promisify(exec);
const s3 = new S3Client({ region: process.env.AWS_REGION });

interface BackupOptions {
  database: string;
  bucket: string;
  prefix: string;
}

export async function backupDatabase({
  database,
  bucket,
  prefix,
}: BackupOptions) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${database}_${timestamp}.sql.gz`;
  const localPath = `/tmp/${filename}`;

  try {
    // 데이터베이스 덤프
    await execAsync(
      `pg_dump ${database} | gzip > ${localPath}`
    );

    // S3에 업로드
    const fileStream = createReadStream(localPath);
    const gzip = createGzip();
    
    await pipeline(
      fileStream,
      gzip,
      createWriteStream(localPath)
    );

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}/${filename}`,
        Body: createReadStream(localPath),
        ContentType: 'application/gzip',
      })
    );

    logEvent('info', 'Database backup completed', {
      database,
      filename,
      size: (await execAsync(`stat -f %z ${localPath}`)).stdout.trim(),
    });
  } catch (error) {
    logEvent('error', 'Database backup failed', { error });
    throw error;
  } finally {
    await execAsync(`rm -f ${localPath}`);
  }
}
```

### 2.2 파일 백업
```typescript
// scripts/backup/files.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { logEvent } from '@/lib/logging/logger';

const s3 = new S3Client({ region: process.env.AWS_REGION });

interface FileBackupOptions {
  sourcePath: string;
  bucket: string;
  prefix: string;
  patterns?: string[];
}

export async function backupFiles({
  sourcePath,
  bucket,
  prefix,
  patterns = ['**/*'],
}: FileBackupOptions) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    const files = await glob(patterns, {
      cwd: sourcePath,
      nodir: true,
    });

    for (const file of files) {
      const sourceFile = join(sourcePath, file);
      const key = `${prefix}/${timestamp}/${file}.gz`;

      const fileStream = createReadStream(sourceFile);
      const gzip = createGzip();

      await pipeline(
        fileStream,
        gzip,
        async (source) => {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: source,
              ContentType: 'application/gzip',
            })
          );
        }
      );

      logEvent('info', 'File backup completed', {
        file,
        key,
      });
    }
  } catch (error) {
    logEvent('error', 'File backup failed', { error });
    throw error;
  }
}
```

## 3. 시스템 모니터링
### 3.1 상태 체크
```typescript
// lib/monitoring/health.ts
import { prisma } from '@/lib/db/client';
import { redis } from '@/lib/cache/redis';
import { logEvent } from '@/lib/logging/logger';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  checks: {
    database: boolean;
    redis: boolean;
    api: boolean;
    storage: boolean;
  };
  details: Record<string, any>;
}

export async function checkSystemHealth(): Promise<HealthStatus> {
  const details: Record<string, any> = {};
  const checks = {
    database: false,
    redis: false,
    api: false,
    storage: false,
  };

  try {
    // 데이터베이스 체크
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
    details.database = { connectionPool: await getDatabaseStats() };
  } catch (error) {
    details.database = { error: error.message };
  }

  try {
    // Redis 체크
    await redis.ping();
    checks.redis = true;
    details.redis = { memory: await getRedisMemoryInfo() };
  } catch (error) {
    details.redis = { error: error.message };
  }

  try {
    // API 체크
    const apiResponse = await fetch('http://localhost:3000/api/health');
    checks.api = apiResponse.ok;
    details.api = { status: apiResponse.status };
  } catch (error) {
    details.api = { error: error.message };
  }

  try {
    // 스토리지 체크
    const { free, total } = await getStorageInfo();
    const usagePercent = ((total - free) / total) * 100;
    checks.storage = usagePercent < 90;
    details.storage = { free, total, usagePercent };
  } catch (error) {
    details.storage = { error: error.message };
  }

  const status = Object.values(checks).every(Boolean) ? 'healthy' : 'unhealthy';

  logEvent('info', 'System health check completed', {
    status,
    checks,
    details,
  });

  return { status, checks, details };
}

async function getDatabaseStats() {
  const stats = await prisma.$queryRaw`
    SELECT * FROM pg_stat_activity
    WHERE datname = current_database()
  `;
  return stats;
}

async function getRedisMemoryInfo() {
  const info = await redis.info('memory');
  return info;
}

async function getStorageInfo() {
  const { stdout } = await execAsync('df -k / | tail -1');
  const [, total, used, free] = stdout.split(/\s+/);
  return {
    total: parseInt(total) * 1024,
    free: parseInt(free) * 1024,
  };
}
```

### 3.2 성능 모니터링
```typescript
// lib/monitoring/performance.ts
import { logEvent } from '@/lib/logging/logger';
import { prisma } from '@/lib/db/client';

interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  slowQueries: any[];
}

export async function collectPerformanceMetrics(
  timeRange: { start: Date; end: Date }
): Promise<PerformanceMetrics> {
  try {
    // 요청 수 및 평균 응답 시간
    const requestMetrics = await prisma.requestLog.aggregate({
      where: {
        timestamp: {
          gte: timeRange.start,
          lte: timeRange.end,
        },
      },
      _count: true,
      _avg: {
        duration: true,
      },
    });

    // 에러율
    const errorCount = await prisma.requestLog.count({
      where: {
        timestamp: {
          gte: timeRange.start,
          lte: timeRange.end,
        },
        statusCode: {
          gte: 500,
        },
      },
    });

    // 느린 쿼리
    const slowQueries = await prisma.$queryRaw`
      SELECT query, calls, total_time, mean_time
      FROM pg_stat_statements
      WHERE mean_time > 1000
      ORDER BY mean_time DESC
      LIMIT 10
    `;

    const metrics = {
      requestCount: requestMetrics._count,
      averageResponseTime: requestMetrics._avg.duration || 0,
      errorRate: errorCount / requestMetrics._count,
      slowQueries,
    };

    logEvent('info', 'Performance metrics collected', metrics);

    return metrics;
  } catch (error) {
    logEvent('error', 'Failed to collect performance metrics', { error });
    throw error;
  }
}
```

## 4. 문제 해결
### 4.1 문제 진단
```typescript
// lib/diagnostics/troubleshoot.ts
import { logEvent } from '@/lib/logging/logger';
import { checkSystemHealth } from '@/lib/monitoring/health';
import { collectPerformanceMetrics } from '@/lib/monitoring/performance';

interface DiagnosticResult {
  status: 'ok' | 'warning' | 'error';
  issues: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    recommendation?: string;
  }>;
}

export async function diagnoseSystem(): Promise<DiagnosticResult> {
  const issues = [];
  let status = 'ok';

  try {
    // 시스템 상태 확인
    const health = await checkSystemHealth();
    if (health.status === 'unhealthy') {
      status = 'error';
      Object.entries(health.checks)
        .filter(([, isHealthy]) => !isHealthy)
        .forEach(([service]) => {
          issues.push({
            type: 'health',
            severity: 'high',
            message: `${service} is unhealthy`,
            recommendation: `Check ${service} logs and configuration`,
          });
        });
    }

    // 성능 메트릭 확인
    const metrics = await collectPerformanceMetrics({
      start: new Date(Date.now() - 3600000), // 최근 1시간
      end: new Date(),
    });

    if (metrics.errorRate > 0.05) {
      status = 'error';
      issues.push({
        type: 'performance',
        severity: 'high',
        message: `High error rate: ${(metrics.errorRate * 100).toFixed(2)}%`,
        recommendation: 'Review error logs and fix underlying issues',
      });
    }

    if (metrics.averageResponseTime > 1000) {
      status = status === 'ok' ? 'warning' : status;
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: `High average response time: ${metrics.averageResponseTime.toFixed(2)}ms`,
        recommendation: 'Optimize slow endpoints and database queries',
      });
    }

    if (metrics.slowQueries.length > 0) {
      status = status === 'ok' ? 'warning' : status;
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: `${metrics.slowQueries.length} slow queries detected`,
        recommendation: 'Review and optimize database queries',
      });
    }

    logEvent('info', 'System diagnosis completed', {
      status,
      issueCount: issues.length,
    });

    return { status, issues };
  } catch (error) {
    logEvent('error', 'System diagnosis failed', { error });
    return {
      status: 'error',
      issues: [{
        type: 'system',
        severity: 'high',
        message: 'Failed to complete system diagnosis',
        recommendation: 'Check system logs and try again',
      }],
    };
  }
}
```

### 4.2 자동 복구
```typescript
// lib/diagnostics/recovery.ts
import { logEvent } from '@/lib/logging/logger';
import { redis } from '@/lib/cache/redis';
import { prisma } from '@/lib/db/client';
import { execSync } from 'child_process';

interface RecoveryAction {
  type: string;
  description: string;
  action: () => Promise<void>;
}

const RECOVERY_ACTIONS: Record<string, RecoveryAction> = {
  clearCache: {
    type: 'cache',
    description: 'Clear Redis cache',
    action: async () => {
      await redis.flushall();
    },
  },
  restartApp: {
    type: 'application',
    description: 'Restart application process',
    action: async () => {
      execSync('pm2 restart all');
    },
  },
  reconnectDB: {
    type: 'database',
    description: 'Reconnect to database',
    action: async () => {
      await prisma.$disconnect();
      await prisma.$connect();
    },
  },
};

export async function attemptRecovery(issues: Array<{
  type: string;
  severity: string;
}>) {
  const recoveryLog = [];

  for (const issue of issues) {
    const actions = determineRecoveryActions(issue);
    
    for (const actionKey of actions) {
      const action = RECOVERY_ACTIONS[actionKey];
      
      try {
        await action.action();
        recoveryLog.push({
          issue: issue.type,
          action: action.description,
          status: 'success',
        });
      } catch (error) {
        recoveryLog.push({
          issue: issue.type,
          action: action.description,
          status: 'failed',
          error: error.message,
        });
      }
    }
  }

  logEvent('info', 'Recovery attempts completed', { recoveryLog });
  return recoveryLog;
}

function determineRecoveryActions(issue: { type: string; severity: string }): string[] {
  switch (issue.type) {
    case 'health':
      return ['reconnectDB', 'clearCache'];
    case 'performance':
      return ['clearCache'];
    default:
      return [];
  }
}
```

## 다음 단계
- step7-deployment-008.md: 재해 복구 및 비상 계획 