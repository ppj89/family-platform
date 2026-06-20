# Travel Patch Ownership

여행 메뉴는 큰 여행 목록과 여행 상세를 분리해서 유지한다.

- 목록 화면: 여행 대제목 단위 목록만 보여준다.
- row 클릭: 상세 화면으로 들어간다.
- 수정/삭제: row 클릭과 분리된 버튼 또는 팝업에서 처리한다.
- 상세 화면: 해당 여행의 코스, 지도, 장소, 비용, 기록을 순서대로 보여준다.
- 여행 메뉴 수정 시 다른 메뉴의 렌더링/이벤트/API 코드를 같이 변경하지 않는다.

현재 원본 여행 화면은 레거시 번들 안에 있고, 운영 보정 후보는 `public/legacy-patch.js`의 `normalizeTravelEntryForm`, `renderTravelPageFromApi` 주변이다.
