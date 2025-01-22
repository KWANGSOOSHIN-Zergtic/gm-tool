# Step 1-002: ShadCN UI 컴포넌트 설정

## 1. ShadCN UI 초기 설정
### 1.1 CLI 설치 및 초기화
```bash
# CLI 설치
npx shadcn@latest init

# 설정 옵션
✓ Would you like to use TypeScript (recommended)? yes
✓ Which style would you like to use? Default
✓ Which color would you like to use as base color? Slate
✓ Where is your global CSS file? app/globals.css
✓ Would you like to use CSS variables for colors? yes
✓ Are you using a custom tailwind prefix? no
✓ Where is your tailwind.config.js located? tailwind.config.js
✓ Configure the import alias for components: @/components
✓ Configure the import alias for utils: @/lib/utils
```

### 1.2 기본 스타일 설정
```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
 
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    /* ... 기타 변수들 ... */
  }
 
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... 다크 모드 변수들 ... */
  }
}
```

## 2. 핵심 컴포넌트 설치
### 2.1 레이아웃 컴포넌트
```bash
# 레이아웃
npx shadcn@latest add card
npx shadcn@latest add sheet
npx shadcn@latest add separator

# 네비게이션
npx shadcn@latest add navigation-menu
```

### 2.2 입력 컴포넌트
```bash
# 폼 요소
npx shadcn@latest add input
npx shadcn@latest add textarea
npx shadcn@latest add select
npx shadcn@latest add checkbox
npx shadcn@latest add radio-group
npx shadcn@latest add switch

# 버튼
npx shadcn@latest add button
npx shadcn@latest add dropdown-menu
```

### 2.3 데이터 표시 컴포넌트
```bash
# 테이블
npx shadcn@latest add table

# 데이터 표시
npx shadcn@latest add badge
npx shadcn@latest add avatar
npx shadcn@latest add progress
```

### 2.4 오버레이 컴포넌트
```bash
# 모달 및 알림
npx shadcn@latest add dialog
npx shadcn@latest add alert
npx shadcn@latest add toast
npx shadcn@latest add tooltip
```

## 3. 컴포넌트 래퍼 구현
### 3.1 버튼 래퍼
```typescript
// components/common/button.tsx
import { Button as ShadButton } from "@/components/ui/button"
import { ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CustomButtonProps extends ButtonProps {
  isLoading?: boolean;
}

export function Button({ 
  children, 
  className, 
  isLoading, 
  disabled, 
  ...props 
}: CustomButtonProps) {
  return (
    <ShadButton
      className={cn("min-w-[100px]", className)}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? <LoadingSpinner /> : children}
    </ShadButton>
  )
}
```

### 3.2 입력 필드 래퍼
```typescript
// components/common/input.tsx
import { Input as ShadInput } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ 
  label, 
  error, 
  className, 
  ...props 
}: InputProps) {
  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <ShadInput
        className={cn(
          error && "border-red-500",
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  )
}
```

## 4. 테마 설정
### 4.1 다크 모드 구현
```typescript
// components/theme/theme-provider.tsx
import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light"
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
```

## 다음 단계
- step1-foundation-003.md: 상태 관리 시스템 구축
- step1-foundation-004.md: 테스트 환경 구성 