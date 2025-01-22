# Step 1-003: 상태 관리 시스템 구축

## 1. Zustand 스토어 설정
### 1.1 인증 스토어
```typescript
// store/auth.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => set({ token }),
      logout: () => set({ user: null, token: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
```

### 1.2 UI 상태 스토어
```typescript
// store/ui.ts
import { create } from 'zustand';

interface UIState {
  isSidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: true,
  theme: 'system',
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setTheme: (theme) => set({ theme }),
}));
```

### 1.3 설정 스토어
```typescript
// store/settings.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Settings {
  language: string;
  notifications: boolean;
  timezone: string;
}

interface SettingsState {
  settings: Settings;
  updateSettings: (settings: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {
        language: 'ko',
        notifications: true,
        timezone: 'Asia/Seoul',
      },
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
    }),
    {
      name: 'settings-storage',
    }
  )
);
```

## 2. React Query 설정
### 2.1 기본 설정
```typescript
// lib/query.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      cacheTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});
```

### 2.2 커스텀 훅
```typescript
// hooks/queries/useAuth.ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';

export function useLogin() {
  const setUser = useAuthStore((state) => state.setUser);
  const setToken = useAuthStore((state) => state.setToken);

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      // API 호출 로직
    },
    onSuccess: (data) => {
      setUser(data.user);
      setToken(data.token);
    },
  });
}

export function useUser() {
  const user = useAuthStore((state) => state.user);
  
  return useQuery({
    queryKey: ['user', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      // API 호출 로직
    },
    enabled: !!user?.id,
  });
}
```

### 2.3 API 클라이언트 통합
```typescript
// lib/api/client.ts
import axios from 'axios';
import { useAuthStore } from '@/store/auth';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
```

## 3. 상태 관리 유틸리티
### 3.1 커스텀 훅
```typescript
// hooks/useStore.ts
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useUIStore } from '@/store/ui';
import { useSettingsStore } from '@/store/settings';

export function useHydration() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated;
}

export function useRequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  return isAuthenticated;
}
```

### 3.2 타입 유틸리티
```typescript
// types/store.ts
import { StateCreator } from 'zustand';

export type StoreSlice<T> = StateCreator<T>;

export type WithPersist<T> = T & {
  _hasHydrated: boolean;
  _persist: {
    rehydrate: () => void;
    hasHydrated: () => boolean;
  };
};
```

## 다음 단계
- step1-foundation-004.md: 테스트 환경 구성
- step1-foundation-005.md: API 클라이언트 설정 