# Step 3-003: 리포지토리 구현

## 1. 기본 리포지토리 인터페이스
### 1.1 Repository 인터페이스
```typescript
// lib/repositories/base.ts
export interface Repository<T, CreateDTO, UpdateDTO> {
  findById(id: string): Promise<T | null>;
  findMany(params: {
    where?: Record<string, any>;
    orderBy?: Record<string, 'asc' | 'desc'>;
    skip?: number;
    take?: number;
  }): Promise<T[]>;
  create(data: CreateDTO): Promise<T>;
  update(id: string, data: UpdateDTO): Promise<T>;
  delete(id: string): Promise<void>;
  count(where?: Record<string, any>): Promise<number>;
}
```

### 1.2 Prisma 기본 리포지토리
```typescript
// lib/repositories/prisma-base.ts
import { PrismaClient } from '@prisma/client';
import { Repository } from './base';

export abstract class PrismaRepository<T, CreateDTO, UpdateDTO> implements Repository<T, CreateDTO, UpdateDTO> {
  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly modelName: string
  ) {}

  protected get model() {
    return this.prisma[this.modelName];
  }

  async findById(id: string): Promise<T | null> {
    return await this.model.findUnique({
      where: { id },
    }) as T | null;
  }

  async findMany(params: {
    where?: Record<string, any>;
    orderBy?: Record<string, 'asc' | 'desc'>;
    skip?: number;
    take?: number;
  }): Promise<T[]> {
    return await this.model.findMany(params) as T[];
  }

  async create(data: CreateDTO): Promise<T> {
    return await this.model.create({ data }) as T;
  }

  async update(id: string, data: UpdateDTO): Promise<T> {
    return await this.model.update({
      where: { id },
      data,
    }) as T;
  }

  async delete(id: string): Promise<void> {
    await this.model.delete({
      where: { id },
    });
  }

  async count(where?: Record<string, any>): Promise<number> {
    return await this.model.count({ where });
  }
}
```

## 2. 사용자 리포지토리
### 2.1 사용자 리포지토리 구현
```typescript
// lib/repositories/user.ts
import { PrismaClient, User } from '@prisma/client';
import { PrismaRepository } from './prisma-base';
import type { CreateUserDto, UpdateUserDto } from '@/types/models/user';

export class UserRepository extends PrismaRepository<User, CreateUserDto, UpdateUserDto> {
  constructor(prisma: PrismaClient) {
    super(prisma, 'user');
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findWithTeams(id: string): Promise<User & { teams: any[] }> {
    return await this.prisma.user.findUnique({
      where: { id },
      include: {
        teams: {
          include: {
            team: true,
          },
        },
      },
    });
  }

  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }
}
```

## 3. 팀 리포지토리
### 3.1 팀 리포지토리 구현
```typescript
// lib/repositories/team.ts
import { PrismaClient, Team } from '@prisma/client';
import { PrismaRepository } from './prisma-base';
import type { CreateTeamDto, UpdateTeamDto } from '@/types/models/team';

export class TeamRepository extends PrismaRepository<Team, CreateTeamDto, UpdateTeamDto> {
  constructor(prisma: PrismaClient) {
    super(prisma, 'team');
  }

  async findWithMembers(id: string): Promise<Team & { members: any[] }> {
    return await this.prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  async addMember(teamId: string, userId: string, role: string): Promise<void> {
    await this.prisma.teamMember.create({
      data: {
        teamId,
        userId,
        role,
      },
    });
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    await this.prisma.teamMember.delete({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
    });
  }

  async updateMemberRole(teamId: string, userId: string, role: string): Promise<void> {
    await this.prisma.teamMember.update({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
      data: { role },
    });
  }
}
```

## 4. 리포지토리 팩토리
### 4.1 리포지토리 생성 팩토리
```typescript
// lib/repositories/factory.ts
import { PrismaClient } from '@prisma/client';
import { UserRepository } from './user';
import { TeamRepository } from './team';

export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private readonly repositories: Map<string, any> = new Map();

  private constructor(private readonly prisma: PrismaClient) {}

  static getInstance(prisma: PrismaClient): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory(prisma);
    }
    return RepositoryFactory.instance;
  }

  getUserRepository(): UserRepository {
    if (!this.repositories.has('user')) {
      this.repositories.set('user', new UserRepository(this.prisma));
    }
    return this.repositories.get('user');
  }

  getTeamRepository(): TeamRepository {
    if (!this.repositories.has('team')) {
      this.repositories.set('team', new TeamRepository(this.prisma));
    }
    return this.repositories.get('team');
  }
}
```

### 4.2 리포지토리 사용 예시
```typescript
// app/api/users/route.ts
import { prisma } from '@/lib/db/client';
import { RepositoryFactory } from '@/lib/repositories/factory';

const factory = RepositoryFactory.getInstance(prisma);
const userRepository = factory.getUserRepository();

export async function GET(req: Request) {
  const users = await userRepository.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return Response.json(users);
}
```

## 5. 트랜잭션 관리
### 5.1 트랜잭션 래퍼
```typescript
// lib/repositories/transaction.ts
import { PrismaClient, Prisma } from '@prisma/client';
import { RepositoryFactory } from './factory';

export class TransactionScope {
  private factory: RepositoryFactory;

  constructor(private readonly prisma: PrismaClient) {
    this.factory = RepositoryFactory.getInstance(prisma);
  }

  async execute<T>(
    fn: (repositories: RepositoryFactory) => Promise<T>
  ): Promise<T> {
    return await this.prisma.$transaction(async (tx) => {
      const transactionFactory = RepositoryFactory.getInstance(
        tx as unknown as PrismaClient
      );
      return await fn(transactionFactory);
    });
  }
}
```

### 5.2 트랜잭션 사용 예시
```typescript
// app/api/teams/route.ts
import { prisma } from '@/lib/db/client';
import { TransactionScope } from '@/lib/repositories/transaction';

export async function POST(req: Request) {
  const transactionScope = new TransactionScope(prisma);
  
  const result = await transactionScope.execute(async (repositories) => {
    const teamRepository = repositories.getTeamRepository();
    const team = await teamRepository.create(data);
    
    for (const member of data.members) {
      await teamRepository.addMember(team.id, member.userId, member.role);
    }
    
    return team;
  });
  
  return Response.json(result);
}
```

## 다음 단계
- step3-data-layer-004.md: 마이그레이션 관리 