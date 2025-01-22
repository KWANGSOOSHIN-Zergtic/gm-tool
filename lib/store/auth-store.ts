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
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

// 테스트용 임시 계정
const TEST_USER = {
  email: 'admin@example.com',
  password: 'admin123',
  userData: {
    id: '1',
    email: 'admin@example.com',
    name: '관리자',
    role: 'admin' as const,
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: async (email: string, password: string) => {
        // 테스트용 로그인 검증
        if (email === TEST_USER.email && password === TEST_USER.password) {
          set({
            user: TEST_USER.userData,
            token: 'test-token',
            isAuthenticated: true,
          });
          return true;
        }
        return false;
      },
      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
); 