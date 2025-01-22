let evaluationInterval: NodeJS.Timeout | null = null;

export interface SchedulerConfig {
  interval: number; // 밀리초 단위
  onError?: (error: Error) => void;
}

export function startScheduler(
  evaluator: () => Promise<void>,
  interval: number,
  onError?: (error: Error) => void
): void {
  if (evaluationInterval) {
    throw new Error('Scheduler is already running');
  }

  const runEvaluation = async () => {
    try {
      await evaluator();
    } catch (error) {
      if (onError && error instanceof Error) {
        onError(error);
      } else {
        console.error('Error during evaluation:', error);
      }
    }
  };

  // 즉시 첫 번째 평가 실행
  void runEvaluation();

  // 주기적으로 평가 실행
  evaluationInterval = setInterval(() => {
    void runEvaluation();
  }, interval);
}

export function stopScheduler(): void {
  if (!evaluationInterval) {
    throw new Error('Scheduler is not running');
  }

  clearInterval(evaluationInterval);
  evaluationInterval = null;
}

export function isSchedulerRunning(): boolean {
  return evaluationInterval !== null;
} 