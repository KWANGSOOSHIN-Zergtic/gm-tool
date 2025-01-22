# Step 5-003: 보안 최적화

## 1. 인증 보안
### 1.1 토큰 보안 강화
```typescript
// lib/auth/token.ts
import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';
import { env } from '@/lib/env';

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function createToken(payload: any) {
  const jti = nanoid();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 24; // 24시간

  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setExpirationTime(exp)
    .setIssuedAt(iat)
    .setNotBefore(iat)
    .setJti(jti)
    .sign(secret);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });
    return payload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}
```

### 1.2 비밀번호 보안
```typescript
// lib/auth/password.ts
import { hash, compare } from 'bcryptjs';
import { randomBytes } from 'crypto';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return await compare(password, hashedPassword);
}

export function generateSecurePassword(): string {
  return randomBytes(32).toString('hex');
}
```

## 2. API 보안
### 2.1 CORS 설정
```typescript
// lib/api/cors.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';

const ALLOWED_ORIGINS = env.CORS_ORIGINS.split(',');
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
];

export function corsMiddleware(
  request: NextRequest,
  response: NextResponse
) {
  const origin = request.headers.get('origin');
  
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set(
      'Access-Control-Allow-Methods',
      ALLOWED_METHODS.join(',')
    );
    response.headers.set(
      'Access-Control-Allow-Headers',
      ALLOWED_HEADERS.join(',')
    );
    response.headers.set('Access-Control-Max-Age', '86400');
  }

  return response;
}
```

### 2.2 보안 헤더
```typescript
// next.config.js
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

## 3. 데이터 보안
### 3.1 데이터 암호화
```typescript
// lib/security/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '@/lib/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const ENCRYPTION_KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex');

export function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const salt = randomBytes(SALT_LENGTH);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')])
    .toString('base64');
}

export function decrypt(encryptedText: string): string {
  const buffer = Buffer.from(encryptedText, 'base64');
  
  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buffer.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH
  );
  const content = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(content);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}
```

### 3.2 민감 데이터 처리
```typescript
// lib/security/sanitizer.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
    ALLOWED_ATTR: ['href'],
  });
}

export function sanitizeUserInput(input: string): string {
  return input.replace(/[<>]/g, '');
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name[0]}${'*'.repeat(name.length - 2)}${name.slice(-1)}@${domain}`;
}
```

## 4. 접근 제어
### 4.1 RBAC (Role-Based Access Control)
```typescript
// lib/auth/rbac.ts
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';

export enum Permission {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  ADMIN = 'admin',
}

const rolePermissions = {
  ADMIN: [
    Permission.READ,
    Permission.WRITE,
    Permission.DELETE,
    Permission.ADMIN,
  ],
  USER: [Permission.READ, Permission.WRITE],
  GUEST: [Permission.READ],
};

export async function checkPermission(
  permission: Permission,
  resourceId?: string
): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  const userRole = session.role;
  const permissions = rolePermissions[userRole] || [];

  if (!permissions.includes(permission)) {
    return false;
  }

  if (resourceId) {
    const resource = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { permissions: true },
    });

    return resource?.permissions.some(
      (p) => p.userId === session.id && p.type === permission
    ) || false;
  }

  return true;
}
```

### 4.2 미들웨어 보호
```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth/token';
import { checkPermission, Permission } from '@/lib/auth/rbac';

export async function middleware(request: NextRequest) {
  // CSRF 토큰 검증
  const csrfToken = request.headers.get('X-CSRF-Token');
  const expectedToken = request.cookies.get('csrf')?.value;

  if (!csrfToken || csrfToken !== expectedToken) {
    return NextResponse.json(
      { error: 'Invalid CSRF token' },
      { status: 403 }
    );
  }

  // JWT 토큰 검증
  const token = request.cookies.get('token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const payload = await verifyToken(token);
    const hasPermission = await checkPermission(Permission.READ);

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('user', JSON.stringify(payload));

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
```

## 5. 보안 모니터링
### 5.1 보안 로깅
```typescript
// lib/security/audit.ts
import { logger } from '@/lib/logging/logger';
import { prisma } from '@/lib/db/client';

interface AuditLogData {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
}

export async function auditLog({
  userId,
  action,
  resource,
  resourceId,
  details,
}: AuditLogData) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        details: details ? JSON.stringify(details) : null,
      },
    });

    logger.info({
      userId,
      action,
      resource,
      resourceId,
      details,
    }, 'Audit log created');
  } catch (error) {
    logger.error({
      error,
      userId,
      action,
      resource,
    }, 'Failed to create audit log');
  }
}
```

### 5.2 보안 알림
```typescript
// lib/security/alerts.ts
import { logger } from '@/lib/logging/logger';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';

interface SecurityAlert {
  type: 'login_failure' | 'permission_denied' | 'suspicious_activity';
  userId: string;
  details: Record<string, any>;
}

export async function sendSecurityAlert({
  type,
  userId,
  details,
}: SecurityAlert) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return;

    await sendEmail({
      to: user.email,
      subject: `보안 알림: ${type}`,
      template: 'security-alert',
      data: {
        type,
        details,
        timestamp: new Date().toISOString(),
      },
    });

    logger.warn({
      type,
      userId,
      details,
    }, 'Security alert sent');
  } catch (error) {
    logger.error({
      error,
      type,
      userId,
    }, 'Failed to send security alert');
  }
}
```

## 다음 단계
- step6-testing-001.md: 테스트 구현 