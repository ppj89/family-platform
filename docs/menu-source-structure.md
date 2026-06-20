# 메뉴별 소스 구조 기준

이 프로젝트의 운영 화면은 현재 `public/legacy/assets/index-DFjbaB-2.js` 레거시 번들과 `public/legacy-patch.js` 보정 스크립트가 함께 만든다. 원본 React 메뉴 컴포넌트 소스가 저장소에 분리되어 있지 않기 때문에, 기능을 바로 큰 폭으로 분해하면 여행/육아/일기/맛집처럼 서로 다른 메뉴가 같이 깨질 수 있다.

따라서 메뉴 수정은 아래 구조와 소유권 기준을 먼저 적용한다.

## 필수 원칙

- 메뉴 하나를 수정할 때 다른 메뉴의 렌더링, 이벤트, API 흐름을 같이 변경하지 않는다.
- 공통으로 쓸 수 있는 datepicker, form, filter, button, loading 처리는 `src/legacy-patch-modules/common` 기준으로 분리한다.
- 메뉴별 동작은 `src/legacy-patch-modules/menus/<menu>` 기준으로 분리한다.
- 운영에 적용되는 기존 보정은 당분간 `public/legacy-patch.js`에 남아 있을 수 있지만, 새 변경은 먼저 메뉴 소유권을 확인하고 해당 메뉴 영역만 수정한다.
- `public/legacy-patch.js`에서 코드를 옮길 때는 한 번에 한 메뉴만 옮기고, 옮긴 뒤 PC/태블릿/모바일/앱 화면을 확인한다.
- 기존 동작 원복이 필요하면 메뉴별 커밋 단위로 되돌릴 수 있게 변경 범위를 작게 유지한다.
- 사용자 요청 없이 전체 메뉴 공통 리팩터링을 진행하지 않는다.

## 디렉터리 기준

- `src/legacy-patch-modules/common`: 공통 loading, datepicker, form, filter, button, API helper 후보
- `src/legacy-patch-modules/menus/travel`: 여행 목록, 여행 상세, 여행 코스/지도/비용 기록
- `src/legacy-patch-modules/menus/baby`: 육아 아이 목록, 상세, 기록, 성장 기록
- `src/legacy-patch-modules/menus/diary`: 일기 목록, 상세, 작성/수정
- `src/legacy-patch-modules/menus/restaurant`: 맛집 목록, 상세, 기록
- `src/legacy-patch-modules/menus/ledger`: 가계부 목록, 필터, 입력폼
- `src/legacy-patch-modules/menus/calendar`: 캘린더 일정/필터/date UI
- `src/legacy-patch-modules/menus/family`: 가족그룹, 초대, 권한 흐름

## 현재 레거시 소유권 맵

현재 운영 반영 파일은 `public/legacy-patch.js`다. 아래 함수가 보이면 해당 메뉴 소유권으로 판단한다.

- 공통: `installApiLoadingInterceptor`, `setApiLoadingVisible`, `beginApiLoading`, `endApiLoading`, `openCommonDatePopover`, `pageHeadingIs`
- 가계부: `renderLedgerPageFromApi`, `normalizeLedgerEntryForm`
- 맛집: `renderRestaurantPageFromApi`
- 여행: `normalizeTravelEntryForm`, `renderTravelPageFromApi`
- 육아: `normalizeBabyEntryForms`
- 일기: `renderDiaryPageFromApi`
- 서버 화면 갱신 연결: `refreshServerDataViews`

여행 메뉴는 원본 레거시 화면 안에 목록, 상세, 코스 순서, 지도 입력, 비용/장소 기록 UI가 들어 있다. 여행 목록 화면은 큰 여행 단위만 보여주고, row 클릭은 상세 진입이어야 한다. 수정/삭제는 목록 버튼 또는 팝업으로 분리하고 row 클릭 동작을 수정으로 바꾸지 않는다.

## 변경 절차

1. `AGENTS.md`, `docs/common-ui-guidelines.md`, 이 문서를 먼저 읽는다.
2. 수정할 메뉴의 `src/legacy-patch-modules/menus/<menu>/README.md`를 확인한다.
3. 기존 운영 동작 위치가 `public/legacy-patch.js`인지, 레거시 번들인지 확인한다.
4. 한 메뉴의 변경만 적용한다.
5. `npm run lint`, `npm run build`, 브라우저 PC/태블릿/모바일 확인을 진행한다.
6. 운영 반영 대상이면 배포 후 운영 URL에서 동일하게 확인한다.
