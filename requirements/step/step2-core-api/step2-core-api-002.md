# Step 2-002: API 문서화 설정

## 1. Swagger/OpenAPI 설정
### 1.1 기본 설정
```typescript
// lib/swagger.ts
import { createSwaggerSpec } from 'next-swagger-doc';

export const getApiDocs = () => {
  return createSwaggerSpec({
    apiFolder: 'app/api',
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'GM Tool API Documentation',
        version: '1.0.0',
        description: 'API documentation for GM Tool',
        contact: {
          name: 'API Support',
          email: 'support@example.com',
        },
      },
      servers: [
        {
          url: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
          description: 'API Server',
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        schemas: {
          Error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' },
            },
          },
        },
      },
      security: [{ BearerAuth: [] }],
    },
  });
};
```

### 1.2 API 문서화 페이지
```typescript
// app/api-docs/page.tsx
import { getApiDocs } from '@/lib/swagger';
import dynamic from 'next/dynamic';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default async function ApiDocs() {
  const spec = getApiDocs();
  
  return (
    <div className="container mx-auto p-4">
      <SwaggerUI spec={spec} />
    </div>
  );
}
```

## 2. API 엔드포인트 문서화
### 2.1 인증 API
```typescript
// app/api/auth/login/route.ts
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 사용자 로그인
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         email:
 *                           type: string
 *                         name:
 *                           type: string
 *       401:
 *         description: 인증 실패
 *       422:
 *         description: 유효성 검사 실패
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);
    const result = await authService.login(email, password);
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

### 2.2 사용자 API
```typescript
// app/api/users/[id]/route.ts
/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: 사용자 정보 조회
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 사용자 ID
 *     responses:
 *       200:
 *         description: 사용자 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [admin, user]
 *       404:
 *         description: 사용자를 찾을 수 없음
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  // 구현 로직
}
```

## 3. API 스키마 정의
### 3.1 공통 스키마
```typescript
// types/api/schemas.ts
/**
 * @swagger
 * components:
 *   schemas:
 *     ApiResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *         error:
 *           $ref: '#/components/schemas/Error'
 *         metadata:
 *           type: object
 *           properties:
 *             timestamp:
 *               type: string
 *               format: date-time
 *             requestId:
 *               type: string
 *             version:
 *               type: string
 *
 *     PaginatedResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponse'
 *         - type: object
 *           properties:
 *             metadata:
 *               type: object
 *               properties:
 *                 total:
 *                   type: number
 *                 page:
 *                   type: number
 *                 limit:
 *                   type: number
 *                 hasMore:
 *                   type: boolean
 */
```

### 3.2 모델 스키마
```typescript
// types/api/models.ts
/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         name:
 *           type: string
 *         role:
 *           type: string
 *           enum: [admin, user]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *
 *     Team:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         members:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/User'
 */
```

## 다음 단계
- step2-core-api-003.md: API 테스트 구조 설정
- step2-core-api-004.md: API 보안 설정 