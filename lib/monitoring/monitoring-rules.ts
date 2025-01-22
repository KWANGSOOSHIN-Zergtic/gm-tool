import { v4 as uuidv4 } from 'uuid';
import { AlertSeverity, Alert, sendAlert } from './alert-manager';
import { getMetrics } from './metric-collector';
import { logEvent } from '../logging/collector';

export interface MonitoringThreshold {
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  value: number;
  severity: AlertSeverity;
}

export interface MonitoringRule {
  id: string;
  name: string;
  description: string;
  namespace: string;
  metricName: string;
  dimensions?: Record<string, string>;
  period: number;
  evaluationPeriods: number;
  thresholds: MonitoringThreshold[];
  enabled: boolean;
}

const rules: MonitoringRule[] = [];

export function addRule(rule: Omit<MonitoringRule, 'id'>): MonitoringRule {
  const newRule = { ...rule, id: uuidv4() };
  rules.push(newRule);
  return newRule;
}

export function removeRule(ruleId: string): void {
  const index = rules.findIndex(rule => rule.id === ruleId);
  if (index !== -1) {
    rules.splice(index, 1);
  }
}

export function updateRule(ruleId: string, updates: Partial<MonitoringRule>): MonitoringRule {
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) {
    throw new Error(`Rule not found: ${ruleId}`);
  }

  Object.assign(rule, updates);
  return rule;
}

export function getRules(): MonitoringRule[] {
  return [...rules];
}

function evaluateThreshold(value: number, threshold: MonitoringThreshold): boolean {
  switch (threshold.operator) {
    case 'gt':
      return value > threshold.value;
    case 'gte':
      return value >= threshold.value;
    case 'lt':
      return value < threshold.value;
    case 'lte':
      return value <= threshold.value;
    case 'eq':
      return value === threshold.value;
    default:
      return false;
  }
}

export async function evaluateRule(rule: MonitoringRule): Promise<void> {
  if (!rule.enabled) {
    return;
  }

  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - rule.evaluationPeriods * rule.period * 1000);

    const metrics = await getMetrics(
      rule.namespace,
      [rule.metricName],
      startTime,
      endTime,
      rule.period,
      rule.dimensions
    );

    const values = metrics[rule.metricName];
    if (!values || values.length === 0) {
      await logEvent('warn', 'No metric values found for rule evaluation', { ruleId: rule.id });
      return;
    }

    const latestValue = values[values.length - 1];
    if (typeof latestValue !== 'number') {
      await logEvent('warn', 'Latest metric value is not a number', {
        ruleId: rule.id,
        value: latestValue,
      });
      return;
    }

    const triggeredThresholds = rule.thresholds.filter(threshold =>
      evaluateThreshold(latestValue, threshold)
    );

    if (triggeredThresholds.length > 0) {
      // 가장 심각한 임계값 선택
      const severityLevels = {
        [AlertSeverity.INFO]: 0,
        [AlertSeverity.WARNING]: 1,
        [AlertSeverity.ERROR]: 2,
        [AlertSeverity.CRITICAL]: 3,
      };

      const highestSeverityThreshold = triggeredThresholds.reduce((prev, curr) =>
        severityLevels[curr.severity] > severityLevels[prev.severity] ? curr : prev
      );

      const alert: Alert = {
        id: uuidv4(),
        severity: highestSeverityThreshold.severity,
        title: `Monitoring Alert: ${rule.name}`,
        message: `Metric "${rule.metricName}" has triggered a ${
          highestSeverityThreshold.severity
        } alert.\nCurrent value: ${latestValue} ${highestSeverityThreshold.operator} ${
          highestSeverityThreshold.value
        }`,
        timestamp: new Date(),
        metadata: {
          ruleId: rule.id,
          ruleName: rule.name,
          metricName: rule.metricName,
          namespace: rule.namespace,
          dimensions: rule.dimensions,
          currentValue: latestValue,
          threshold: highestSeverityThreshold,
        },
      };

      await sendAlert(alert);
      await logEvent('info', 'Monitoring rule triggered alert', {
        ruleId: rule.id,
        alertId: alert.id,
      });
    }
  } catch (error) {
    await logEvent('error', 'Failed to evaluate monitoring rule', { error, ruleId: rule.id });
    throw error;
  }
}

export async function evaluateAllRules(): Promise<void> {
  const errors: Error[] = [];

  await Promise.all(
    rules.map(async rule => {
      try {
        await evaluateRule(rule);
      } catch (error) {
        if (error instanceof Error) {
          errors.push(error);
        }
      }
    })
  );

  if (errors.length > 0) {
    await logEvent('error', 'Some rules failed during evaluation', {
      errors: errors.map(e => e.message),
    });
    throw new Error(
      `Failed to evaluate some monitoring rules: ${errors.map(e => e.message).join(', ')}`
    );
  }
} 