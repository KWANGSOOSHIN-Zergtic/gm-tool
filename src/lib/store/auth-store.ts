import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { User } from '@/lib/types/auth';
import { authService } from '@/lib/services/auth-service';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      ...initialState,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => set({ token, isAuthenticated: !!token }),
      setError: (error) => set({ error }),
      reset: () => set(initialState),

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authService.login({ email, password });
          const { token, user } = response;
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '로그인에 실패했습니다.';
          set({
            ...initialState,
            error: errorMessage,
          });
          throw new Error(errorMessage);
        }
      },

      logout: async () => {
        set({ isLoading: true, error: null });
        try {
          await authService.logout();
          set(initialState);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '로그아웃에 실패했습니다.';
          set((state) => ({
            ...state,
            error: errorMessage,
            isLoading: false,
          }));
          throw new Error(errorMessage);
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true,
    }
  )
); 