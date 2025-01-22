# Step 2-006: API 보안 강화 및 인증/인가 시스템

## 1. 보안 헤더 설정
### 1.1 보안 미들웨어
- [ ] /lib/api/middleware/security.ts
  ```typescript
  import helmet from 'helmet';
  import cors from 'cors';

  export const securityMiddleware = [
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", process.env.API_URL]
        }
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      crossOriginResourcePolicy: { policy: 'same-site' },
      dnsPrefetchControl: true,
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: true,
      ieNoOpen: true,
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true
    }),
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Range', 'X-Content-Range'],
      credentials: true,
      maxAge: 600
    })
  ];
  ```

## 2. 인증 시스템
### 2.1 JWT 설정
- [ ] /lib/auth/jwt.ts
  ```typescript
  import jwt from 'jsonwebtoken';
  import { TokenPayload, TokenType } from './types';

  export class JWTService {
    private readonly secret: string;
    private readonly refreshSecret: string;

    constructor() {
      this.secret = process.env.JWT_SECRET!;
      this.refreshSecret = process.env.JWT_REFRESH_SECRET!;
    }

    generateToken(payload: TokenPayload, type: TokenType = 'access'): string {
      const secret = type === 'access' ? this.secret : this.refreshSecret;
      const expiresIn = type === 'access' ? '1h' : '7d';

      return jwt.sign(payload, secret, {
        expiresIn,
        audience: process.env.JWT_AUDIENCE,
        issuer: process.env.JWT_ISSUER
      });
    }

    verifyToken(token: string, type: TokenType = 'access'): TokenPayload {
      const secret = type === 'access' ? this.secret : this.refreshSecret;
      return jwt.verify(token, secret) as TokenPayload;
    }
  }
  ```

### 2.2 인증 미들웨어
- [ ] /lib/api/middleware/auth.ts
  ```typescript
  import { NextApiRequest, NextApiResponse } from 'next';
  import { JWTService } from '@/lib/auth/jwt';
  import { ApiError } from '@/lib/errors/api-error';

  const jwtService = new JWTService();

  export const authMiddleware = async (
    req: NextApiRequest,
    res: NextApiResponse,
    next: () => void
  ) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        throw new ApiError('UNAUTHORIZED', '인증이 필요합니다.');
      }

      const payload = jwtService.verifyToken(token);
      req.user = payload;
      
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new ApiError('TOKEN_EXPIRED', '토큰이 만료되었습니다.');
      }
      throw new ApiError('INVALID_TOKEN', '유효하지 않은 토큰입니다.');
    }
  };
  ```

## 3. 인가 시스템
### 3.1 역할 기반 접근 제어 (RBAC)
- [ ] /lib/auth/rbac.ts
  ```typescript
  import { Role, Permission } from './types';

  export const rolePermissions: Record<Role, Permission[]> = {
    ADMIN: ['read:all', 'write:all', 'delete:all'],
    MANAGER: ['read:all', 'write:own', 'delete:own'],
    USER: ['read:own', 'write:own']
  };

  export class RBACService {
    hasPermission(userRole: Role, requiredPermission: Permission): boolean {
      return rolePermissions[userRole].includes(requiredPermission);
    }

    requirePermission(permission: Permission) {
      return async (req: NextApiRequest, res: NextApiResponse, next: () => void) => {
        const userRole = req.user?.role as Role;
        
        if (!this.hasPermission(userRole, permission)) {
          throw new ApiError('FORBIDDEN', '권한이 없습니다.');
        }
        
        next();
      };
    }
  }
  ```

### 3.2 리소스 접근 제어
- [ ] /lib/auth/resource-access.ts
  ```typescript
  import { ResourceType } from './types';

  export class ResourceAccessService {
    async canAccess(
      userId: string,
      resourceType: ResourceType,
      resourceId: string,
      action: 'read' | 'write' | 'delete'
    ): Promise<boolean> {
      // 리소스 소유자 확인
      const resource = await this.getResource(resourceType, resourceId);
      
      if (!resource) {
        return false;
      }

      // 관리자는 모든 접근 허용
      if (req.user?.role === 'ADMIN') {
        return true;
      }

      // 소유자 확인
      if (resource.ownerId === userId) {
        return true;
      }

      // 팀 멤버 확인
      if (resource.teamId) {
        const isMember = await this.isTeamMember(userId, resource.teamId);
        return isMember;
      }

      return false;
    }

    requireResourceAccess(resourceType: ResourceType, action: 'read' | 'write' | 'delete') {
      return async (req: NextApiRequest, res: NextApiResponse, next: () => void) => {
        const resourceId = req.query.id as string;
        const userId = req.user?.id;

        const hasAccess = await this.canAccess(userId, resourceType, resourceId, action);
        
        if (!hasAccess) {
          throw new ApiError('FORBIDDEN', '리소스에 대한 접근 권한이 없습니다.');
        }
        
        next();
      };
    }
  }
  ```

## 4. 보안 모니터링
### 4.1 보안 로깅
- [ ] /lib/monitoring/security-logger.ts
  ```typescript
  import { createLogger, format, transports } from 'winston';

  export const securityLogger = createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp(),
      format.json()
    ),
    defaultMeta: { service: 'security-service' },
    transports: [
      new transports.File({ filename: 'logs/security-error.log', level: 'error' }),
      new transports.File({ filename: 'logs/security.log' })
    ]
  });

  export const logSecurityEvent = (
    eventType: string,
    details: Record<string, any>
  ) => {
    securityLogger.info({
      eventType,
      ...details,
      timestamp: new Date().toISOString()
    });
  };
  ```

### 4.2 보안 알림
- [ ] /lib/monitoring/security-alerts.ts
  ```typescript
  import { AlertManager } from './types';

  export const securityAlertConfig = {
    thresholds: {
      failedLogins: 5, // 5회 이상의 로그인 실패
      bruteForceAttempts: 10, // 10회 이상의 시도
      suspiciousIPs: 3 // 3개 이상의 의심스러운 IP
    },
    channels: {
      slack: process.env.SECURITY_SLACK_WEBHOOK_URL,
      email: process.env.SECURITY_ALERT_EMAIL
    }
  };

  export const securityAlertManager = new AlertManager(securityAlertConfig);
  ```

## 5. 보안 테스트
### 5.1 보안 테스트 설정
- [ ] /tests/security/auth.test.ts
  ```typescript
  import { JWTService } from '@/lib/auth/jwt';
  import { RBACService } from '@/lib/auth/rbac';

  describe('Authentication Tests', () => {
    const jwtService = new JWTService();

    it('should generate and verify access token', () => {
      const payload = { id: '1', role: 'USER' };
      const token = jwtService.generateToken(payload);
      const decoded = jwtService.verifyToken(token);
      
      expect(decoded.id).toBe(payload.id);
      expect(decoded.role).toBe(payload.role);
    });

    it('should throw error for expired token', () => {
      // 만료된 토큰 테스트
      expect(() => {
        jwtService.verifyToken('expired.token.here');
      }).toThrow('TokenExpiredError');
    });
  });

  describe('Authorization Tests', () => {
    const rbacService = new RBACService();

    it('should verify correct permissions', () => {
      expect(rbacService.hasPermission('ADMIN', 'read:all')).toBe(true);
      expect(rbacService.hasPermission('USER', 'write:all')).toBe(false);
    });
  });
  ```

## 다음 단계
- step2-api-007.md: API 배포 및 운영 가이드라인 