import { createContext, useContext, type PropsWithChildren } from 'react';
import { useQuery } from '@tanstack/react-query';

interface IAuthContext {
  user: IUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: ILoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<IAuthContext | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const { data: user, isLoading } = useQuery({
    queryKey: ['auth-user'],
    queryFn: getCurrentUser,
  });

  // ... 인증 관련 로직 구현

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
} 