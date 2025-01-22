# Step 4-002: 팀 관리 기능

## 1. 팀 생성 및 관리
### 1.1 팀 생성 API
```typescript
// app/api/teams/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { createTeamSchema } from '@/lib/validations/team';
import { getSession } from '@/lib/auth/jwt';

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, description, members } = createTeamSchema.parse(body);

    const team = await prisma.team.create({
      data: {
        name,
        description,
        members: {
          create: [
            {
              userId: session.id,
              role: 'OWNER',
            },
            ...(members?.map((member) => ({
              userId: member.userId,
              role: member.role,
            })) ?? []),
          ],
        },
      },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    return NextResponse.json({ team });
  } catch (error) {
    return NextResponse.json(
      { error: '팀 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

### 1.2 팀 정보 수정 API
```typescript
// app/api/teams/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { updateTeamSchema } from '@/lib/validations/team';
import { getSession } from '@/lib/auth/jwt';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const isTeamOwner = await prisma.teamMember.findFirst({
      where: {
        teamId: params.id,
        userId: session.id,
        role: 'OWNER',
      },
    });

    if (!isTeamOwner) {
      return NextResponse.json(
        { error: '팀 수정 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, description } = updateTeamSchema.parse(body);

    const team = await prisma.team.update({
      where: { id: params.id },
      data: {
        name,
        description,
      },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    return NextResponse.json({ team });
  } catch (error) {
    return NextResponse.json(
      { error: '팀 정보 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

## 2. 팀원 관리
### 2.1 팀원 추가 API
```typescript
// app/api/teams/[id]/members/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { addTeamMemberSchema } from '@/lib/validations/team';
import { getSession } from '@/lib/auth/jwt';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const isTeamAdmin = await prisma.teamMember.findFirst({
      where: {
        teamId: params.id,
        userId: session.id,
        role: {
          in: ['OWNER', 'ADMIN'],
        },
      },
    });

    if (!isTeamAdmin) {
      return NextResponse.json(
        { error: '팀원 추가 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { userId, role } = addTeamMemberSchema.parse(body);

    const member = await prisma.teamMember.create({
      data: {
        teamId: params.id,
        userId,
        role,
      },
      include: {
        user: true,
      },
    });

    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      { error: '팀원 추가 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

### 2.2 팀원 역할 수정 API
```typescript
// app/api/teams/[id]/members/[userId]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { updateTeamMemberSchema } from '@/lib/validations/team';
import { getSession } from '@/lib/auth/jwt';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const isTeamAdmin = await prisma.teamMember.findFirst({
      where: {
        teamId: params.id,
        userId: session.id,
        role: {
          in: ['OWNER', 'ADMIN'],
        },
      },
    });

    if (!isTeamAdmin) {
      return NextResponse.json(
        { error: '팀원 역할 수정 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { role } = updateTeamMemberSchema.parse(body);

    const member = await prisma.teamMember.update({
      where: {
        userId_teamId: {
          userId: params.userId,
          teamId: params.id,
        },
      },
      data: { role },
      include: {
        user: true,
      },
    });

    return NextResponse.json({ member });
  } catch (error) {
    return NextResponse.json(
      { error: '팀원 역할 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

## 3. 팀 조회
### 3.1 팀 목록 조회 API
```typescript
// app/api/teams/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getSession } from '@/lib/auth/jwt';

export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const teams = await prisma.team.findMany({
      where: {
        members: {
          some: {
            userId: session.id,
          },
        },
      },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ teams });
  } catch (error) {
    return NextResponse.json(
      { error: '팀 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

### 3.2 팀 상세 조회 API
```typescript
// app/api/teams/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getSession } from '@/lib/auth/jwt';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const team = await prisma.team.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: '팀을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const isMember = team.members.some(
      (member) => member.userId === session.id
    );

    if (!isMember) {
      return NextResponse.json(
        { error: '팀 조회 권한이 없습니다.' },
        { status: 403 }
      );
    }

    return NextResponse.json({ team });
  } catch (error) {
    return NextResponse.json(
      { error: '팀 정보 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

## 다음 단계
- step4-features-003.md: 대시보드 기능 구현 