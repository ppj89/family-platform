# Source Structure

이 디렉터리는 메뉴별 feature와 공통 shared 구조를 기준으로 관리한다.

## 기본 구조

- `app`: 앱 시작, 라우팅, 전역 provider, 전역 shell
- `features`: 메뉴별 기능 코드
- `shared`: 여러 메뉴가 함께 쓰는 공통 코드
- `legacy-patch-modules`: 기존 운영 patch를 메뉴별로 나눈 호환 계층

## Feature 기준

각 메뉴는 `features/<menu>` 아래에 둔다.

- `components`: 해당 메뉴 전용 컴포넌트
- `pages`: 목록, 상세, 작성, 수정 화면
- `api`: 해당 메뉴 API 호출과 DTO 변환
- `hooks`: 해당 메뉴 전용 hook
- `utils`: 해당 메뉴 전용 계산/포맷 함수
- `types`: 해당 메뉴 전용 타입
- `index.ts`: 해당 메뉴 공개 진입점

메뉴 하나를 수정할 때는 해당 메뉴 폴더와 필요한 `shared`만 수정한다. 다른 메뉴 폴더를 함께 수정하지 않는다.

## Shared 기준

공통 코드는 `shared` 아래에 둔다.

- `components`: 공통 Button, Input, Select, DatePicker, Modal, Panel, List, Chip
- `api`: 공통 API client, auth header, error parser
- `hooks`: 공통 hook
- `utils`: 날짜, 시간, 숫자, 문자열, 권한 계산
- `types`: 공통 타입
- `styles`: 공통 class, token, layout 기준

공통 UI/API/hook/util을 메뉴마다 복사하지 않는다.

## Legacy Patch 기준

현재 운영 화면 일부는 레거시 번들과 `legacy-patch` 조합으로 동작한다. 레거시 patch를 수정해야 하면 `legacy-patch-modules/menus/<menu>` 또는 `legacy-patch-modules/common`에서 수정하고 `npm run build:legacy-patch`로 `public/legacy-patch.js`를 재생성한다.

검증은 `npm run check:legacy-patch`, `npm run lint`, `npm run build`를 기본으로 한다.
