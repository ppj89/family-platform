# Legacy Patch Modules

이 디렉터리는 `public/legacy-patch.js`에 몰려 있는 메뉴별 보정 코드를 안전하게 분리하기 위한 기준 위치다.

현재 운영 진입점은 `public/legacy-patch.js`다. 이 디렉터리의 파일을 `src/legacy-patch-modules/manifest.mjs` 순서대로 합쳐서 운영 파일을 만든다.

공통 동작은 `common`, 화면별 동작은 `menus/<menu>` 아래에서 관리한다.

작업 순서:

1. 해당 메뉴 파일만 수정한다.
2. `npm run build:legacy-patch`를 실행해 `public/legacy-patch.js`를 재생성한다.
3. `npm run check:legacy-patch`로 메뉴별 원본과 운영 파일이 같은지 확인한다.
4. 변경 범위에 맞춰 lint/build/브라우저 검증을 진행한다.

`*.js` 조각은 하나의 IIFE를 순서대로 나눈 파일이므로 단독 실행 파일이 아니다. 운영 검증 기준은 재조합된 `public/legacy-patch.js`다.
