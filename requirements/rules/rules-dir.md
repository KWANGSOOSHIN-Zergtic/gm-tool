# 디렉터리 구조 규칙

## 1. 프로젝트 구조

```
/
├── app/                # 페이지 및 라우트
├── components/         # 재사용 가능한 컴포넌트
│   ├── ui/            # ShadCN UI 컴포넌트
│   └── common/        # 공통 컴포넌트
├── lib/               # 유틸리티 함수
├── hooks/             # 커스텀 훅
├── types/             # TypeScript 타입 정의
├── styles/            # 전역 스타일
└── public/            # 정적 파일
└── doc/            # 정적 파일
```

## 2. 문서 구조
/doc
├── project/
│   ├── README.md          # 프로젝트 개요 및 설정 방법
│   ├── architecture.md    # 시스템 아키텍처 설명
│   └── core-features.md   # 핵심 기능 설명
│
├── development/
│   ├── guidelines.md      # 개발 가이드라인
│   ├── conventions.md     # 코딩 컨벤션
│   ├── directory.md       # 디렉토리 구조
│   └── functions.md       # 핵심 함수 및 메서드
│
├── api/
│   ├── endpoints.md       # API 엔드포인트 문서
│   ├── schemas.md         # API 요청/응답 스키마
│   └── swagger.json       # Swagger/OpenAPI 명세
│
├── data/
│   ├── models/
│   │   ├── class.md      # DataClass 정의
│   │   ├── structure.md  # DataStructure 정의
│   │   ├── enum.md       # Enum 정의
│   │   ├── constants.md  # 글로벌 상수
│   │   └── types.md      # TypeScript 타입 정의
│   │
│   ├── formats/
│   │   ├── json.md       # JSON 데이터 형식
│   │   ├── xml.md        # XML 데이터 형식
│   │   ├── csv.md        # CSV 데이터 형식
│   │   └── idl.md        # IDL 정의
│   │
│   └── database/
│       ├── schema.md     # DB 스키마 (Mermaid 다이어그램 포함)
│       ├── tables.md     # 테이블 상세 정보
│       ├── procedures.md # 저장 프로시저 및 함수
│       └── service.md    # DB 접속 정보