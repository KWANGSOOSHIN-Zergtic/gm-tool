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
import { useAuthStore } from '@/lib/store/auth-store';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  email: z.string().email({
    message: '유효한 이메일을 입력해주세요.',
  }),
  password: z.string().min(6, {
    message: '비밀번호는 최소 6자 이상이어야 합니다.',
  }),
});

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const login = useAuthStore((state) => state.login);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const success = await login(values.email, values.password);
    
    if (success) {
      toast({
        title: '로그인 성공',
        description: '관리자 페이지로 이동합니다.',
      });
      router.push('/dashboard');
    } else {
      toast({
        variant: 'destructive',
        title: '로그인 실패',
        description: '이메일 또는 비밀번호를 확인해주세요.',
      });
    }
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
                      <Input placeholder="이메일을 입력하세요" {...field} />
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
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full">
                로그인
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