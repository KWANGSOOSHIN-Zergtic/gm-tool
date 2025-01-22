'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { isAuthenticated, user, logout } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const handleLogout = () => {
    logout();
    toast({
      title: '로그아웃',
      description: '로그아웃 되었습니다.',
    });
    router.push('/login');
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="flex h-16 items-center px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[200px] sm:w-[240px]">
              <nav className="flex flex-col space-y-2">
                <Button variant="ghost" className="justify-start" onClick={() => router.push('/dashboard')}>
                  대시보드
                </Button>
                <Button variant="ghost" className="justify-start" onClick={() => router.push('/users')}>
                  사용자 관리
                </Button>
                <Button variant="ghost" className="justify-start" onClick={() => router.push('/game-data')}>
                  게임 데이터
                </Button>
                <Button variant="ghost" className="justify-start" onClick={() => router.push('/settings')}>
                  설정
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
          <div className="flex w-full items-center justify-between">
            <h1 className="text-xl font-bold">GM Tool</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">{user?.name}</span>
              <Button variant="ghost" onClick={handleLogout}>
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </header>
      <div className="flex">
        <nav className="hidden w-[200px] flex-col space-y-2 border-r p-4 md:flex">
          <Button variant="ghost" className="justify-start" onClick={() => router.push('/dashboard')}>
            대시보드
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => router.push('/users')}>
            사용자 관리
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => router.push('/game-data')}>
            게임 데이터
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => router.push('/settings')}>
            설정
          </Button>
        </nav>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
} 