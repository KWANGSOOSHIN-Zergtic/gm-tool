declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_API_URL: string;
    NEXT_PUBLIC_APP_ENV: 'development' | 'staging' | 'production';
    NEXT_PUBLIC_APP_VERSION: string;
    DATABASE_URL: string;
    JWT_SECRET: string;
    // ... 기타 환경 변수
  }
} 