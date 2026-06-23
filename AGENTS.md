# Family Platform 작업 기준

이 저장소에서 소스 수정 작업을 시작하기 전에 반드시 아래 문서를 먼저 읽고 적용한다.

1. `docs/common-ui-guidelines.md`
2. `docs/menu-source-structure.md`
3. `docs/component-source-structure.md`

## 필수 원칙

- 사용자가 말한 범위만 수정한다.
- 특정 메뉴 작업을 요청받으면 해당 메뉴 디렉터리의 `.js`만 수정하고, 명시 지시 없이 다른 메뉴 디렉터리의 `.js`는 절대 건드리지 않는다.
- 사용자가 `1, 2, 3, 4, 5 ...`처럼 번호로 작업을 주면 번호 순서대로 빠짐없이 처리하고, 이전 번호가 완료되기 전 다음 번호로 넘어가지 않는다.
- 필요 없는 UI나 소스는 `display: none`으로 숨기지 말고 렌더링/소스에서 제거한다.
- 이벤트가 없거나 실제 기능으로 이어지지 않는 보여주기식 버튼, 링크, 액션 UI는 만들지 않는다.
- 기존에 남아 있는 보여주기식 버튼, 링크, 액션 UI는 숨기지 말고 렌더링 소스에서 제거한다.
- 디자인은 공통 클래스와 기존 화면 패턴을 우선 사용한다.
- 전체적인 디자인 구성은 다른 화면과 동일하게 맞추고, 버튼 크기와 간격도 기존 디자인 사이즈에 맞춰 화면이 깨지지 않게 작업한다.
- 공통 디자인에서 벗어난 새 스타일이 필요하면 화면 디자인 확인을 받은 뒤 진행한다.
- 기존 공통 디자인에 없는 UI가 필요하면 먼저 재사용 가능한 공통 클래스/패턴으로 정의한 뒤 사용한다.
- 공통 CSS와 기존 화면 CSS는 임의로 수정하지 않는다. 화면별 보정이 꼭 필요하면 기존 규칙을 건드리지 말고 해당 메뉴에만 적용되는 scoped override를 새로 추가한다.
- 공통 CSS 수정이 필요하다고 판단되면 수정 전에 사용자 확인을 먼저 받는다.
- input, select, datepicker, form, filter, button은 공통 기준을 따른다.
- 저장, 수정, 삭제처럼 데이터가 생성/변경/삭제되는 버튼은 항상 공통 confirm을 먼저 띄운 뒤 실행한다.
- 화면별로 `window.confirm`, 임의 confirm UI, 별도 팝업을 새로 만들지 말고 기존 공통 confirm 컴포넌트/헬퍼를 사용한다.
- 공통 confirm이 없는 상황이면 화면별 임시 구현을 만들기 전에 공통 confirm을 먼저 만들고 모든 메뉴에서 재사용한다.
- 소스 수정 후에는 변경 범위에 맞게 lint, build, 브라우저 화면 확인을 진행한다.
- 소스 수정 후 브라우저 확인은 단순 진입 확인으로 끝내지 않는다. 사용자가 지적한 실제 흐름을 시작부터 끝까지 직접 클릭해서 확인한다.
- 목록/상세 구조를 수정한 경우 반드시 `목록 진입 -> row 클릭 -> 상세 진입 -> 목록 복귀`까지 직접 테스트하고, 각 단계에서 목록/상세/입력폼 개수와 화면 깨짐 여부를 확인한 뒤 반영한다.
- 버튼, row, 입력, 저장, 수정, 삭제 중 하나라도 수정했으면 해당 액션을 실제로 클릭/입력해서 동작 여부를 확인한다.
- 운영 배포 전후로 같은 사용자 흐름을 다시 확인하고, 운영 화면에서 재현 캡처 또는 DOM 상태를 확인하지 않은 작업은 완료로 말하지 않는다.
- 항상 PC, 태블릿, 모바일, 앱 환경에서 보이는 화면을 기준으로 작업하고, 모든 화면 크기에서 깨짐/겹침/가로 스크롤이 없는지 테스트한 뒤 반영한다.
- 운영 반영이 필요한 작업은 배포 후 운영 화면/헬스체크까지 확인한다.

## Mandatory Actual Testing Before Reporting Done

- Any source change must be tested by Codex before it is reported as complete.
- Testing must cover the real user path, not only build/lint or initial page load.
- If a menu has list/detail behavior, test list entry, row click, detail entry, and return-to-list directly in the browser.
- If a button, input, save, edit, delete, search, map, or datepicker was changed, operate that exact control before reporting completion.
- After production deployment, repeat the same real user path on the deployed site and verify the screen state or screenshot before saying the work is done.
