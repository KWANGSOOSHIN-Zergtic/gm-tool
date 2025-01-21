# API 관련 규칙

## 1 기본 응답 인터페이스
```typescript
interface IApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    stack?: string; // development 환경에서만 포함
  };
  meta: {
    timestamp: number;
    requestId: string;
    version: string;
    environment: string;
    server: string;
    executionTime?: number;
  };
}

interface IPaginatedResponse<T> extends IApiResponse<T[]> {
  meta: {
    timestamp: number;
    requestId: string;
    version: string;
    environment: string;
    server: string;
    executionTime?: number;
    pagination: {
      currentPage: number;
      totalPages: number;
      pageSize: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      nextPage?: number;
      previousPage?: number;
    };
  };
}

interface IStreamResponse<T> extends IApiResponse<T> {
  meta: {
    timestamp: number;
    requestId: string;
    version: string;
    environment: string;
    server: string;
    streaming: {
      total: number;
      processed: number;
      remaining: number;
      estimatedTimeRemaining?: number;
    };
  };
}
```

## 2 에러 코드 정의
```typescript
enum ApiErrorCode {
  // 클라이언트 에러 (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  
  // 서버 에러 (5xx)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  
  // 비즈니스 로직 에러
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  DAILY_LIMIT_EXCEEDED = 'DAILY_LIMIT_EXCEEDED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',
  
  // 시스템 에러
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR'
}

interface IErrorResponse {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
  timestamp: number;
  requestId: string;
  path: string;
}
```

## 3 응답 예시
```typescript
// 성공 응답 예시
{
  "success": true,
  "data": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "USER",
    "createdAt": "2024-03-01T12:00:00Z",
    "updatedAt": "2024-03-01T12:00:00Z"
  },
  "meta": {
    "timestamp": 1648456789000,
    "requestId": "req_abc123",
    "version": "1.0.0",
    "environment": "production",
    "server": "api-server-01",
    "executionTime": 45
  }
}

// 페이지네이션 응답 예시
{
  "success": true,
  "data": [
    {
      "id": "user_123",
      "name": "John Doe"
    },
    {
      "id": "user_124",
      "name": "Jane Doe"
    }
  ],
  "meta": {
    "timestamp": 1648456789000,
    "requestId": "req_abc123",
    "version": "1.0.0",
    "environment": "production",
    "server": "api-server-01",
    "executionTime": 78,
    "pagination": {
      "currentPage": 1,
      "totalPages": 10,
      "pageSize": 20,
      "totalCount": 198,
      "hasNextPage": true,
      "hasPreviousPage": false,
      "nextPage": 2
    }
  }
}

// 에러 응답 예시
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "email": ["Invalid email format"],
      "password": ["Password must be at least 8 characters long"]
    }
  },
  "meta": {
    "timestamp": 1648456789000,
    "requestId": "req_abc123",
    "version": "1.0.0",
    "environment": "production",
    "server": "api-server-01",
    "executionTime": 12
  }
}

// 스트리밍 응답 예시
{
  "success": true,
  "data": {
    "chunk": "partial data..."
  },
  "meta": {
    "timestamp": 1648456789000,
    "requestId": "req_abc123",
    "version": "1.0.0",
    "environment": "production",
    "server": "api-server-01",
    "streaming": {
      "total": 1000,
      "processed": 400,
      "remaining": 600,
      "estimatedTimeRemaining": 30000
    }
  }
}
```