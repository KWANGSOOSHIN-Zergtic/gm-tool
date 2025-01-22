# Step 4-004: 설정 및 프로필 기능

## 1. 프로필 관리
### 1.1 프로필 페이지
```typescript
// app/dashboard/settings/profile/page.tsx
import { getSession } from '@/lib/auth/jwt';
import { prisma } from '@/lib/db/client';
import { ProfileForm } from '@/components/settings/profile-form';
import { Separator } from '@/components/ui/separator';

export default async function ProfilePage() {
  const session = await getSession();
  const user = await prisma.user.findUnique({
    where: { id: session.id },
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">프로필</h3>
        <p className="text-sm text-muted-foreground">
          프로필 정보를 관리하세요.
        </p>
      </div>
      <Separator />
      <ProfileForm user={user} />
    </div>
  );
}
```

### 1.2 프로필 수정 폼
```typescript
// components/settings/profile-form.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { updateProfileSchema } from '@/lib/validations/user';

interface ProfileFormProps {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export function ProfileForm({ user }: ProfileFormProps) {
  const form = useForm({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: user.name,
    },
  });

  async function onSubmit(values: any) {
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('프로필 업데이트에 실패했습니다.');
      }

      toast.success('프로필이 업데이트되었습니다.');
    } catch (error) {
      toast.error('오류가 발생했습니다.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>이름</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">저장</Button>
      </form>
    </Form>
  );
}
```

## 2. 비밀번호 변경
### 2.1 비밀번호 변경 페이지
```typescript
// app/dashboard/settings/password/page.tsx
import { PasswordForm } from '@/components/settings/password-form';
import { Separator } from '@/components/ui/separator';

export default function PasswordPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">비밀번호 변경</h3>
        <p className="text-sm text-muted-foreground">
          계정의 비밀번호를 변경하세요.
        </p>
      </div>
      <Separator />
      <PasswordForm />
    </div>
  );
}
```

### 2.2 비밀번호 변경 폼
```typescript
// components/settings/password-form.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { updatePasswordSchema } from '@/lib/validations/user';

export function PasswordForm() {
  const form = useForm({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(values: any) {
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('비밀번호 변경에 실패했습니다.');
      }

      toast.success('비밀번호가 변경되었습니다.');
      form.reset();
    } catch (error) {
      toast.error('오류가 발생했습니다.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>현재 비밀번호</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>새 비밀번호</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>새 비밀번호 확인</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">변경</Button>
      </form>
    </Form>
  );
}
```

## 3. 알림 설정
### 3.1 알림 설정 페이지
```typescript
// app/dashboard/settings/notifications/page.tsx
import { getSession } from '@/lib/auth/jwt';
import { prisma } from '@/lib/db/client';
import { NotificationForm } from '@/components/settings/notification-form';
import { Separator } from '@/components/ui/separator';

export default async function NotificationsPage() {
  const session = await getSession();
  const preferences = await prisma.notificationPreference.findUnique({
    where: { userId: session.id },
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">알림 설정</h3>
        <p className="text-sm text-muted-foreground">
          알림 수신 방법을 설정하세요.
        </p>
      </div>
      <Separator />
      <NotificationForm preferences={preferences} />
    </div>
  );
}
```

### 3.2 알림 설정 폼
```typescript
// components/settings/notification-form.tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { updateNotificationSchema } from '@/lib/validations/user';

interface NotificationFormProps {
  preferences: {
    emailNotifications: boolean;
    pushNotifications: boolean;
  };
}

export function NotificationForm({ preferences }: NotificationFormProps) {
  const form = useForm({
    resolver: zodResolver(updateNotificationSchema),
    defaultValues: {
      emailNotifications: preferences?.emailNotifications ?? true,
      pushNotifications: preferences?.pushNotifications ?? true,
    },
  });

  async function onSubmit(values: any) {
    try {
      const response = await fetch('/api/users/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('알림 설정 업데이트에 실패했습니다.');
      }

      toast.success('알림 설정이 업데이트되었습니다.');
    } catch (error) {
      toast.error('오류가 발생했습니다.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="emailNotifications"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">
                  이메일 알림
                </FormLabel>
                <FormDescription>
                  중요한 업데이트를 이메일로 받습니다.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="pushNotifications"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">
                  푸시 알림
                </FormLabel>
                <FormDescription>
                  브라우저 푸시 알림을 받습니다.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit">저장</Button>
      </form>
    </Form>
  );
}
```

## 다음 단계
- step5-optimization-001.md: 성능 최적화 구현 