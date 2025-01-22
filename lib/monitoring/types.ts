export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL'
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  timestamp: Date;
  metadata?: Record<string, unknown>;
} 