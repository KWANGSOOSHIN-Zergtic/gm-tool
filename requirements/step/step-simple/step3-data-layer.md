# Step 3: 데이터 계층 구현

## 3.1 데이터베이스 스키마 설계
```prisma
// /prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  teamId    String?
  team      Team?    @relation(fields: [teamId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Team {
  id        String   @id @default(cuid())
  name      String
  users     User[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  ADMIN
  USER
}
```

## 3.2 데이터 접근 계층
```typescript
// /lib/db/client.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;

// /lib/db/repositories/user.ts
import prisma from '../client';
import type { User } from '@prisma/client';

export class UserRepository {
  static async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id }
    });
  }

  static async create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) {
    return prisma.user.create({
      data
    });
  }
}
```

## 3.3 마이그레이션 설정
```bash
# 마이그레이션 생성
npx prisma migrate dev --name init

# 마이그레이션 적용
npx prisma migrate deploy
```

## 3.4 시드 데이터 설정
```typescript
// /prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 관리자 계정 생성
  await prisma.user.create({
    data: {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN',
    },
  });

  // 테스트 팀 생성
  const team = await prisma.team.create({
    data: {
      name: 'Test Team',
    },
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

## 3.5 데이터베이스 유틸리티
```typescript
// /lib/db/utils.ts
export async function withTransaction<T>(
  callback: (tx: PrismaClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(callback);
}
```

## 다음 단계
- API 엔드포인트와 데이터베이스 연동
- 데이터 검증 로직 구현
- 캐싱 전략 수립 