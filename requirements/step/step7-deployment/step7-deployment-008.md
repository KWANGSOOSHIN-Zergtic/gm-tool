# Step 7-008: 재해 복구 및 비상 계획

## 1. 재해 복구 계획
### 1.1 복구 지점 목표 (RPO) 설정
```typescript
// lib/disaster-recovery/rpo.ts
import { prisma } from '@/lib/db/client';
import { backupDatabase } from '@/scripts/backup/database';
import { backupFiles } from '@/scripts/backup/files';
import { logEvent } from '@/lib/logging/logger';

interface RPOConfig {
  database: {
    interval: number; // 밀리초
    retention: number; // 일
  };
  files: {
    interval: number;
    retention: number;
  };
}

const RPO_CONFIG: RPOConfig = {
  database: {
    interval: 3600000, // 1시간
    retention: 30, // 30일
  },
  files: {
    interval: 86400000, // 24시간
    retention: 90, // 90일
  },
};

export async function scheduleBackups() {
  // 데이터베이스 백업 스케줄링
  setInterval(async () => {
    try {
      await backupDatabase({
        database: process.env.DB_NAME!,
        bucket: process.env.BACKUP_BUCKET!,
        prefix: 'database',
      });
    } catch (error) {
      logEvent('error', 'Scheduled database backup failed', { error });
    }
  }, RPO_CONFIG.database.interval);

  // 파일 백업 스케줄링
  setInterval(async () => {
    try {
      await backupFiles({
        sourcePath: process.env.UPLOAD_PATH!,
        bucket: process.env.BACKUP_BUCKET!,
        prefix: 'files',
      });
    } catch (error) {
      logEvent('error', 'Scheduled file backup failed', { error });
    }
  }, RPO_CONFIG.files.interval);
}

export async function cleanupOldBackups() {
  const s3 = new S3Client({ region: process.env.AWS_REGION });

  // 데이터베이스 백업 정리
  const dbRetentionDate = new Date();
  dbRetentionDate.setDate(dbRetentionDate.getDate() - RPO_CONFIG.database.retention);

  // 파일 백업 정리
  const fileRetentionDate = new Date();
  fileRetentionDate.setDate(fileRetentionDate.getDate() - RPO_CONFIG.files.retention);

  try {
    await Promise.all([
      cleanupBackups('database', dbRetentionDate),
      cleanupBackups('files', fileRetentionDate),
    ]);
  } catch (error) {
    logEvent('error', 'Backup cleanup failed', { error });
  }
}
```

### 1.2 복구 시간 목표 (RTO) 설정
```typescript
// lib/disaster-recovery/rto.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { logEvent } from '@/lib/logging/logger';

const execAsync = promisify(exec);
const s3 = new S3Client({ region: process.env.AWS_REGION });

interface RestoreOptions {
  backupKey: string;
  targetDatabase: string;
  targetPath: string;
}

export async function restoreFromBackup({
  backupKey,
  targetDatabase,
  targetPath,
}: RestoreOptions) {
  const startTime = Date.now();
  const steps = [];

  try {
    // 1. 백업 파일 다운로드
    steps.push({ name: 'download', startTime: Date.now() });
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.BACKUP_BUCKET!,
        Key: backupKey,
      })
    );

    const backupPath = `/tmp/${backupKey.split('/').pop()}`;
    await streamToFile(response.Body!, backupPath);
    steps[steps.length - 1].duration = Date.now() - steps[steps.length - 1].startTime;

    // 2. 데이터베이스 복원
    if (backupKey.startsWith('database/')) {
      steps.push({ name: 'restore_db', startTime: Date.now() });
      await execAsync(`gunzip -c ${backupPath} | psql ${targetDatabase}`);
      steps[steps.length - 1].duration = Date.now() - steps[steps.length - 1].startTime;
    }

    // 3. 파일 복원
    if (backupKey.startsWith('files/')) {
      steps.push({ name: 'restore_files', startTime: Date.now() });
      await execAsync(`tar -xzf ${backupPath} -C ${targetPath}`);
      steps[steps.length - 1].duration = Date.now() - steps[steps.length - 1].startTime;
    }

    const totalDuration = Date.now() - startTime;
    logEvent('info', 'Restore completed', {
      backupKey,
      totalDuration,
      steps,
    });

    return {
      success: true,
      duration: totalDuration,
      steps,
    };
  } catch (error) {
    logEvent('error', 'Restore failed', {
      backupKey,
      error,
      steps,
    });
    throw error;
  }
}
```

## 2. 비상 대응 계획
### 2.1 장애 감지 및 알림
```typescript
// lib/emergency/detection.ts
import { checkSystemHealth } from '@/lib/monitoring/health';
import { collectPerformanceMetrics } from '@/lib/monitoring/performance';
import { sendSlackAlert } from '@/lib/monitoring/notifications/slack';
import { sendEmailAlert } from '@/lib/monitoring/notifications/email';
import { logEvent } from '@/lib/logging/logger';

interface EmergencyThresholds {
  errorRate: number;
  responseTime: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
}

const EMERGENCY_THRESHOLDS: EmergencyThresholds = {
  errorRate: 0.1, // 10%
  responseTime: 2000, // 2초
  cpuUsage: 90, // 90%
  memoryUsage: 90, // 90%
  diskUsage: 95, // 95%
};

export async function monitorEmergencyConditions() {
  try {
    const health = await checkSystemHealth();
    const metrics = await collectPerformanceMetrics({
      start: new Date(Date.now() - 300000), // 최근 5분
      end: new Date(),
    });

    const emergencyConditions = [];

    // 에러율 체크
    if (metrics.errorRate > EMERGENCY_THRESHOLDS.errorRate) {
      emergencyConditions.push({
        type: 'error_rate',
        value: metrics.errorRate,
        threshold: EMERGENCY_THRESHOLDS.errorRate,
      });
    }

    // 응답 시간 체크
    if (metrics.averageResponseTime > EMERGENCY_THRESHOLDS.responseTime) {
      emergencyConditions.push({
        type: 'response_time',
        value: metrics.averageResponseTime,
        threshold: EMERGENCY_THRESHOLDS.responseTime,
      });
    }

    // 시스템 리소스 체크
    const { cpu, memory, disk } = await getSystemResources();
    
    if (cpu > EMERGENCY_THRESHOLDS.cpuUsage) {
      emergencyConditions.push({
        type: 'cpu_usage',
        value: cpu,
        threshold: EMERGENCY_THRESHOLDS.cpuUsage,
      });
    }

    if (memory > EMERGENCY_THRESHOLDS.memoryUsage) {
      emergencyConditions.push({
        type: 'memory_usage',
        value: memory,
        threshold: EMERGENCY_THRESHOLDS.memoryUsage,
      });
    }

    if (disk > EMERGENCY_THRESHOLDS.diskUsage) {
      emergencyConditions.push({
        type: 'disk_usage',
        value: disk,
        threshold: EMERGENCY_THRESHOLDS.diskUsage,
      });
    }

    if (emergencyConditions.length > 0) {
      await notifyEmergency(emergencyConditions);
    }
  } catch (error) {
    logEvent('error', 'Emergency monitoring failed', { error });
  }
}

async function notifyEmergency(conditions: any[]) {
  const message = formatEmergencyMessage(conditions);
  
  // Slack 알림
  await sendSlackAlert('error', message, [
    {
      color: 'danger',
      fields: conditions.map(condition => ({
        title: condition.type,
        value: `${condition.value} (threshold: ${condition.threshold})`,
        short: true,
      })),
    },
  ]);

  // 이메일 알림
  await sendEmailAlert({
    subject: '🚨 Emergency Alert: System Critical Conditions Detected',
    body: message,
    recipients: process.env.EMERGENCY_EMAIL_RECIPIENTS!.split(','),
    isHtml: true,
  });
}
```

### 2.2 비상 대응 절차
```typescript
// lib/emergency/response.ts
import { logEvent } from '@/lib/logging/logger';
import { restoreFromBackup } from '@/lib/disaster-recovery/rto';
import { redis } from '@/lib/cache/redis';
import { prisma } from '@/lib/db/client';

interface EmergencyResponse {
  type: string;
  actions: Array<() => Promise<void>>;
}

const EMERGENCY_RESPONSES: Record<string, EmergencyResponse> = {
  error_rate: {
    type: 'error_rate',
    actions: [
      // 1. 캐시 초기화
      async () => {
        await redis.flushall();
      },
      // 2. 애플리케이션 재시작
      async () => {
        await execAsync('pm2 restart all');
      },
    ],
  },
  response_time: {
    type: 'response_time',
    actions: [
      // 1. 커넥션 풀 리셋
      async () => {
        await prisma.$disconnect();
        await prisma.$connect();
      },
      // 2. 캐시 워밍업
      async () => {
        await warmupCache();
      },
    ],
  },
  system_resources: {
    type: 'system_resources',
    actions: [
      // 1. 불필요한 프로세스 정리
      async () => {
        await cleanupProcesses();
      },
      // 2. 로그 파일 정리
      async () => {
        await cleanupLogs();
      },
    ],
  },
};

export async function executeEmergencyResponse(type: string) {
  const response = EMERGENCY_RESPONSES[type];
  if (!response) {
    throw new Error(`No emergency response defined for type: ${type}`);
  }

  const results = [];
  for (const action of response.actions) {
    try {
      await action();
      results.push({
        type,
        status: 'success',
      });
    } catch (error) {
      results.push({
        type,
        status: 'failed',
        error: error.message,
      });
      logEvent('error', 'Emergency response action failed', {
        type,
        error,
      });
    }
  }

  return results;
}

async function cleanupProcesses() {
  const processes = await execAsync('ps aux --sort=-%mem | head -n 5');
  logEvent('info', 'Top memory consuming processes', {
    processes: processes.stdout,
  });
  
  // 메모리 정리
  if (global.gc) {
    global.gc();
  }
}

async function cleanupLogs() {
  const oldLogs = await execAsync('find /var/log -name "*.log" -mtime +7');
  await execAsync(`rm -f ${oldLogs.stdout.split('\n').join(' ')}`);
}
```

## 3. 시스템 복구 절차
### 3.1 데이터베이스 복구
```typescript
// lib/recovery/database.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { logEvent } from '@/lib/logging/logger';

const execAsync = promisify(exec);

interface RecoveryPoint {
  timestamp: Date;
  backupFile: string;
  walFiles: string[];
}

export async function recoverDatabase(point: RecoveryPoint) {
  try {
    // 1. 현재 데이터베이스 상태 저장
    await execAsync(
      `pg_dump ${process.env.DB_NAME} -f /tmp/pre_recovery_dump.sql`
    );

    // 2. 데이터베이스 초기화
    await execAsync(`dropdb ${process.env.DB_NAME}`);
    await execAsync(`createdb ${process.env.DB_NAME}`);

    // 3. 백업에서 복구
    await execAsync(
      `pg_restore -d ${process.env.DB_NAME} ${point.backupFile}`
    );

    // 4. WAL 파일 적용
    for (const walFile of point.walFiles) {
      await execAsync(
        `pg_waldump ${walFile} | psql ${process.env.DB_NAME}`
      );
    }

    // 5. 복구 검증
    const validation = await validateRecovery();
    if (!validation.success) {
      throw new Error(`Recovery validation failed: ${validation.error}`);
    }

    logEvent('info', 'Database recovery completed', {
      point,
      validation,
    });
  } catch (error) {
    logEvent('error', 'Database recovery failed', { error });
    
    // 롤백
    await execAsync(
      `psql ${process.env.DB_NAME} < /tmp/pre_recovery_dump.sql`
    );
    
    throw error;
  }
}

async function validateRecovery() {
  try {
    // 기본 연결 테스트
    await prisma.$queryRaw`SELECT 1`;

    // 데이터 정합성 검사
    const checks = await Promise.all([
      prisma.user.count(),
      prisma.team.count(),
      prisma.teamMember.count(),
    ]);

    const [userCount, teamCount, memberCount] = checks;

    return {
      success: true,
      counts: {
        users: userCount,
        teams: teamCount,
        members: memberCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
```

### 3.2 시스템 복구
```typescript
// lib/recovery/system.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { logEvent } from '@/lib/logging/logger';

const execAsync = promisify(exec);

interface SystemRecoveryPlan {
  steps: Array<{
    name: string;
    action: () => Promise<void>;
    rollback?: () => Promise<void>;
  }>;
}

export async function executeRecoveryPlan(plan: SystemRecoveryPlan) {
  const results = [];
  const completedSteps = [];

  try {
    for (const step of plan.steps) {
      logEvent('info', `Executing recovery step: ${step.name}`);
      
      await step.action();
      completedSteps.push(step);
      
      results.push({
        step: step.name,
        status: 'success',
      });
    }

    logEvent('info', 'System recovery completed', { results });
    return { success: true, results };
  } catch (error) {
    logEvent('error', 'System recovery failed', { error });

    // 롤백 실행
    for (const step of completedSteps.reverse()) {
      if (step.rollback) {
        try {
          await step.rollback();
        } catch (rollbackError) {
          logEvent('error', `Rollback failed for step: ${step.name}`, {
            error: rollbackError,
          });
        }
      }
    }

    return {
      success: false,
      error: error.message,
      results,
    };
  }
}

export const DEFAULT_RECOVERY_PLAN: SystemRecoveryPlan = {
  steps: [
    {
      name: 'Stop Application',
      action: async () => {
        await execAsync('pm2 stop all');
      },
      rollback: async () => {
        await execAsync('pm2 start all');
      },
    },
    {
      name: 'Backup Current State',
      action: async () => {
        await execAsync('tar -czf /tmp/recovery_backup.tar.gz /app/*');
      },
    },
    {
      name: 'Restore Configuration',
      action: async () => {
        await execAsync('cp /backup/config/.env /app/.env');
      },
      rollback: async () => {
        await execAsync('cp /tmp/recovery_backup/.env /app/.env');
      },
    },
    {
      name: 'Restore Database',
      action: async () => {
        await recoverDatabase({
          timestamp: new Date(),
          backupFile: '/backup/latest/database.sql',
          walFiles: [],
        });
      },
    },
    {
      name: 'Clear Cache',
      action: async () => {
        await redis.flushall();
      },
    },
    {
      name: 'Start Application',
      action: async () => {
        await execAsync('pm2 start all');
      },
    },
  ],
};
```

## 다음 단계
- step7-deployment-009.md: 보안 감사 및 컴플라이언스 