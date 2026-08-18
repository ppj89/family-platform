# Family Platform 작업 기준

이 저장소에서 소스 수정 작업을 시작하기 전에 반드시 아래 문서를 먼저 읽고 적용한다.

1. `docs/common-ui-guidelines.md`
2. `docs/menu-source-structure.md`
3. `docs/component-source-structure.md`
4. `docs/legacy-design-migration.md`

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

## Legacy Design Migration Rule

- 전체적으로 화면 전부다 확인해서 반영 하기. 무조건 PC, 태블릿, 모바일, 앱 WebView의 전체 화면을 레거시와 비교하고 빠진 차이를 남기지 않는다.
- When matching a React screen to a legacy screen, inspect the whole legacy screen before editing.
- Do not fix only the single item the user pointed out. Compare and apply all visible design details for that screen: layout, section order, card size, control height, spacing, border radius, colors, font size, font weight, line-height, icon type, button size, selected/disabled/outside states, empty states, and data display rules.
- Use the legacy implementation source as the source of truth when it exists. Check both legacy CSS and legacy JS behavior, then reproduce the same behavior in the React component/CSS files.
- For calendar/month views, verify each cell part separately: day number, outside-month day, holiday color, lunar text, schedule chip, `+N` count, selected day border, fixed cell height, grid gap, month header, view tabs, and schedule list below.
- Before reporting completion, verify the rendered React screen with realistic data, including crowded states that can change layout height or overflow.

## Mandatory Actual Testing Before Reporting Done

- Any source change must be tested by Codex before it is reported as complete.
- Testing must cover the real user path, not only build/lint or initial page load.
- If a menu has list/detail behavior, test list entry, row click, detail entry, and return-to-list directly in the browser.
- If a button, input, save, edit, delete, search, map, or datepicker was changed, operate that exact control before reporting completion.
- After production deployment, repeat the same real user path on the deployed site and verify the screen state or screenshot before saying the work is done.
- When the global API loading bar is visible, the screen must block clicks, touches, keyboard submits, and menu movement until the API request finishes.
- Travel menu entry must always show the top-level trip list first. A trip detail screen may open only after the user clicks a trip row.

## Evidence-First Completion Rule

- Do not report a fix, deployment, or completion based on source inspection, a successful build, or an assumed cause alone.
- Before reporting a defect fixed, reproduce the reported failure when possible and record the failing request, response, or rendered state that explains the cause.
- For API-backed screens, verify both the API response and the rendered browser result with the same authenticated user and data relevant to the report.
- A production deployment is not complete until the deployed URL passes the same real user-path test. State the exact tests that passed; never claim that untested paths are fixed.
- If verification cannot be performed, clearly report it as unverified and continue diagnosis. Never substitute a fallback UI, toast, or guessed workaround for root-cause handling.

## Google Play Console Access Rule

- Claude has no interactive browser session. Play Console web UI cannot be checked or operated directly.
- Use the Play Developer API instead, authenticated with the `play-release-bot@together-records.iam.gserviceaccount.com` service account key, to read track/release status and to upload and publish new bundles.
- Never guess or restate a stale status ("검토 중" / "게시됨") from memory or from a prior chat log. Query the API fresh each time and report only what that response actually says.
- New Android builds go to the `internal` track first for the user to install and confirm on a real device. Only promote to `production` after that confirmation. Do not publish directly to production.
- If the API returns `PERMISSION_DENIED`, the service account has not been granted access to this app in Play Console (Settings → API access / Users and permissions) — report that plainly instead of retrying blindly.

## Local/Native Change Discipline (post-incident rule)

- On 2026-08-18 a broken Android 15 splash-screen theme reached production because a native (`android/`) fix was made and built only in a local working copy and was never committed to GitHub, while a separate local copy had also drifted out of sync. Nobody could tell which local folder was authoritative, and the actually-live Play Store build could not be verified against any source in this repository.
- Any change under `android/`, `ios/`, or `capacitor.config.ts` must be committed and pushed before or immediately after building a release from it. A release build that only exists in an uncommitted local working copy is not considered done.
- Keep exactly one local working copy per machine. If a second copy or worktree is created for an experiment, merge or discard it before starting the next task — do not leave two folders both claiming to be "the real one."
- Before reporting a native/release issue as fixed, confirm which versionCode is actually live via the Play Developer API (see the rule above), not from a chat log or a prior "빌드 성공" message.

## Repeated Travel/Common UI Rules

- 여행 메뉴를 수정할 때는 여행 메뉴 `.js`만 수정한다. 사용자가 명시하지 않은 다른 메뉴 `.js`는 절대 건드리지 않는다.
- 기존에 동작하던 지도/API/검색 구현이 있으면 새로 만들지 말고 먼저 기존 구현을 찾아 그대로 재사용한다.
- 여행 상세의 태블릿 화면은 왼쪽 기록/지도 영역과 오른쪽 입력 영역을 분리한 2섹터 구조를 유지한다.
- 여행 상세 첫 진입은 항상 여행 대목록만 보여준다. 상세와 기록 입력 폼은 row 클릭 이후에만 보여준다.
- select, datepicker, time, input은 네이티브 브라우저 UI를 직접 노출하지 않고 공통 `.custom-select`, `.date-picker-field`, `.date-picker-trigger`, `.form-control` 패턴을 사용한다.
- 공통 CSS의 기존 규칙은 수정하지 않는다. 필요한 보정은 해당 메뉴에만 적용되는 scoped CSS를 추가한다.
- 수정 후에는 PC/태블릿/모바일/앱 WebView 기준으로 직접 클릭 흐름을 검증하고, 특히 목록 -> row 클릭 -> 상세 -> 지도 -> 입력 컨트롤 흐름을 확인한다.
