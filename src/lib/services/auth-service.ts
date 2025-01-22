import { AuthResponse, LoginCredentials } from '../types/auth';

// 테스트 계정 정보
const TEST_CREDENTIALS = {
  email: 'admin@example.com',
  password: 'admin123'
};

const TEST_USER = {
  id: '1',
  email: TEST_CREDENTIALS.email,
  name: 'Admin',
  role: 'admin'
};

const TEST_TOKEN = 'test_token_12345';

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    // 디버깅용 로그
    console.log('Received credentials:', {
      email: credentials.email,
      password: credentials.password
    });
    
    // 정확한 문자열 비교
    const isEmailMatch = credentials.email.trim() === TEST_CREDENTIALS.email;
    const isPasswordMatch = credentials.password === TEST_CREDENTIALS.password;
    
    console.log('Credential check:', {
      isEmailMatch,
      isPasswordMatch
    });

    if (isEmailMatch && isPasswordMatch) {
      console.log('Login successful');
      return {
        user: TEST_USER,
        token: TEST_TOKEN
      };
    }

    console.log('Login failed');
    throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
  },

  async logout(): Promise<void> {
    localStorage.removeItem('auth_token');
    return Promise.resolve();
  },

  async getCurrentUser(): Promise<AuthResponse> {
    const token = localStorage.getItem('auth_token');
    if (token === TEST_TOKEN) {
      return {
        user: TEST_USER,
        token: TEST_TOKEN
      };
    }
    throw new Error('인증되지 않은 사용자입니다.');
  },
}; 