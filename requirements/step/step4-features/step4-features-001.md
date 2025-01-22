# Step 4-001: 인증 및 사용자 관리

## 1. 인증 시스템 구현
### 1.1 JWT 인증 설정
```typescript
// lib/auth/jwt.ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const alg = 'HS256';

export async function signJWT(payload: any): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

export async function verifyJWT<T>(token: string): Promise<T> {
  const { payload } = await jwtVerify(token, secret);
  return payload as T;
}

export async function getSession() {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;
  
  if (!token) return null;
  
  try {
    return await verifyJWT(token);
  } catch {
    return null;
  }
}
```

### 1.2 인증 미들웨어
```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/auth/jwt';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const payload = await verifyJWT(token);
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

export const config = {
  matcher: ['/dashboard/:path*', '/api/protected/:path*'],
};
```

## 2. 사용자 인증 API
### 2.1 로그인 API
```typescript
// app/api/auth/login/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/db/client';
import { signJWT } from '@/lib/auth/jwt';
import { loginSchema } from '@/lib/validations/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !(await compare(password, user.password))) {
      return NextResponse.json(
        { error: '이메일 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    const token = await signJWT({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    cookies().set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: '로그인 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

### 2.2 회원가입 API
```typescript
// app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db/client';
import { registerSchema } from '@/lib/validations/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name } = registerSchema.parse(body);

    const exists = await prisma.user.findUnique({
      where: { email },
    });

    if (exists) {
      return NextResponse.json(
        { error: '이미 등록된 이메일입니다.' },
        { status: 400 }
      );
    }

    const hashedPassword = await hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: '회원가입 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

## 3. 사용자 관리 API
### 3.1 사용자 정보 조회
```typescript
// app/api/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        teams: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: '사용자 정보 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

### 3.2 사용자 정보 수정
```typescript
// app/api/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { updateUserSchema } from '@/lib/validations/user';

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { name, status, role } = updateUserSchema.parse(body);

    const user = await prisma.user.update({
      where: { id: params.id },
      data: {
        name,
        status,
        role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: '사용자 정보 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
```

## 4. 인증 상태 관리
### 4.1 인증 컨텍스트
```typescript
// lib/auth/context.ts
import { createContext, useContext } from 'react';

export interface AuthState {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  } | null;
  loading: boolean;
}

export const AuthContext = createContext<{
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
}>({
  state: { user: null, loading: true },
  login: async () => {},
  logout: async () => {},
  register: async () => {},
});

export const useAuth = () => useContext(AuthContext);
```

## 다음 단계
- step4-features-002.md: 팀 관리 기능 구현 