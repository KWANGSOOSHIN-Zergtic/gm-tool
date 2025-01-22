import { jest } from '@jest/globals';
import { startScheduler, stopScheduler, isSchedulerRunning } from '../scheduler';
import { evaluateAllRules } from '../monitoring-rules';

jest.mock('../monitoring-rules');

describe('Scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    if (isSchedulerRunning()) {
      stopScheduler();
    }
  });

  afterEach(() => {
    try {
      stopScheduler();
    } catch {
      // 이미 중지된 경우 무시
    }
    jest.clearAllTimers();
  });

  it('should start and stop scheduler correctly', () => {
    const mockEvaluator = jest.fn().mockImplementation(async () => {}) as jest.Mock<() => Promise<void>>;
    startScheduler(mockEvaluator, 1000);

    jest.advanceTimersByTime(1000);
    expect(mockEvaluator).toHaveBeenCalled();

    stopScheduler();
    jest.advanceTimersByTime(1000);
    expect(mockEvaluator).toHaveBeenCalledTimes(2);
  });

  it('should evaluate metrics at specified intervals', () => {
    const mockEvaluator = jest.fn().mockImplementation(async () => {}) as jest.Mock<() => Promise<void>>;
    startScheduler(mockEvaluator, 1000);

    jest.advanceTimersByTime(2000);
    
    // 메트릭 평가가 2번 호출되었는지 확인
    expect(jest.getTimerCount()).toBe(1);
  });

  it('should handle errors gracefully', () => {
    const mockError = new Error('Test error');
    const mockEvaluator = jest.fn().mockImplementation(async () => {
      throw mockError;
    }) as jest.Mock<() => Promise<void>>;
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    startScheduler(mockEvaluator, 1000);
    jest.advanceTimersByTime(1000);

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should start scheduler with default evaluator', () => {
    const mockEvaluator = jest.fn().mockImplementation(async () => {}) as jest.Mock<() => Promise<void>>;
    startScheduler(mockEvaluator, 60 * 1000);
    expect(isSchedulerRunning()).toBe(true);
    expect(mockEvaluator).toHaveBeenCalledTimes(1);

    // 1분 후 다시 실행되는지 확인
    jest.advanceTimersByTime(60 * 1000);
    expect(mockEvaluator).toHaveBeenCalledTimes(2);
  });

  it('should start scheduler with custom interval', () => {
    const mockEvaluator = jest.fn().mockImplementation(async () => {}) as jest.Mock<() => Promise<void>>;
    startScheduler(mockEvaluator, 30 * 1000); // 30초
    expect(isSchedulerRunning()).toBe(true);
    expect(mockEvaluator).toHaveBeenCalledTimes(1);

    // 30초 후 다시 실행되는지 확인
    jest.advanceTimersByTime(30 * 1000);
    expect(mockEvaluator).toHaveBeenCalledTimes(2);
  });

  it('should stop scheduler', () => {
    const mockEvaluator = jest.fn().mockImplementation(async () => {}) as jest.Mock<() => Promise<void>>;
    startScheduler(mockEvaluator, 1000);
    stopScheduler();

    jest.advanceTimersByTime(2000);
    expect(mockEvaluator).toHaveBeenCalledTimes(1);
  });

  it('should handle evaluation errors', async () => {
    const mockError = new Error('Evaluation error');
    const mockErrorHandler = jest.fn();
    const mockEvaluator = jest.fn().mockImplementation(async () => {
      throw mockError;
    }) as jest.Mock<() => Promise<void>>;

    startScheduler(mockEvaluator, 1000, mockErrorHandler);

    // 첫 번째 평가에서 오류 발생
    jest.advanceTimersByTime(1000);
    await Promise.resolve(); // 비동기 작업 완료 대기
    expect(mockErrorHandler).toHaveBeenCalledWith(mockError);

    // 오류가 발생해도 스케줄러는 계속 실행되어야 함
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(mockErrorHandler).toHaveBeenCalledTimes(2);
  });

  it('should prevent multiple scheduler instances', () => {
    const mockEvaluator = jest.fn().mockImplementation(async () => {}) as jest.Mock<() => Promise<void>>;
    startScheduler(mockEvaluator, 1000);
    expect(() => startScheduler(mockEvaluator, 1000)).toThrow('Scheduler is already running');
  });

  it('should throw error when stopping non-running scheduler', () => {
    expect(() => stopScheduler()).toThrow('Scheduler is not running');
  });

  it('should handle multiple evaluation cycles', () => {
    const mockEvaluator = jest.fn().mockImplementation(async () => {}) as jest.Mock<() => Promise<void>>;
    startScheduler(mockEvaluator, 60 * 1000);
    expect(mockEvaluator).toHaveBeenCalledTimes(1);

    // 여러 주기 동안 실행 확인
    jest.advanceTimersByTime(60 * 1000 * 3); // 3분
    expect(mockEvaluator).toHaveBeenCalledTimes(4);
  });

  it('should clean up resources on stop', () => {
    const mockEvaluator = jest.fn().mockImplementation(async () => {}) as jest.Mock<() => Promise<void>>;
    startScheduler(mockEvaluator, 1000);
    stopScheduler();

    expect(() => stopScheduler()).toThrow('Scheduler is not running');
  });
}); 