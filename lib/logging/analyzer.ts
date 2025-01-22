import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { SearchHitsMetadata, SearchTotalHits, AggregationsAggregate } from '@elastic/elasticsearch/lib/api/types';
import { logEvent } from './collector';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../env';

interface ElasticsearchBucket {
  key: string;
  doc_count: number;
  avg_response_time: {
    value: number;
  };
}

interface ErrorBucket {
  key: string;
  doc_count: number;
}

interface ErrorCountAggregation {
  doc_count: number;
}

interface EndpointsAggregation {
  buckets: ElasticsearchBucket[];
}

interface ErrorMessagesAggregation {
  buckets: ErrorBucket[];
}

interface CustomAggregations {
  error_count?: ErrorCountAggregation;
  endpoints?: EndpointsAggregation;
  error_messages?: ErrorMessagesAggregation;
}

interface CustomSearchResponse {
  hits: SearchHitsMetadata<unknown>;
  aggregations?: Partial<Record<string, AggregationsAggregate>> & CustomAggregations;
}

const elasticsearch = new ElasticsearchClient({
  node: env.ELASTICSEARCH_URL,
  auth: {
    username: env.ELASTICSEARCH_USERNAME,
    password: env.ELASTICSEARCH_PASSWORD,
  },
});

interface LogAnalysis {
  id: string;
  timestamp: Date;
  timeRange: {
    start: Date;
    end: Date;
  };
  metrics: {
    totalLogs: number;
    errorRate: number;
    averageResponseTime: number;
    slowestEndpoints: Array<{
      path: string;
      method: string;
      averageResponseTime: number;
      count: number;
    }>;
    mostFrequentErrors: Array<{
      message: string;
      count: number;
    }>;
  };
}

export async function analyzeLogPatterns(
  startTime: Date,
  endTime: Date
): Promise<LogAnalysis> {
  try {
    const analysis: LogAnalysis = {
      id: uuidv4(),
      timestamp: new Date(),
      timeRange: {
        start: startTime,
        end: endTime,
      },
      metrics: {
        totalLogs: 0,
        errorRate: 0,
        averageResponseTime: 0,
        slowestEndpoints: [],
        mostFrequentErrors: [],
      },
    };

    // 전체 로그 수 및 에러율 계산
    const countResponse = await elasticsearch.search<CustomSearchResponse>({
      index: `logs-${env.APP_NAME}-${env.NODE_ENV}-*`,
      body: {
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: startTime.toISOString(),
                    lte: endTime.toISOString(),
                  },
                },
              },
            ],
          },
        },
        aggs: {
          error_count: {
            filter: {
              term: {
                level: 'error',
              },
            },
          },
        },
      },
    });

    if (countResponse.hits?.total && countResponse.aggregations?.error_count) {
      analysis.metrics.totalLogs = (countResponse.hits.total as SearchTotalHits).value;
      const errorCount = (countResponse.aggregations.error_count as unknown as ErrorCountAggregation).doc_count;
      analysis.metrics.errorRate = ((errorCount || 0) / analysis.metrics.totalLogs) * 100;
    }

    // 가장 느린 엔드포인트 분석
    const slowEndpointsResponse = await elasticsearch.search<CustomSearchResponse>({
      index: `logs-${env.APP_NAME}-${env.NODE_ENV}-*`,
      body: {
        size: 0,
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: startTime.toISOString(),
                    lte: endTime.toISOString(),
                  },
                },
              },
              {
                exists: {
                  field: 'metadata.responseTime',
                },
              },
            ],
          },
        },
        aggs: {
          endpoints: {
            terms: {
              script: "doc['metadata.path'].value + ' ' + doc['metadata.method'].value",
              size: 10,
            },
            aggs: {
              avg_response_time: {
                avg: {
                  field: 'metadata.responseTime',
                },
              },
            },
          },
        },
      },
    });

    if (slowEndpointsResponse.aggregations?.endpoints) {
      const endpoints = slowEndpointsResponse.aggregations.endpoints as unknown as EndpointsAggregation;
      if (endpoints.buckets) {
        analysis.metrics.slowestEndpoints = endpoints.buckets.map((bucket: ElasticsearchBucket) => {
          const [path = '', method = ''] = bucket.key.split(' ');
          return {
            path,
            method,
            averageResponseTime: bucket.avg_response_time.value,
            count: bucket.doc_count,
          };
        });
      }
    }

    // 가장 빈번한 에러 분석
    const frequentErrorsResponse = await elasticsearch.search<CustomSearchResponse>({
      index: `logs-${env.APP_NAME}-${env.NODE_ENV}-*`,
      body: {
        size: 0,
        query: {
          bool: {
            must: [
              {
                range: {
                  timestamp: {
                    gte: startTime.toISOString(),
                    lte: endTime.toISOString(),
                  },
                },
              },
              {
                term: {
                  level: 'error',
                },
              },
            ],
          },
        },
        aggs: {
          error_messages: {
            terms: {
              field: 'message.keyword',
              size: 10,
            },
          },
        },
      },
    });

    if (frequentErrorsResponse.aggregations?.error_messages) {
      const errorMessages = frequentErrorsResponse.aggregations.error_messages as unknown as ErrorMessagesAggregation;
      if (errorMessages.buckets) {
        analysis.metrics.mostFrequentErrors = errorMessages.buckets.map((bucket: ErrorBucket) => ({
          message: bucket.key,
          count: bucket.doc_count,
        }));
      }
    }

    await logEvent('info', 'Log analysis completed', { analysis });

    return analysis;
  } catch (error) {
    await logEvent('error', 'Failed to analyze log patterns', { error });
    throw error;
  }
} 