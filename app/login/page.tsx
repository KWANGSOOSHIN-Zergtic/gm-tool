'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore, type AuthStore } from '@/lib/store/auth-store';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';

const formSchema = z.object({
  email: z.string().email({
    message: '유효한 이메일을 입력해주세요.',
  }),
  password: z.string().min(6, {
    message: '비밀번호는 최소 6자 이상이어야 합니다.',
  }),
});

type LoginFormValues = z.infer<typeof formSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  
  const isLoading = useAuthStore((state: AuthStore) => state.isLoading);
  const isAuthenticated = useAuthStore((state: AuthStore) => state.isAuthenticated);
  const login = useAuthStore((state: AuthStore) => state.login);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [mounted, isAuthenticated, router]);

  async function onSubmit(values: LoginFormValues) {
    if (isLoading) return;

    try {
      await login(values.email, values.password);
      toast({
        title: '로그인 성공',
        description: '관리자 페이지로 이동합니다.',
      });
    } catch (error: unknown) {
      console.error('Login failed:', error);
      
      toast({
        variant: 'destructive',
        title: '로그인 실패',
        description: error instanceof Error 
          ? error.message 
          : '이메일 또는 비밀번호를 확인해주세요.',
      });
    }
  }

  if (!mounted) {
    return null;
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>로그인</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>이메일</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="이메일을 입력하세요" 
                        {...field} 
                        disabled={isLoading}
                        autoComplete="email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>비밀번호</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="비밀번호를 입력하세요"
                        {...field}
                        disabled={isLoading}
                        autoComplete="current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? '로그인 중...' : '로그인'}
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-sm text-gray-500">
            테스트 계정: admin@example.com / admin123
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 