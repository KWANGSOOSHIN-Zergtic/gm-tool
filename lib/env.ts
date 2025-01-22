import { z } from 'zod';

const envSchema = z.object({
  // AWS 설정
  AWS_REGION: z.string(),
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  
  // Elasticsearch 설정
  ELASTICSEARCH_URL: z.string(),
  ELASTICSEARCH_USERNAME: z.string(),
  ELASTICSEARCH_PASSWORD: z.string(),
  
  // 애플리케이션 설정
  APP_NAME: z.string(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  
  // S3 설정
  LOG_ARCHIVE_BUCKET: z.string(),

  // 알림 설정
  ALERT_EMAIL_FROM: z.string(),
  ALERT_SNS_TOPIC_ARN: z.string(),
  ALERT_SLACK_WEBHOOK_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let env: Env = {
  NODE_ENV: process.env.NODE_ENV as 'development' | 'production' | 'test',
  AWS_REGION: process.env.AWS_REGION || '',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL || '',
  ELASTICSEARCH_USERNAME: process.env.ELASTICSEARCH_USERNAME || '',
  ELASTICSEARCH_PASSWORD: process.env.ELASTICSEARCH_PASSWORD || '',
  APP_NAME: process.env.APP_NAME || '',
  LOG_ARCHIVE_BUCKET: process.env.LOG_ARCHIVE_BUCKET || '',
  ALERT_EMAIL_FROM: process.env.ALERT_EMAIL_FROM || '',
  ALERT_SNS_TOPIC_ARN: process.env.ALERT_SNS_TOPIC_ARN || '',
  ALERT_SLACK_WEBHOOK_URL: process.env.ALERT_SLACK_WEBHOOK_URL,
};

try {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ 잘못된 환경 변수:', result.error.format());
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  } else {
    env = result.data;
  }
} catch (err) {
  console.error('❌ 환경 변수 검증 중 오류 발생:', err);
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}

export { env }; 