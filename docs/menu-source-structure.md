# 메뉴별 소스 구조 기준

운영 화면은 React 이관이 완료되어 `src/App.tsx`가 메뉴별 `src/features/<menu>/pages`를 직접 렌더링한다. 레거시 번들(`public/legacy-patch.js`, `public/legacy/`)과 그 원본이었던 `src/features/*/legacy-patch`, `src/shared/legacy-patch`, `src/legacy-patch-manifest.mjs`, `scripts/build-legacy-patch.mjs`는 2026-08-18 정리 작업에서 `_deprecated_candidates/`로 이동했다. 최종 삭제 전 검토용 보관 폴더이며, 실제 소스 수정 시 참조하지 않는다.

## 수정 원칙

- 한 메뉴를 수정할 때는 해당 메뉴의 `src/features/<menu>` 아래만 수정한다.
- 여러 메뉴가 같이 쓰는 동작만 `src/shared`로 뺀다.
- 목록, 상세, 입력, 필터, datepicker 같은 반복 구조는 공통 패턴을 먼저 확인한다.
- 필요 없는 UI는 `display:none`으로 숨기지 말고 렌더링 원본에서 제거한다.
- 여행 목록 row 클릭은 상세 진입이고, 수정/삭제는 별도 버튼 또는 팝업으로 분리한다.

## 검증

변경 후 기본 검증은 아래 순서로 진행한다.

```bash
npm run lint
npm run build
```
