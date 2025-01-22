# 모니터링 시스템 사용 가이드

## 개요

이 모니터링 시스템은 애플리케이션의 다양한 메트릭을 수집하고, 설정된 임계값에 따라 알림을 발생시키는 기능을 제공합니다.

## 주요 기능

1. 메트릭 수집
   - CloudWatch를 통한 메트릭 데이터 수집
   - 커스텀 메트릭 지원
   - 메트릭 배치 처리

2. 알림 관리
   - 다중 채널 지원 (이메일, SNS, Slack)
   - 심각도 기반 알림 라우팅
   - 알림 템플릿 커스터마이징

3. 모니터링 규칙
   - 유연한 임계값 설정
   - 다중 조건 지원
   - 규칙 활성화/비활성화

4. 자동 스케줄링
   - 주기적인 규칙 평가
   - 오류 처리 및 재시도
   - 스케줄러 제어

## 환경 설정

### 필수 환경 변수

```env
# AWS 설정
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# 애플리케이션 설정
APP_NAME=your_app_name
NODE_ENV=production

# 알림 설정
ALERT_EMAIL_FROM=alerts@your-domain.com
ALERT_SNS_TOPIC_ARN=arn:aws:sns:region:account-id:topic-name
ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

## 사용 방법

### 1. 기본 모니터링 설정

```typescript
import { setupDefaultMonitoring } from './lib/monitoring/examples';
import { startScheduler } from './lib/monitoring/scheduler';

// 기본 모니터링 규칙 설정
setupDefaultMonitoring();

// 스케줄러 시작 (1분 간격)
startScheduler();
```

### 2. 커스텀 모니터링 규칙 추가

```typescript
import { addRule } from './lib/monitoring/monitoring-rules';
import { AlertSeverity } from './lib/monitoring/alert-manager';

// 커스텀 규칙 추가
addRule({
  name: 'Custom Metric Monitor',
  description: 'Monitors a custom metric',
  namespace: 'CustomNamespace',
  metricName: 'custom_metric',
  period: 300,
  evaluationPeriods: 2,
  enabled: true,
  thresholds: [
    {
      operator: 'gt',
      value: 100,
      severity: AlertSeverity.WARNING,
    }
  ],
});
```

### 3. 커스텀 메트릭 발행

```typescript
import { publishMetrics } from './lib/monitoring/metric-collector';

// 메트릭 발행
await publishMetrics({
  namespace: 'CustomNamespace',
  metrics: [
    {
      name: 'custom_metric',
      value: 150,
      unit: 'Count',
      timestamp: new Date(),
      dimensions: {
        ServiceName: 'MyService',
        Environment: 'Production',
      },
    }
  ],
});
```

## 기본 제공 모니터링 규칙

1. API 응답 시간 모니터링
   - WARNING: > 1초
   - ERROR: > 2초
   - CRITICAL: > 5초

2. 에러율 모니터링
   - WARNING: > 1%
   - ERROR: > 5%
   - CRITICAL: > 10%

3. 시스템 리소스 모니터링
   - 메모리 사용량
   - CPU 사용량
   - 디스크 사용량
   - 임계값: 70% (WARNING), 85% (ERROR), 95% (CRITICAL)

## 알림 채널 설정

### 이메일 알림
- `ALERT_EMAIL_FROM` 환경 변수에 발신자 이메일 주소 설정
- AWS SES 설정 및 권한 필요

### SNS 알림
- `ALERT_SNS_TOPIC_ARN` 환경 변수에 SNS 토픽 ARN 설정
- AWS SNS 설정 및 권한 필요

### Slack 알림
- `ALERT_SLACK_WEBHOOK_URL` 환경 변수에 Webhook URL 설정
- Slack 앱 설정 및 Webhook 생성 필요

## 모범 사례

1. 임계값 설정
   - 단계적인 임계값 설정으로 점진적 대응
   - 실제 워크로드에 맞는 임계값 조정
   - 과도한 알림 방지를 위한 적절한 평가 기간 설정

2. 알림 관리
   - 심각도에 따른 적절한 알림 채널 선택
   - 알림 메시지의 명확한 작성
   - 불필요한 알림 최소화

3. 모니터링 규칙
   - 의미 있는 메트릭 선택
   - 적절한 평가 주기 설정
   - 규칙의 주기적인 검토 및 업데이트

## 문제 해결

### 일반적인 문제

1. 메트릭이 수집되지 않는 경우
   - AWS 자격 증명 확인
   - CloudWatch 권한 확인
   - 네임스페이스와 메트릭 이름 확인

2. 알림이 발송되지 않는 경우
   - 알림 채널 설정 확인
   - AWS SES/SNS 권한 확인
   - Slack Webhook URL 유효성 확인

3. 스케줄러 문제
   - 메모리 사용량 확인
   - 로그 확인
   - 평가 시간 조정 고려

### 로깅

모든 작업은 로깅되며, 다음 정보를 포함합니다:
- 메트릭 수집 결과
- 규칙 평가 결과
- 알림 발송 결과
- 오류 및 경고

## 보안 고려사항

1. 자격 증명 관리
   - AWS 자격 증명의 안전한 관리
   - 최소 권한 원칙 적용
   - 정기적인 자격 증명 순환

2. 알림 보안
   - 민감한 정보의 알림 포함 여부 검토
   - 알림 채널의 접근 제어
   - Webhook URL의 안전한 관리 