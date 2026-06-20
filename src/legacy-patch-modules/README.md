# Legacy Patch Modules

이 디렉터리는 `public/legacy-patch.js`에 몰려 있는 메뉴별 보정 코드를 안전하게 분리하기 위한 기준 위치다.

현재 운영 진입점은 아직 `public/legacy-patch.js`다. 원본 레거시 React 소스가 분리되어 있지 않으므로, 기능 변경 없이 한 번에 런타임을 모듈화하지 않는다. 새 작업은 먼저 이 디렉터리의 메뉴 소유권을 확인하고, 필요한 경우 해당 메뉴 단위로만 점진적으로 옮긴다.

공통 동작은 `common`, 화면별 동작은 `menus/<menu>` 아래에서 관리한다.
