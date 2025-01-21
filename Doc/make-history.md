# 프로젝트 제작 문서

- Cursor AI 를 사용하여 프로젝트를 제작 하였습니다.
- 제작 전반에 있어서 아래 영상을 참조하여 제작 하였습니다.

## 프로젝트 셋팅
---
1. next proejct 설정
    ```bash
    npx create-next-app@latest .
    ```

2. shadcn 설정
    ```bash
    npm shadcn@latest init -d
    ```
---

---
## ai 를 통해 프로젝트 제작 하는 방법
   1. o1에게 개발에 필요한 맥락을 모두 주절 주절 제공하고, PRD 문서를 마크다운 형식으로 생성 요청 
   2. PRD 문서를 Cursor Notepad에 입력. (코드 컨벤션 문서가 있다면 추가)
   3. project root에 .cursorreules 파일 생성하고 필요한 CI를 추가
   4. cursor composer + agent mode로 PRD notepad 문서를 클릭하고 prd 문서 기반으로 MVC 코드를 단계별로 나눠서 로직 없이 클래스/함수 생성.
   5. 새로운 composer 대화 세션을 열고 PRD 문서대로 다 생성이 되었는지 다시 확인 후 폴더/파일 구조를 설명과 함께 출력 요청 후 그 내용을 다시 PRD 문서에 추가.
   6. PRD에 추가된 내용을 기반으로 순차적으로 코드를 생성하고 테스트 진행 -> (환경설정에서 iterate on linits (beta)를 on으로 설정하면 한번더 lints에러 agent가 수행함)
   7. 테스트 완료된 코드는 README.md 파일에 문서로 생성하라고 지시
   8. go to 6 마지막까지 무한 반복
   9. Done
---

3. .cursorrules 파일 설정
  - 참조 1 : https://www.youtube.com/watch?v=6JuC2N5ZckM 
  - 참조 2 : https://youtu.be/XOgGLvI05i4?si=5_sIlf55oY7DjCz3&t=645
  - 기본적인 룰은 참조 1의 룰을 기제 적용
  - AI Chat 룰은 참조 2의 룰을 기제 적용
  - AI Rules 를 Chat 을 통해 검수 및 내용 수정 후 적용

4. 프로젝트 제작 목표와 단계별 제작 내용을 작성
5. 단계별 제작 내용을 Chat 을 통해 검수 및 내용 수정 후 적용
   - 적용하고자 하는 내용 및 기술을 기제
6. 관련 프롬프트 및 제작 방법을 Chat에게 요구 하고 재 검수 후 적용
7. 테스트 코드 생성
8. 관련 문서 생성