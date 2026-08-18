# 컴포넌트/공통 코드 분리 기준

Family Platform의 신규 화면, 메뉴 수정, 공통 UI 수정은 실제 프로젝트 구조처럼 메뉴별 feature와 shared 영역으로 나누어 진행한다.

## 최상위 구조

- `src/app`: 앱 시작, 라우팅, 전역 provider, 전역 shell.
- `src/features`: 메뉴별 기능 코드.
- `src/shared`: 여러 메뉴가 함께 쓰는 공통 코드.
- `src/legacy-patch-manifest.mjs`: legacy patch 조립 순서.

## 메뉴별 feature 구조

각 메뉴는 `src/features/<menu>` 아래에 둔다.

- `components`: 해당 메뉴에서만 쓰는 컴포넌트.
- `pages`: 목록, 상세, 작성, 수정 화면 단위.
- `api`: 해당 메뉴 API 호출과 DTO 변환.
- `hooks`: 해당 메뉴 전용 hook.
- `utils`: 해당 메뉴 전용 계산/포맷 함수.
- `types`: 해당 메뉴 전용 타입.

메뉴 하나를 수정할 때는 해당 메뉴 폴더와 필요한 `src/shared`만 수정한다. 다른 메뉴 폴더를 함께 수정하지 않는다.

## 공통 shared 구조

공통 코드는 `src/shared` 아래에 둔다.

- `components`: 공통 Button, Input, Select, DatePicker, Modal, Panel, List, Chip.
- `api`: 공통 API client, auth header, error parser.
- `hooks`: 공통 hook.
- `utils`: 날짜, 시간, 숫자, 문자열, 권한 계산.
- `types`: 공통 타입.
- `styles`: 공통 class, token, layout 기준.

공통으로 쓸 가능성이 있는 코드를 메뉴 폴더에 복사하지 않는다. 반대로 한 메뉴에서만 쓰는 코드를 shared로 과하게 올리지 않는다.

## legacy patch 관련 안내

React 이관이 완료되어 운영 화면은 `public/legacy-patch.js`를 더 이상 로드하지 않는다. 관련 원본(`src/features/*/legacy-patch`, `src/shared/legacy-patch`, `src/legacy-patch-manifest.mjs`, `scripts/build-legacy-patch.mjs`, `public/legacy-patch.js`, `public/legacy/`)은 2026-08-18 정리 작업에서 `_deprecated_candidates/`로 이동했다. 새 작업에서 legacy patch 원본을 만들거나 참조하지 않는다.

## 금지 사항

- 여러 메뉴 코드를 한 파일에 계속 추가하지 않는다.
- 메뉴 전용 코드를 공통으로 위장해서 넣지 않는다.
- 공통 DatePicker, Input, Select, Modal, Button을 메뉴마다 새로 만들지 않는다.
- 수정 범위 밖 메뉴 파일을 함께 바꾸지 않는다.
- `display:none`으로 불필요한 UI를 숨겨서 해결하지 않는다.
