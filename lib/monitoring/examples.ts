import { StandardUnit } from '@aws-sdk/client-cloudwatch';
import { AlertSeverity } from './alert-manager';
import { addRule } from './monitoring-rules';
import { env } from '../env';

// API 응답 시간 모니터링
export function setupApiLatencyMonitoring(): void {
  addRule({
    name: 'API Latency Monitor',
    description: 'Monitors API endpoint response times and alerts on high latency',
    namespace: `${env.APP_NAME}/${env.NODE_ENV}/api`,
    metricName: 'response_time',
    period: 300, // 5분
    evaluationPeriods: 2,
    enabled: true,
    thresholds: [
      {
        operator: 'gt',
        value: 1000, // 1초
        severity: AlertSeverity.WARNING,
      },
      {
        operator: 'gt',
        value: 2000, // 2초
        severity: AlertSeverity.ERROR,
      },
      {
        operator: 'gt',
        value: 5000, // 5초
        severity: AlertSeverity.CRITICAL,
      },
    ],
  });
}

// 에러율 모니터링
export function setupErrorRateMonitoring(): void {
  addRule({
    name: 'Error Rate Monitor',
    description: 'Monitors application error rate and alerts on high error rates',
    namespace: `${env.APP_NAME}/${env.NODE_ENV}/errors`,
    metricName: 'error_rate',
    period: 300, // 5분
    evaluationPeriods: 2,
    enabled: true,
    thresholds: [
      {
        operator: 'gt',
        value: 1, // 1%
        severity: AlertSeverity.WARNING,
      },
      {
        operator: 'gt',
        value: 5, // 5%
        severity: AlertSeverity.ERROR,
      },
      {
        operator: 'gt',
        value: 10, // 10%
        severity: AlertSeverity.CRITICAL,
      },
    ],
  });
}

// 메모리 사용량 모니터링
export function setupMemoryUsageMonitoring(): void {
  addRule({
    name: 'Memory Usage Monitor',
    description: 'Monitors application memory usage and alerts on high usage',
    namespace: `${env.APP_NAME}/${env.NODE_ENV}/system`,
    metricName: 'memory_usage_percent',
    period: 300, // 5분
    evaluationPeriods: 3,
    enabled: true,
    thresholds: [
      {
        operator: 'gt',
        value: 70, // 70%
        severity: AlertSeverity.WARNING,
      },
      {
        operator: 'gt',
        value: 85, // 85%
        severity: AlertSeverity.ERROR,
      },
      {
        operator: 'gt',
        value: 95, // 95%
        severity: AlertSeverity.CRITICAL,
      },
    ],
  });
}

// CPU 사용량 모니터링
export function setupCpuUsageMonitoring(): void {
  addRule({
    name: 'CPU Usage Monitor',
    description: 'Monitors application CPU usage and alerts on high usage',
    namespace: `${env.APP_NAME}/${env.NODE_ENV}/system`,
    metricName: 'cpu_usage_percent',
    period: 300, // 5분
    evaluationPeriods: 3,
    enabled: true,
    thresholds: [
      {
        operator: 'gt',
        value: 70, // 70%
        severity: AlertSeverity.WARNING,
      },
      {
        operator: 'gt',
        value: 85, // 85%
        severity: AlertSeverity.ERROR,
      },
      {
        operator: 'gt',
        value: 95, // 95%
        severity: AlertSeverity.CRITICAL,
      },
    ],
  });
}

// 디스크 사용량 모니터링
export function setupDiskUsageMonitoring(): void {
  addRule({
    name: 'Disk Usage Monitor',
    description: 'Monitors disk usage and alerts on high usage',
    namespace: `${env.APP_NAME}/${env.NODE_ENV}/system`,
    metricName: 'disk_usage_percent',
    period: 300, // 5분
    evaluationPeriods: 3,
    enabled: true,
    thresholds: [
      {
        operator: 'gt',
        value: 70, // 70%
        severity: AlertSeverity.WARNING,
      },
      {
        operator: 'gt',
        value: 85, // 85%
        severity: AlertSeverity.ERROR,
      },
      {
        operator: 'gt',
        value: 95, // 95%
        severity: AlertSeverity.CRITICAL,
      },
    ],
  });
}

// 모든 기본 모니터링 규칙 설정
export function setupDefaultMonitoring(): void {
  setupApiLatencyMonitoring();
  setupErrorRateMonitoring();
  setupMemoryUsageMonitoring();
  setupCpuUsageMonitoring();
  setupDiskUsageMonitoring();
} 