# Step 3-001: 데이터베이스 설정

## 1. Prisma 초기 설정
### 1.1 Prisma CLI 설치
```bash
npm install prisma --save-dev
npm install @prisma/client
```

### 1.2 Prisma 초기화
```bash
npx prisma init
```

### 1.3 환경 변수 설정
```env
# .env
DATABASE_URL="postgresql://user:password@localhost:5432/gm_tool_db?schema=public"
```

## 2. 데이터베이스 연결 설정
### 2.1 데이터베이스 클라이언트
```typescript
// lib/db/client.ts
import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
```

### 2.2 데이터베이스 연결 관리
```typescript
// lib/db/connection.ts
import { prisma } from './client';

export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

export async function disconnectDB() {
  await prisma.$disconnect();
  console.log('Database disconnected');
}

// 연결 상태 모니터링
export async function checkConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
```

## 3. 데이터베이스 설정
### 3.1 PostgreSQL 설정
```sql
-- init.sql
CREATE DATABASE gm_tool_db;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### 3.2 데이터베이스 풀 설정
```typescript
// lib/db/pool.ts
import { Pool } from 'pg';

const pool = new Pool({
  max: 20,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;
```

## 4. 데이터베이스 유틸리티
### 4.1 트랜잭션 관리
```typescript
// lib/db/transaction.ts
import { prisma } from './client';
import type { PrismaClient, Prisma } from '@prisma/client';

export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return await prisma.$transaction(async (tx) => {
    return await fn(tx);
  });
}

export async function withNestedTransaction<T>(
  tx: Prisma.TransactionClient | PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if ('$transaction' in tx) {
    return await fn(tx as Prisma.TransactionClient);
  }
  return await withTransaction(fn);
}
```

### 4.2 데이터베이스 헬퍼
```typescript
// lib/db/helpers.ts
import { Prisma } from '@prisma/client';

export function createWhereClause(filters: Record<string, any>): Prisma.JsonObject {
  const where: Prisma.JsonObject = {};
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      where[key] = value;
    }
  });
  
  return where;
}

export function createOrderByClause(
  sortField?: string,
  sortOrder: 'asc' | 'desc' = 'desc'
): Prisma.JsonObject {
  if (!sortField) return { createdAt: 'desc' };
  
  return {
    [sortField]: sortOrder,
  };
}
```

## 5. 데이터베이스 보안
### 5.1 접근 제어 설정
```sql
-- security.sql
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gm_tool_user;
```

### 5.2 데이터 암호화
```typescript
// lib/db/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY!;
const ALGORITHM = 'aes-256-gcm';

export function encryptField(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptField(encryptedData: string): string {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
  
  const decipher = createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(ivHex, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

## 다음 단계
- step3-data-layer-002.md: 모델 정의
- step3-data-layer-003.md: 리포지토리 구현 