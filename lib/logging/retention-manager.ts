import { S3, S3ClientConfig } from '@aws-sdk/client-s3';
import { CloudWatchLogs } from '@aws-sdk/client-cloudwatch-logs';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { logEvent } from './collector';
import { env } from '../env';

interface ElasticsearchIndex {
  index: string;
  health: string;
  status: string;
  uuid: string;
}

const s3Config: S3ClientConfig = {
  region: env.AWS_REGION
};

const s3 = new S3(s3Config);
const cloudwatchLogs = new CloudWatchLogs({ region: env.AWS_REGION });
const elasticsearch = new ElasticsearchClient({
  node: env.ELASTICSEARCH_URL,
  auth: {
    username: env.ELASTICSEARCH_USERNAME,
    password: env.ELASTICSEARCH_PASSWORD,
  },
});

interface RetentionConfig {
  hotStorageDays: number;
  warmStorageDays: number;
  coldStorageDays: number;
  deleteAfterDays: number;
}

export async function manageLogRetention(config: RetentionConfig): Promise<void> {
  try {
    const now = new Date();

    // 오래된 로그 S3로 아카이브
    const oldIndices = await elasticsearch.cat.indices<ElasticsearchIndex[]>({
      format: 'json',
      index: `logs-${env.APP_NAME}-${env.NODE_ENV}-*`,
    });

    for (const index of oldIndices) {
      if (!index.index) continue;

      const indexDate = new Date(index.index.split('-').pop() || '');
      const ageInDays = (now.getTime() - indexDate.getTime()) / (1000 * 60 * 60 * 24);

      if (ageInDays > config.hotStorageDays) {
        // S3로 아카이브
        const logs = await elasticsearch.search({
          index: index.index,
          body: {
            query: {
              match_all: {},
            },
            size: 10000,
          },
        });

        await s3.putObject({
          Bucket: env.LOG_ARCHIVE_BUCKET,
          Key: `${index.index}.json`,
          Body: JSON.stringify(logs),
        });

        // 인덱스 삭제
        if (ageInDays > config.deleteAfterDays) {
          await elasticsearch.indices.delete({
            index: index.index,
          });
        }
      }
    }

    // CloudWatch Logs 보관 정책 업데이트
    await cloudwatchLogs.putRetentionPolicy({
      logGroupName: `/${env.APP_NAME}/${env.NODE_ENV}`,
      retentionInDays: config.deleteAfterDays,
    });

    await logEvent('info', 'Log retention management completed', { config });
  } catch (error) {
    await logEvent('error', 'Failed to manage log retention', { error });
    throw error;
  }
} 