# Step 4-003: 대시보드 기능

## 1. 대시보드 레이아웃
### 1.1 대시보드 레이아웃 컴포넌트
```typescript
// app/dashboard/layout.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/jwt';
import { DashboardNav } from '@/components/dashboard/nav';
import { DashboardHeader } from '@/components/dashboard/header';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen">
      <DashboardNav />
      <main className="flex-1">
        <DashboardHeader />
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
```

### 1.2 대시보드 네비게이션
```typescript
// components/dashboard/nav.tsx
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  Home,
  Users,
  Settings,
  LogOut,
} from 'lucide-react';

const navItems = [
  {
    title: '홈',
    href: '/dashboard',
    icon: Home,
  },
  {
    title: '팀 관리',
    href: '/dashboard/teams',
    icon: Users,
  },
  {
    title: '설정',
    href: '/dashboard/settings',
    icon: Settings,
  },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="w-64 min-h-screen border-r bg-background">
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <h2 className="mb-2 px-4 text-lg font-semibold">
            대시보드
          </h2>
          <div className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  'w-full justify-start',
                  pathname === item.href
                    ? 'bg-muted hover:bg-muted'
                    : 'hover:bg-transparent hover:underline'
                )}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.title}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
```

## 2. 대시보드 페이지
### 2.1 대시보드 홈
```typescript
// app/dashboard/page.tsx
import { Suspense } from 'react';
import { getSession } from '@/lib/auth/jwt';
import { prisma } from '@/lib/db/client';
import { DashboardCard } from '@/components/dashboard/card';
import { DashboardSkeleton } from '@/components/dashboard/skeleton';

export default async function DashboardPage() {
  const session = await getSession();
  const stats = await prisma.$transaction([
    prisma.team.count({
      where: {
        members: {
          some: {
            userId: session.id,
          },
        },
      },
    }),
    prisma.teamMember.count({
      where: {
        userId: session.id,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">대시보드</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="내 팀"
          value={stats[0]}
          description="소속된 팀의 수"
          href="/dashboard/teams"
        />
        <DashboardCard
          title="팀 활동"
          value={stats[1]}
          description="참여 중인 팀 활동"
          href="/dashboard/activities"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4">
          <h2 className="text-2xl font-bold mb-4">최근 활동</h2>
          <Suspense fallback={<DashboardSkeleton />}>
            {/* 최근 활동 컴포넌트 */}
          </Suspense>
        </div>
        <div className="col-span-3">
          <h2 className="text-2xl font-bold mb-4">알림</h2>
          <Suspense fallback={<DashboardSkeleton />}>
            {/* 알림 컴포넌트 */}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
```

### 2.2 팀 관리 페이지
```typescript
// app/dashboard/teams/page.tsx
import { Suspense } from 'react';
import { getSession } from '@/lib/auth/jwt';
import { prisma } from '@/lib/db/client';
import { DataTable } from '@/components/ui/data-table';
import { TeamActions } from '@/components/teams/actions';
import { columns } from './columns';

export default async function TeamsPage() {
  const session = await getSession();
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
      _count: {
        select: {
          members: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">팀 관리</h1>
        <TeamActions />
      </div>
      <Suspense fallback={<div>로딩 중...</div>}>
        <DataTable columns={columns} data={teams} />
      </Suspense>
    </div>
  );
}
```

## 3. 대시보드 컴포넌트
### 3.1 대시보드 카드
```typescript
// components/dashboard/card.tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DashboardCardProps {
  title: string;
  value: number;
  description: string;
  href: string;
}

export function DashboardCard({
  title,
  value,
  description,
  href,
}: DashboardCardProps) {
  return (
    <Link href={href}>
      <Card className="hover:bg-muted/50 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
```

### 3.2 데이터 테이블
```typescript
// components/ui/data-table.tsx
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center"
              >
                데이터가 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

## 다음 단계
- step4-features-004.md: 설정 및 프로필 기능 구현 