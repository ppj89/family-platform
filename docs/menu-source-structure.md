# 메뉴별 소스 구조 기준

운영 화면은 아직 레거시 번들과 `public/legacy-patch.js` 조합으로 동작한다. 하지만 수정 원본은 메뉴별 feature 디렉터리에 둔다.

## 원본 위치

- 공통 legacy patch: `src/shared/legacy-patch`
- 여행: `src/features/travel/legacy-patch`
- 육아: `src/features/baby/legacy-patch`
- 일기: `src/features/diary/legacy-patch`
- 맛집: `src/features/restaurant/legacy-patch`
- 가계부: `src/features/ledger/legacy-patch`
- 캘린더: `src/features/calendar/legacy-patch`
- 가족그룹: `src/features/family/legacy-patch`
- 홈: `src/features/home/legacy-patch`
- 커뮤니티: `src/features/community/legacy-patch`

`src/legacy-patch-modules`는 더 이상 원본 위치로 사용하지 않는다.

## 빌드 흐름

- 조립 순서: `src/legacy-patch-manifest.mjs`
- 생성 파일: `public/legacy-patch.js`
- 생성 명령: `npm run build:legacy-patch`
- 동기화 확인: `npm run check:legacy-patch`

`public/legacy-patch.js`는 생성물이다. 직접 수정하지 말고 feature/shared 원본을 수정한 뒤 다시 생성한다.

## 수정 원칙

- 한 메뉴를 수정할 때는 해당 메뉴의 `src/features/<menu>` 아래만 수정한다.
- 여러 메뉴가 같이 쓰는 동작만 `src/shared`로 뺀다.
- 목록, 상세, 입력, 필터, datepicker 같은 반복 구조는 공통 패턴을 먼저 확인한다.
- 필요 없는 UI는 `display:none`으로 숨기지 말고 렌더링 원본에서 제거한다.
- 여행 목록 row 클릭은 상세 진입이고, 수정/삭제는 별도 버튼 또는 팝업으로 분리한다.

## 검증

변경 후 기본 검증은 아래 순서로 진행한다.

```bash
npm run build:legacy-patch
npm run check:legacy-patch
npm run lint
npm run build
```
