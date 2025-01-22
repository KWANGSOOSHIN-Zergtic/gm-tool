# Step 3-004: 마이그레이션 관리

## 1. 마이그레이션 기본 설정
### 1.1 마이그레이션 스크립트
```bash
# package.json
{
  "scripts": {
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "migrate:reset": "prisma migrate reset",
    "migrate:status": "prisma migrate status",
    "db:push": "prisma db push",
    "db:seed": "prisma db seed"
  }
}
```

### 1.2 마이그레이션 디렉토리 구조
```
prisma/
├── migrations/
│   ├── YYYYMMDDHHMMSS_migration_name/
│   │   ├── migration.sql
│   │   └── README.md
│   └── migration_lock.toml
├── schema.prisma
└── seed.ts
```

## 2. 초기 마이그레이션
### 2.1 사용자 테이블 마이그레이션
```sql
-- prisma/migrations/YYYYMMDDHHMMSS_create_users_table/migration.sql
CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "email" VARCHAR(255) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "password" VARCHAR(255) NOT NULL,
  "role" VARCHAR(20) NOT NULL DEFAULT 'USER',
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);

CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_status_idx" ON "users"("status");
```

### 2.2 팀 테이블 마이그레이션
```sql
-- prisma/migrations/YYYYMMDDHHMMSS_create_teams_table/migration.sql
CREATE TABLE "teams" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "name" VARCHAR(100) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_members" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "role" VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "team_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_members_user_team_key" UNIQUE ("user_id", "team_id"),
  CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE
);

CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");
CREATE INDEX "team_members_team_id_idx" ON "team_members"("team_id");
```

## 3. 시드 데이터
### 3.1 시드 설정
```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 관리자 계정 생성
  const adminPassword = await hash('admin123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  // 테스트 팀 생성
  const team = await prisma.team.create({
    data: {
      name: 'Test Team',
      description: 'This is a test team',
    },
  });

  // 테스트 사용자 생성 및 팀에 추가
  const userPassword = await hash('user123', 12);
  const user = await prisma.user.create({
    data: {
      email: 'user@example.com',
      name: 'Test User',
      password: userPassword,
      teams: {
        create: {
          teamId: team.id,
          role: 'MEMBER',
        },
      },
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

## 4. 마이그레이션 관리
### 4.1 마이그레이션 생성
```bash
# 스키마 변경 후 마이그레이션 생성
npm run migrate:dev -- --name add_user_fields

# 마이그레이션 상태 확인
npm run migrate:status
```

### 4.2 마이그레이션 적용
```bash
# 개발 환경에서 마이그레이션 적용
npm run migrate:dev

# 프로덕션 환경에서 마이그레이션 적용
npm run migrate:deploy
```

## 5. 스키마 변경 관리
### 5.1 필드 추가 예시
```sql
-- prisma/migrations/YYYYMMDDHHMMSS_add_user_fields/migration.sql
ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(20);
ALTER TABLE "users" ADD COLUMN "address" TEXT;
```

### 5.2 인덱스 관리
```sql
-- prisma/migrations/YYYYMMDDHHMMSS_add_user_indexes/migration.sql
CREATE INDEX "users_name_idx" ON "users"("name");
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- 불필요한 인덱스 제거
DROP INDEX IF EXISTS "users_status_idx";
```

## 6. 롤백 전략
### 6.1 롤백 마이그레이션
```sql
-- prisma/migrations/YYYYMMDDHHMMSS_add_user_fields/migration.sql
-- 업그레이드
ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(20);
ALTER TABLE "users" ADD COLUMN "address" TEXT;

-- 롤백
ALTER TABLE "users" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "users" DROP COLUMN IF EXISTS "address";
```

### 6.2 롤백 실행
```bash
# 마지막 마이그레이션 롤백
npm run migrate:reset -- --to PREVIOUS_MIGRATION_NAME

# 특정 시점으로 롤백
npm run migrate:reset -- --to SPECIFIC_MIGRATION_NAME
```

## 다음 단계
- step4-features-001.md: 기능 구현 시작 