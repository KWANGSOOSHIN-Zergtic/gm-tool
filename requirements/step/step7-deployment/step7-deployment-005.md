# Step 7-005: 보안 및 규정 준수

## 1. 보안 설정
### 1.1 보안 헤더 설정
```typescript
// middleware/security.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = await NextResponse.next();

  // 보안 헤더 설정
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
  );
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  return response;
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
```

### 1.2 CORS 설정
```typescript
// lib/security/cors.ts
import { CorsOptions } from '@types/cors';

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Request-ID'],
  credentials: true,
  maxAge: 86400,
};
```

## 2. 인증 및 권한
### 2.1 JWT 설정
```typescript
// lib/security/jwt.ts
import { SignJWT, jwtVerify } from 'jose';
import { nanoid } from 'nanoid';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

interface JWTPayload {
  jti: string;
  sub: string;
  roles: string[];
  iat: number;
  exp: number;
}

export async function createToken(userId: string, roles: string[]) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 24 * 60 * 60; // 24시간

  return new SignJWT({
    roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(nanoid())
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as JWTPayload;
}
```

### 2.2 권한 미들웨어
```typescript
// middleware/auth.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/security/jwt';

export async function middleware(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) {
      throw new Error('No token provided');
    }

    const payload = await verifyToken(token);
    const hasRequiredRole = checkRole(request.nextUrl.pathname, payload.roles);

    if (!hasRequiredRole) {
      throw new Error('Insufficient permissions');
    }

    const response = await NextResponse.next();
    response.headers.set('X-User-ID', payload.sub);
    return response;
  } catch (error) {
    return new NextResponse(
      JSON.stringify({ error: 'Authentication failed' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}

function checkRole(pathname: string, userRoles: string[]): boolean {
  const roleRequirements: Record<string, string[]> = {
    '/api/admin': ['admin'],
    '/api/teams': ['admin', 'team_manager'],
    '/api/users': ['admin', 'user_manager'],
  };

  const requiredRoles = Object.entries(roleRequirements)
    .find(([path]) => pathname.startsWith(path))?.[1];

  if (!requiredRoles) {
    return true;
  }

  return userRoles.some(role => requiredRoles.includes(role));
}
```

## 3. 데이터 보안
### 3.1 암호화 유틸리티
```typescript
// lib/security/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');

interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

export function encrypt(text: string): EncryptedData {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

export function decrypt(data: EncryptedData): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(data.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
  
  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

### 3.2 민감 데이터 처리
```typescript
// lib/security/pii.ts
interface PIIFields {
  email: string;
  phone?: string;
  address?: string;
}

export function maskPII(data: PIIFields): PIIFields {
  return {
    email: maskEmail(data.email),
    phone: data.phone ? maskPhone(data.phone) : undefined,
    address: data.address ? maskAddress(data.address) : undefined,
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const maskedLocal = `${local[0]}${'*'.repeat(local.length - 2)}${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
}

function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

function maskAddress(address: string): string {
  const words = address.split(' ');
  return words
    .map((word, index) => (index === 0 ? word : '*'.repeat(word.length)))
    .join(' ');
}
```

## 4. 보안 감사
### 4.1 보안 감사 로그
```typescript
// lib/security/audit.ts
import { prisma } from '@/lib/db/client';
import { logEvent } from '@/lib/logging/logger';

interface AuditLogData {
  userId: string;
  action: string;
  resource: string;
  details?: Record<string, any>;
}

export async function createAuditLog({
  userId,
  action,
  resource,
  details,
}: AuditLogData) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        details,
        ipAddress: request.headers.get('x-forwarded-for') || request.ip,
        userAgent: request.headers.get('user-agent') || '',
      },
    });

    logEvent('info', 'Audit log created', {
      userId,
      action,
      resource,
    });
  } catch (error) {
    logEvent('error', 'Failed to create audit log', {
      error,
      userId,
      action,
      resource,
    });
    throw error;
  }
}
```

### 4.2 보안 검사
```typescript
// lib/security/checks.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import { logEvent } from '@/lib/logging/logger';

const execAsync = promisify(exec);

interface SecurityCheck {
  name: string;
  command: string;
  severity: 'low' | 'medium' | 'high';
}

const SECURITY_CHECKS: SecurityCheck[] = [
  {
    name: 'npm audit',
    command: 'npm audit --json',
    severity: 'high',
  },
  {
    name: 'eslint security',
    command: 'eslint . --config .eslintrc.security.js --format json',
    severity: 'medium',
  },
];

export async function runSecurityChecks() {
  const results = [];

  for (const check of SECURITY_CHECKS) {
    try {
      const { stdout } = await execAsync(check.command);
      const output = JSON.parse(stdout);

      results.push({
        name: check.name,
        severity: check.severity,
        passed: !hasSecurityIssues(output),
        details: output,
      });
    } catch (error) {
      logEvent('error', `Security check failed: ${check.name}`, { error });
      results.push({
        name: check.name,
        severity: check.severity,
        passed: false,
        error: error.message,
      });
    }
  }

  return results;
}

function hasSecurityIssues(output: any): boolean {
  // npm audit output
  if (output.metadata?.vulnerabilities) {
    return Object.values(output.metadata.vulnerabilities).some(
      (count: number) => count > 0
    );
  }

  // eslint output
  if (Array.isArray(output)) {
    return output.some(result => result.errorCount > 0);
  }

  return false;
}
```

## 다음 단계
- step7-deployment-006.md: 확장성 및 성능 최적화 