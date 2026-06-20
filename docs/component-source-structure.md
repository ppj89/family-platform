# 컴포넌트/공통 코드 분리 기준

Family Platform의 신규 화면, 메뉴 수정, 공통 UI 수정은 실제 프로젝트 구조처럼 메뉴별 feature와 공통 shared 영역으로 나눠서 진행한다. 한 파일에 여러 메뉴의 화면, 이벤트, API, 스타일을 계속 추가하지 않는다.

현재 운영 화면 일부는 레거시 번들과 `legacy-patch` 조합으로 동작한다. 레거시를 수정해야 하는 경우에도 새 기준은 동일하다. 기능을 새로 만들거나 기존 기능을 TS/React 쪽으로 옮길 때는 아래 구조를 먼저 만든 뒤 메뉴별로 옮긴다.

## 최상위 구조

- `src/app`: 앱 시작, 라우팅, 전역 provider, 전역 shell
- `src/features`: 메뉴별 기능 코드
- `src/shared`: 여러 메뉴가 함께 쓰는 공통 코드
- `src/legacy-patch-modules`: 기존 운영 patch를 메뉴별로 나눈 임시 호환 계층

## 메뉴별 feature 구조

각 메뉴는 `src/features/<menu>` 아래에 둔다.

- `components`: 해당 메뉴에서만 쓰는 컴포넌트
- `pages`: 메뉴의 목록/상세/작성 화면 단위
- `api`: 해당 메뉴 API 호출과 DTO 변환
- `hooks`: 해당 메뉴 전용 hook
- `utils`: 해당 메뉴 전용 계산/포맷 함수
- `types`: 해당 메뉴 전용 타입
- `index.ts`: 외부 공개 진입점

메뉴 하나를 수정할 때는 해당 메뉴 폴더와 필요한 `src/shared`만 수정한다. 다른 메뉴 폴더를 함께 수정하지 않는다.

## 공통 shared 구조

공통 코드는 `src/shared` 아래에 둔다.

- `components`: 공통 Button, Input, Select, DatePicker, Modal, Panel, List, Chip
- `api`: 공통 API client, auth header, error parser
- `hooks`: 공통 hook
- `utils`: 날짜, 시간, 숫자, 문자열, 권한 계산
- `types`: 공통 타입
- `styles`: 공통 class, token, layout 기준

공통으로 쓸 가능성이 있는 코드를 메뉴 폴더에 복사하지 않는다. 단, 한 메뉴에서만 쓰는 코드는 공통으로 올리지 않는다.

## 파일명 기준

- React 컴포넌트: `PascalCase.tsx`
- hook: `useSomething.ts`
- API 함수: `<menu>Api.ts`
- 타입: `<menu>Types.ts`
- 유틸: `<menu>Utils.ts` 또는 공통이면 `dateUtils.ts`, `timeUtils.ts`
- 메뉴 페이지: `<Menu>ListPage.tsx`, `<Menu>DetailPage.tsx`, `<Menu>EditDialog.tsx`

파일명만 보고 어떤 메뉴/역할인지 구분되어야 한다. `index.tsx`, `utils.ts`, `component.tsx`처럼 의미가 불명확한 이름으로 새 파일을 만들지 않는다.

## 메뉴별 현재 목표 구조

- 여행: `src/features/travel`
  - 큰 여행 목록, 여행 상세, 코스/지도/장소/비용 기록을 분리한다.
  - 목록 row 클릭은 상세 진입이고 수정/삭제는 별도 버튼/팝업이다.
- 육아: `src/features/baby`
  - 아이 목록, 아이 상세, 기록 추가, 성장 기록을 분리한다.
- 일기: `src/features/diary`
  - 일기 목록, 상세, 작성/수정을 분리한다.
- 맛집: `src/features/restaurant`
  - 맛집 목록, 상세, 기록을 분리한다.
- 가계부: `src/features/ledger`
  - 조회 필터, 목록, 입력/수정 폼, 상세를 분리한다.
- 캘린더: `src/features/calendar`
  - 캘린더 뷰, 일정 상세, 일정 입력, datepicker 기준을 분리한다.
- 가족그룹: `src/features/family`
  - 가족 생성, 초대, 수락/취소, 권한을 분리한다.
- 홈: `src/features/home`
  - 대시보드 요약과 메뉴별 집계를 분리한다.
- 커뮤니티: `src/features/community`
  - 게시글 목록, 상세, 작성, 댓글, 파일을 분리한다.
- 인증/계정: `src/features/auth`
  - 로그인, 회원가입, 비밀번호, 내 정보, 세션 처리를 분리한다.

## 작업 절차

1. 기존 동작이 레거시 patch인지 feature 소스인지 확인한다.
2. 새 코드가 필요하면 먼저 `src/features/<menu>` 또는 `src/shared`에 파일을 만든다.
3. 메뉴별 컴포넌트, API, hook, util을 한 파일에 섞지 않는다.
4. 공통 UI는 `src/shared/components`에 만들고 메뉴별 CSS로 모양을 다시 만들지 않는다.
5. 레거시 patch를 계속 수정해야 하면 `src/legacy-patch-modules/menus/<menu>`에서 수정하고 `npm run build:legacy-patch`를 실행한다.
6. 변경 후 `npm run check:legacy-patch`, `npm run lint`, `npm run build`, 브라우저 PC/태블릿/모바일 확인을 진행한다.

## 금지 사항

- 여러 메뉴 코드를 한 파일에 추가하지 않는다.
- 메뉴 전용 코드를 공통으로 위장해서 넣지 않는다.
- 공통이어야 할 DatePicker, Input, Select, Modal, Button을 메뉴마다 새로 만들지 않는다.
- 수정 범위 밖 메뉴 파일을 함께 변경하지 않는다.
- 원복하기 어려운 대규모 파일 변경을 한 커밋에 섞지 않는다.
