# Step 5-001: 성능 최적화 - 클라이언트 사이드

## 1. 컴포넌트 최적화
### 1.1 React.memo 적용
```typescript
// components/teams/team-card.tsx
import { memo } from 'react';
import { Card } from '@/components/ui/card';
import type { Team } from '@/types/models/team';

interface TeamCardProps {
  team: Team;
  onSelect: (teamId: string) => void;
}

export const TeamCard = memo(function TeamCard({ team, onSelect }: TeamCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => onSelect(team.id)}
    >
      {/* 카드 내용 */}
    </Card>
  );
}, 
(prevProps, nextProps) => prevProps.team.id === nextProps.team.id);
```

### 1.2 useMemo와 useCallback 활용
```typescript
// components/dashboard/team-list.tsx
import { useMemo, useCallback } from 'react';
import { TeamCard } from '@/components/teams/team-card';
import type { Team } from '@/types/models/team';

interface TeamListProps {
  teams: Team[];
  onSelectTeam: (teamId: string) => void;
}

export function TeamList({ teams, onSelectTeam }: TeamListProps) {
  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  }, [teams]);

  const handleTeamSelect = useCallback((teamId: string) => {
    onSelectTeam(teamId);
  }, [onSelectTeam]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sortedTeams.map((team) => (
        <TeamCard
          key={team.id}
          team={team}
          onSelect={handleTeamSelect}
        />
      ))}
    </div>
  );
}
```

## 2. 이미지 최적화
### 2.1 이미지 컴포넌트
```typescript
// components/common/optimized-image.tsx
import Image from 'next/image';
import { useState, useEffect } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  priority = false,
}: OptimizedImageProps) {
  const [loading, setLoading] = useState(true);

  return (
    <div className="relative">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        loading={priority ? 'eager' : 'lazy'}
        className={`
          duration-700 ease-in-out
          ${loading ? 'scale-110 blur-2xl grayscale' : 'scale-100 blur-0 grayscale-0'}
        `}
        onLoadingComplete={() => setLoading(false)}
      />
    </div>
  );
}
```

### 2.2 이미지 최적화 설정
```typescript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['your-image-domain.com'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'],
  },
};

module.exports = nextConfig;
```

## 3. 번들 최적화
### 3.1 동적 임포트
```typescript
// app/dashboard/teams/[id]/page.tsx
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const TeamChart = dynamic(
  () => import('@/components/teams/team-chart'),
  {
    loading: () => <div>차트 로딩 중...</div>,
    ssr: false,
  }
);

const TeamMembers = dynamic(
  () => import('@/components/teams/team-members'),
  {
    loading: () => <div>멤버 목록 로딩 중...</div>,
  }
);

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div>로딩 중...</div>}>
        <TeamChart />
      </Suspense>
      <Suspense fallback={<div>로딩 중...</div>}>
        <TeamMembers />
      </Suspense>
    </div>
  );
}
```

### 3.2 번들 분석 설정
```javascript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... 기존 설정
};

module.exports = withBundleAnalyzer(nextConfig);
```

## 4. 캐시 최적화
### 4.1 SWR 설정
```typescript
// lib/swr/config.ts
import { SWRConfig } from 'swr';

export const swrConfig = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  dedupingInterval: 2000,
  errorRetryCount: 3,
  fetcher: async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('API 요청 실패');
    }
    return response.json();
  },
};

export function SwrProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}
```

### 4.2 React Query 설정
```typescript
// lib/react-query/config.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      cacheTime: 60 * 60 * 1000,
      retry: 3,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
```

## 5. 코드 스플리팅
### 5.1 라우트 기반 스플리팅
```typescript
// app/dashboard/layout.tsx
import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const DashboardNav = dynamic(
  () => import('@/components/dashboard/nav'),
  {
    loading: () => <div>네비게이션 로딩 중...</div>,
  }
);

const DashboardHeader = dynamic(
  () => import('@/components/dashboard/header'),
  {
    loading: () => <div>헤더 로딩 중...</div>,
  }
);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<div>로딩 중...</div>}>
        <DashboardNav />
      </Suspense>
      <main className="flex-1">
        <Suspense fallback={<div>로딩 중...</div>}>
          <DashboardHeader />
        </Suspense>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
```

## 다음 단계
- step5-optimization-002.md: 서버 사이드 최적화 