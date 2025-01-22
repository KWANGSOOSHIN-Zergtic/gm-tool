# Step 6-003: 테스트 구현 - E2E 테스트

## 1. 인증 플로우 테스트
### 1.1 로그인 테스트
```typescript
// e2e/auth/login.spec.ts
import { test, expect } from '@/e2e/utils/test-utils';

test.describe('로그인 플로우', () => {
  test('성공적인 로그인', async ({ page, testUser }) => {
    await page.goto('/login');

    await page.fill('[name="email"]', testUser.email);
    await page.fill('[name="password"]', testUser.password);
    await page.click('button:has-text("로그인")');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=환영합니다')).toBeVisible();
  });

  test('잘못된 인증 정보로 로그인 실패', async ({ page }) => {
    await page.goto('/login');

    await page.fill('[name="email"]', 'wrong@example.com');
    await page.fill('[name="password"]', 'wrongpassword');
    await page.click('button:has-text("로그인")');

    await expect(page.locator('text=로그인에 실패했습니다')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('비밀번호 재설정 플로우', async ({ page }) => {
    await page.goto('/login');
    await page.click('text=비밀번호를 잊으셨나요?');
    
    await expect(page).toHaveURL('/reset-password');
    await page.fill('[name="email"]', 'test@example.com');
    await page.click('button:has-text("재설정 링크 전송")');

    await expect(page.locator('text=이메일이 전송되었습니다')).toBeVisible();
  });
});
```

### 1.2 회원가입 테스트
```typescript
// e2e/auth/register.spec.ts
import { test, expect } from '@/e2e/utils/test-utils';

test.describe('회원가입 플로우', () => {
  test('새 계정 생성', async ({ page }) => {
    await page.goto('/register');

    await page.fill('[name="name"]', 'Test User');
    await page.fill('[name="email"]', 'newuser@example.com');
    await page.fill('[name="password"]', 'Password123!');
    await page.fill('[name="confirmPassword"]', 'Password123!');
    
    await page.click('button:has-text("회원가입")');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=계정이 생성되었습니다')).toBeVisible();
  });

  test('이미 존재하는 이메일로 회원가입 실패', async ({ page, testUser }) => {
    await page.goto('/register');

    await page.fill('[name="name"]', 'Test User');
    await page.fill('[name="email"]', testUser.email);
    await page.fill('[name="password"]', 'Password123!');
    await page.fill('[name="confirmPassword"]', 'Password123!');
    
    await page.click('button:has-text("회원가입")');

    await expect(page.locator('text=이미 사용 중인 이메일입니다')).toBeVisible();
  });
});
```

## 2. 팀 관리 테스트
### 2.1 팀 생성 및 관리
```typescript
// e2e/teams/management.spec.ts
import { test, expect } from '@/e2e/utils/test-utils';

test.describe('팀 관리', () => {
  test.beforeEach(async ({ page, testUser }) => {
    // 로그인
    await page.goto('/login');
    await page.fill('[name="email"]', testUser.email);
    await page.fill('[name="password"]', testUser.password);
    await page.click('button:has-text("로그인")');
    await expect(page).toHaveURL('/dashboard');
  });

  test('새 팀 생성', async ({ page }) => {
    await page.click('text=팀 생성');
    
    await page.fill('[name="name"]', 'New Test Team');
    await page.fill('[name="description"]', 'Team Description');
    await page.click('button:has-text("생성")');

    await expect(page.locator('text=New Test Team')).toBeVisible();
    await expect(page.locator('text=팀이 생성되었습니다')).toBeVisible();
  });

  test('팀원 초대', async ({ page }) => {
    await page.click('text=New Test Team');
    await page.click('button:has-text("팀원 초대")');
    
    await page.fill('[name="email"]', 'newmember@example.com');
    await page.selectOption('select[name="role"]', 'MEMBER');
    await page.click('button:has-text("초대")');

    await expect(page.locator('text=초대 이메일이 전송되었습니다')).toBeVisible();
  });
});
```

### 2.2 팀 설정 관리
```typescript
// e2e/teams/settings.spec.ts
import { test, expect } from '@/e2e/utils/test-utils';

test.describe('팀 설정', () => {
  test.beforeEach(async ({ page, testUser }) => {
    // 로그인 및 팀 페이지 이동
    await page.goto('/login');
    await page.fill('[name="email"]', testUser.email);
    await page.fill('[name="password"]', testUser.password);
    await page.click('button:has-text("로그인")');
    await page.click('text=New Test Team');
  });

  test('팀 정보 수정', async ({ page }) => {
    await page.click('text=설정');
    
    await page.fill('[name="name"]', 'Updated Team Name');
    await page.fill('[name="description"]', 'Updated Description');
    await page.click('button:has-text("저장")');

    await expect(page.locator('text=Updated Team Name')).toBeVisible();
    await expect(page.locator('text=변경사항이 저장되었습니다')).toBeVisible();
  });

  test('팀원 권한 변경', async ({ page }) => {
    await page.click('text=설정');
    await page.click('text=팀원 관리');
    
    await page.selectOption('select[name="memberRole"]', 'ADMIN');
    await page.click('button:has-text("권한 변경")');

    await expect(page.locator('text=권한이 변경되었습니다')).toBeVisible();
  });
});
```

## 3. 대시보드 테스트
### 3.1 대시보드 기능
```typescript
// e2e/dashboard/features.spec.ts
import { test, expect } from '@/e2e/utils/test-utils';

test.describe('대시보드 기능', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', testUser.email);
    await page.fill('[name="password"]', testUser.password);
    await page.click('button:has-text("로그인")');
  });

  test('팀 목록 표시', async ({ page }) => {
    await expect(page.locator('.team-card')).toHaveCount(1);
    await expect(page.locator('text=New Test Team')).toBeVisible();
  });

  test('알림 확인', async ({ page }) => {
    await page.click('button[aria-label="알림"]');
    await expect(page.locator('.notification-panel')).toBeVisible();
  });

  test('프로필 설정 변경', async ({ page }) => {
    await page.click('button[aria-label="프로필"]');
    await page.click('text=설정');
    
    await page.fill('[name="name"]', 'Updated Name');
    await page.click('button:has-text("저장")');

    await expect(page.locator('text=프로필이 업데이트되었습니다')).toBeVisible();
  });
});
```

### 3.2 검색 및 필터링
```typescript
// e2e/dashboard/search.spec.ts
import { test, expect } from '@/e2e/utils/test-utils';

test.describe('검색 및 필터링', () => {
  test.beforeEach(async ({ page, testUser }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', testUser.email);
    await page.fill('[name="password"]', testUser.password);
    await page.click('button:has-text("로그인")');
  });

  test('팀 검색', async ({ page }) => {
    await page.fill('[placeholder="팀 검색"]', 'Test');
    await page.press('[placeholder="팀 검색"]', 'Enter');

    await expect(page.locator('.team-card')).toHaveCount(1);
    await expect(page.locator('text=New Test Team')).toBeVisible();
  });

  test('필터 적용', async ({ page }) => {
    await page.click('button:has-text("필터")');
    await page.click('text=내가 관리하는 팀');
    
    await expect(page.locator('.team-card')).toHaveCount(1);
    await expect(page.locator('text=OWNER')).toBeVisible();
  });
});
```

## 4. 성능 테스트
### 4.1 페이지 로드 성능
```typescript
// e2e/performance/loading.spec.ts
import { test, expect } from '@/e2e/utils/test-utils';

test.describe('페이지 로드 성능', () => {
  test('대시보드 초기 로드 시간', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/dashboard');
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(3000); // 3초 이내 로드
  });

  test('이미지 최적화 확인', async ({ page }) => {
    await page.goto('/dashboard');
    
    const images = await page.$$eval('img', (imgs) => {
      return imgs.map(img => ({
        src: img.src,
        loading: img.loading,
      }));
    });

    for (const img of images) {
      expect(img.loading).toBe('lazy');
      expect(img.src).toMatch(/\/_next\/image\?/);
    }
  });
});
```

## 다음 단계
- step7-deployment-001.md: 배포 환경 설정 