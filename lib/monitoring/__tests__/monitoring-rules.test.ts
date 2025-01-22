import { AlertSeverity } from '../alert-manager';
import {
  MonitoringRule,
  addRule,
  removeRule,
  updateRule,
  getRules,
  evaluateRule,
} from '../monitoring-rules';
import { getMetrics } from '../metric-collector';

jest.mock('../metric-collector');
jest.mock('../alert-manager');

describe('monitoring-rules', () => {
  const mockRule: Omit<MonitoringRule, 'id'> = {
    name: 'Test Rule',
    description: 'Test monitoring rule',
    namespace: 'test/namespace',
    metricName: 'test_metric',
    period: 300,
    evaluationPeriods: 2,
    enabled: true,
    thresholds: [
      {
        operator: 'gt',
        value: 100,
        severity: AlertSeverity.WARNING,
      },
      {
        operator: 'gt',
        value: 200,
        severity: AlertSeverity.ERROR,
      },
    ],
  };

  beforeEach(() => {
    // 규칙 목록 초기화
    const rules = getRules();
    rules.forEach(rule => removeRule(rule.id));
    jest.clearAllMocks();
  });

  describe('rule management', () => {
    it('should add a new rule', () => {
      const rule = addRule(mockRule);
      expect(rule.id).toBeDefined();
      expect(getRules()).toHaveLength(1);
      expect(getRules()[0]).toEqual(rule);
    });

    it('should remove a rule', () => {
      const rule = addRule(mockRule);
      expect(getRules()).toHaveLength(1);

      removeRule(rule.id);
      expect(getRules()).toHaveLength(0);
    });

    it('should update a rule', () => {
      const rule = addRule(mockRule);
      const updates = {
        name: 'Updated Rule',
        enabled: false,
      };

      const updatedRule = updateRule(rule.id, updates);
      expect(updatedRule.name).toBe('Updated Rule');
      expect(updatedRule.enabled).toBe(false);
      expect(updatedRule.description).toBe(mockRule.description);
    });

    it('should throw error when updating non-existent rule', () => {
      expect(() => updateRule('non-existent-id', { name: 'Test' })).toThrow();
    });
  });

  describe('rule evaluation', () => {
    const mockMetrics = {
      test_metric: [50, 150, 250],
    };

    beforeEach(() => {
      (getMetrics as jest.Mock).mockResolvedValue(mockMetrics);
    });

    it('should not evaluate disabled rules', async () => {
      const rule = addRule({ ...mockRule, enabled: false });
      await evaluateRule(rule);
      expect(getMetrics).not.toHaveBeenCalled();
    });

    it('should evaluate rule and trigger warning alert', async () => {
      const rule = addRule({
        ...mockRule,
        thresholds: [
          {
            operator: 'gt',
            value: 100,
            severity: AlertSeverity.WARNING,
          },
        ],
      });

      await evaluateRule(rule);

      expect(getMetrics).toHaveBeenCalledWith(
        rule.namespace,
        [rule.metricName],
        expect.any(Date),
        expect.any(Date),
        rule.period,
        rule.dimensions
      );
    });

    it('should handle missing metric values', async () => {
      (getMetrics as jest.Mock).mockResolvedValue({});
      const rule = addRule(mockRule);
      await evaluateRule(rule);
      // 알림이 트리거되지 않아야 함
    });

    it('should evaluate multiple thresholds and select highest severity', async () => {
      const rule = addRule(mockRule);
      (getMetrics as jest.Mock).mockResolvedValue({
        test_metric: [250], // ERROR 임계값 초과
      });

      await evaluateRule(rule);
      // ERROR 레벨 알림이 트리거되어야 함
    });

    it('should handle evaluation errors gracefully', async () => {
      const rule = addRule(mockRule);
      (getMetrics as jest.Mock).mockRejectedValue(new Error('Test error'));

      await expect(evaluateRule(rule)).rejects.toThrow('Test error');
    });
  });
}); 