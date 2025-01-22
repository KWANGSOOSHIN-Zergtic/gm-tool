# Step 3-002: 데이터베이스 모델 정의

## 1. Prisma 스키마 정의
### 1.1 기본 모델
```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  password  String
  role      Role     @default(USER)
  status    Status   @default(ACTIVE)
  teams     TeamMember[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}

model Team {
  id          String   @id @default(uuid())
  name        String
  description String?
  members     TeamMember[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("teams")
}

model TeamMember {
  id        String   @id @default(uuid())
  userId    String
  teamId    String
  role      TeamRole @default(MEMBER)
  user      User     @relation(fields: [userId], references: [id])
  team      Team     @relation(fields: [teamId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, teamId])
  @@map("team_members")
}
```

### 1.2 열거형 정의
```prisma
enum Role {
  ADMIN
  USER
}

enum Status {
  ACTIVE
  INACTIVE
  SUSPENDED
}

enum TeamRole {
  OWNER
  ADMIN
  MEMBER
}
```

## 2. 타입 정의
### 2.1 모델 타입
```typescript
// types/models/user.ts
import { Role, Status } from '@prisma/client';

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  role: Role;
  status: Status;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
  role?: Role;
}

export interface UpdateUserDto {
  name?: string;
  password?: string;
  role?: Role;
  status?: Status;
}
```

### 2.2 관계 타입
```typescript
// types/models/team.ts
import { TeamRole } from '@prisma/client';
import type { User } from './user';

export interface Team {
  id: string;
  name: string;
  description?: string;
  members: TeamMember[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: TeamRole;
  user: User;
  team: Team;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTeamDto {
  name: string;
  description?: string;
  members?: {
    userId: string;
    role: TeamRole;
  }[];
}

export interface UpdateTeamDto {
  name?: string;
  description?: string;
}
```

## 3. 스키마 검증
### 3.1 사용자 스키마
```typescript
// lib/validations/user.ts
import { z } from 'zod';
import { Role, Status } from '@prisma/client';

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(100),
  role: z.nativeEnum(Role).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  password: z.string().min(8).max(100).optional(),
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(Status).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
```

### 3.2 팀 스키마
```typescript
// lib/validations/team.ts
import { z } from 'zod';
import { TeamRole } from '@prisma/client';

export const createTeamSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  members: z
    .array(
      z.object({
        userId: z.string().uuid(),
        role: z.nativeEnum(TeamRole),
      })
    )
    .optional(),
});

export const updateTeamSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
```

## 4. 모델 확장
### 4.1 가상 필드
```typescript
// lib/models/user.ts
import { Prisma } from '@prisma/client';

const userWithTeams = Prisma.validator<Prisma.UserArgs>()({
  include: {
    teams: {
      include: {
        team: true,
      },
    },
  },
});

export type UserWithTeams = Prisma.UserGetPayload<typeof userWithTeams>;

export const userExtensions = Prisma.defineExtension({
  name: 'userExtensions',
  model: {
    user: {
      async isTeamMember(userId: string, teamId: string) {
        const member = await prisma.teamMember.findUnique({
          where: {
            userId_teamId: {
              userId,
              teamId,
            },
          },
        });
        return !!member;
      },
    },
  },
});
```

### 4.2 모델 미들웨어
```typescript
// lib/models/middleware.ts
import { Prisma } from '@prisma/client';
import { hashPassword } from '@/lib/auth';

export const modelMiddleware: Prisma.Middleware = async (
  params: Prisma.MiddlewareParams,
  next
) => {
  if (params.model === 'User' && params.action === 'create') {
    if (params.args.data.password) {
      params.args.data.password = await hashPassword(params.args.data.password);
    }
  }
  return next(params);
};
```

## 다음 단계
- step3-data-layer-003.md: 리포지토리 구현
- step3-data-layer-004.md: 마이그레이션 관리 