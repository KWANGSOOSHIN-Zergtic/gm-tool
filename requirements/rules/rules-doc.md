# 문서화 규칙

## 1. 문서화 작성 규칙

- 프로젝트를 구성하는 언어 및 환경, Lib 또는 프레임 워크, 유틸리티, 컴포넌트 등 설치 및 사용 방법 문서화
- 모든 문서는 제작 및 변경사항 발생 시 즉시 업데이트 및 유지 보수
- 복잡한 로직에 대한 설명 필수
- 문서 변경 시 관련 개발자 리뷰 필수

## 3. 문서 파일 명

1. 프로젝트 문서
   - README.md: 프로젝트 소개, 설치 방법, 실행 방법
   - architecture.md: 시스템 구조, 기술 스택, 아키텍처 다이어그램
   - core-features.md: 핵심 기능 목록 및 상세 설명

2. 개발 문서
   - guidelines.md: 개발 프로세스, 코딩 스타일, 테스트 정책
   - conventions.md: 네이밍 규칙, 파일 구조, 컴포넌트 설계
   - directory.md: 프로젝트 폴더 구조 및 설명
   - functions.md: 공통 함수, 유틸리티 함수 설명

3. API 문서
   - endpoints.md: API 엔드포인트 목록 및 설명
   - schemas.md: 요청/응답 데이터 구조
   - swagger.json: OpenAPI 스펙 문서

4. 데이터 문서
   - models/: 데이터 모델 정의 및 설명
   - formats/: 데이터 교환 형식 정의
   - database/: DB 구조 및 쿼리 정의

5. 파일명
  - Project Documentation: README.md
  - Development Guide: Doc/Doc.md
  - Directory Structure: Doc/Dir.md
  - Core Functions: Doc/CoreFunction.md
  - Data Documentation:
    - Data Classes: Doc/Data/DataClass.md
    - Data Structures: Doc/Data/DataStructure.md
    - Enums: Doc/Data/Enum.md
    - Global Constants: Doc/Data/GlobalConstant.md
    - JSON Schemas: Doc/Data/Json.md
    - XML Schemas: Doc/Data/Xml.md
    - CSV Formats: Doc/Data/Csv.md
    - IDL Definitions: Doc/Data/Idl.md
    - Type Definitions: Doc/Data/Type.md
    - Service Info: Doc/Data/ServiceInfo.md
    - Database Schema: Doc/Data/DB.md

