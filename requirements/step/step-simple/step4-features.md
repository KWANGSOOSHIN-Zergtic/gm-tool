# Step 4: 핵심 기능 구현

## 4.1 인증/인가 구현
```typescript
// /lib/auth/session.ts
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function getSession() {
  return await getServerSession(authOptions);
}

// /lib/auth/permissions.ts
export async function checkPermission(
  userId: string,
  action: string,
  resource: string
) {
  const user = await UserRepository.findById(userId);
  // 권한 체크 로직
  return user?.role === 'ADMIN';
}
```

## 4.2 팀 관리 기능
```typescript
// /app/api/teams/route.ts
import { ApiHandler } from '@/lib/api/handler';
import { TeamRepository } from '@/lib/db/repositories/team';

export async function GET() {
  return ApiHandler.handle(async () => {
    const teams = await TeamRepository.findAll();
    return teams;
  });
}

export async function POST(req: Request) {
  return ApiHandler.handle(async () => {
    const data = await req.json();
    const team = await TeamRepository.create(data);
    return team;
  });
}
```

## 4.3 사용자 관리 기능
```typescript
// /app/api/users/route.ts
import { ApiHandler } from '@/lib/api/handler';
import { UserRepository } from '@/lib/db/repositories/user';

export async function GET() {
  return ApiHandler.handle(async () => {
    const users = await UserRepository.findAll({
      include: {
        team: true,
      },
    });
    return users;
  });
}
```

## 4.4 관리자 대시보드
```typescript
// /app/(dashboard)/admin/page.tsx
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export default async function AdminDashboard() {
  const session = await getSession();
  
  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/auth/login');
  }

  return (
    <div>
      <h1>관리자 대시보드</h1>
      {/* 대시보드 컴포넌트 */}
    </div>
  );
}
```

## 4.5 데이터 검증
```typescript
// /lib/validations/team.ts
import { z } from 'zod';

export const TeamSchema = z.object({
  name: z.string().min(2).max(50),
  // 추가 필드 검증
});

// /lib/validations/user.ts
export const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).optional(),
  role: z.enum(['ADMIN', 'USER']),
  teamId: z.string().optional(),
});
```

## 다음 단계
- 성능 최적화
- 캐싱 구현
- 테스트 작성
- 배포 준비 