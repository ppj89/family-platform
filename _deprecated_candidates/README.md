# 삭제 예정 후보 (검토 후 최종 삭제)

이 폴더는 **삭제된 게 아니라 이동만 된 것**입니다. `git mv`로 옮겨서 히스토리가 그대로 남아있고,
원래 경로로 되돌리고 싶으면 아래 어떤 항목이든 원래 상대 경로 그대로
`git mv _deprecated_candidates/<경로> <경로>` 하면 복구됩니다.

생성일: 2026-08-18
작업 브랜치: `claude/family-platform-cleanup-9prkyd`

## 확인 방법 (이동 전 검증 완료)

- `npm run build` — 성공 (에러 없음, 이동한 파일 어디서도 import되지 않음)
- `npm run lint` — 성공 (에러 없음)
- 빌드 결과물(`dist/`)에 legacy 관련 파일이 하나도 포함되지 않는 것 확인
- git 히스토리 전체(50개 커밋)에서 아래 legacy-patch 관련 파일들은 **최초 커밋(`669a430 Simplify app icon`) 이후 단 한 번도 수정된 적 없음** — 반면 같은 기간 동안 `src/features/*/pages`, `src/App.tsx` 등 실제 React 화면은 계속 수정되어 왔음

## 1. Legacy Patch 파이프라인 전체 (신뢰도: 높음 — 확실히 안 씀)

React 이관 이전에 운영 화면이 구동되던 방식의 잔재입니다. 원래는:

```
src/features/<menu>/legacy-patch/*.js  +  src/shared/legacy-patch/*.js
  → src/legacy-patch-manifest.mjs (조립 순서 정의)
  → scripts/build-legacy-patch.mjs (node 스크립트로 합쳐서 생성)
  → public/legacy-patch.js (생성물, 운영에서 로드)
```

**지금은 이 파이프라인이 완전히 끊겨 있습니다:**

- 현재 `index.html`(운영 진입점)은 `/src/main.tsx`만 로드하고, `legacy-patch.js`나 `/legacy/`는 전혀 참조하지 않습니다.
- `src/App.tsx`가 홈/캘린더/가계부/여행/육아/일기/가족그룹/맛집/커뮤니티/관리자 10개 메뉴를 전부 React 컴포넌트로 직접 렌더링합니다. "레거시 미이관" 안내(`LegacyNotice`)로 빠지는 분기는 도달 불가능한 죽은 코드였습니다.
- `package.json`의 `scripts`에는 문서(`docs/menu-source-structure.md` 등)가 안내하던 `build:legacy-patch`, `check:legacy-patch` 명령이 **애초에 존재하지 않습니다.** 즉 최근 히스토리 어디에서도 이 생성 파이프라인을 실제로 돌린 적이 없습니다.
- `public/legacy-patch.js`, `public/legacy-overrides.css`, `public/legacy/`(구버전 독립 빌드 전체)는 git 히스토리상 최초 커밋 이후 단 1바이트도 바뀌지 않았습니다.

이동한 경로:

- `src/shared/legacy-patch/` (14개 파일)
- `src/features/{baby,calendar,community,diary,family,home,ledger,restaurant,travel}/legacy-patch/` (9개 메뉴, 총 18개 파일)
- `src/features/{auth,baby,calendar,community,diary,family,home,ledger,restaurant,travel}/index.js` (메뉴별 legacy patch 진입점, 10개 파일 — 실제 화면 진입점이 아니라 legacy-patch 조립용이었습니다)
- `src/features/travel/components/{00-travel-list-view,01-travel-detail-view,02-travel-record-view}.js` (여행 메뉴 `components/` 폴더에 잘못 섞여 있던 legacy-patch 원본. `src/features/travel/index.js`의 `travelLegacyPatchParts.listView/detailView/recordView`가 가리키던 파일이었습니다)
- `src/legacy-patch-manifest.mjs` (조립 순서 정의)
- `scripts/build-legacy-patch.mjs` (생성 스크립트, 어떤 npm script/CI에서도 호출되지 않음)
- `public/legacy/index.html`, `public/legacy/vite.svg` (구버전 독립 앱 진입 HTML)

다음 4개 생성 파일은 순수 빌드 산출물(직접 작성한 소스가 아니라 번들러가 만들어낸 압축 결과물)이라 이 폴더로 옮기지 않고 **원래 경로에서 바로 삭제**했습니다. 실제 내용(원본 로직)은 위에 이미 옮겨진 `legacy-patch/*.js` 소스 쪽에 그대로 남아있고, 파일 자체가 필요하면 이 정리 커밋 직전 시점의 git 히스토리에서 언제든 복구할 수 있습니다.

- `public/legacy-patch.js` (585KB, 12,806줄 생성물)
- `public/legacy-overrides.css` (282KB, 13,450줄 생성물)
- `public/legacy/assets/index-DFjbaB-2.js` (497KB, 압축된 구버전 앱 번들)
- `public/legacy/assets/index-CkWNYWFk.css` (81KB, 압축된 구버전 앱 스타일)

**참고:** `nginx.conf`에는 아직 `/legacy-patch.js`, `/legacy-overrides.css`를 서빙하는 location 블록이 남아있습니다. 지금까지는 위 파일들이 `public/`에 그대로 있어서 문제없이 응답했지만, 이번 이동 이후 배포하면 그 경로들은 404가 됩니다. 실제 화면 어디서도 그 경로를 링크/로드하지 않으므로 정상적인 사용자 흐름에는 영향이 없을 것으로 판단하지만, 배포 전에 한 번은 직접 `https://<도메인>/legacy-patch.js` 접속해서 지금 응답이 오는지, 그리고 배포 후 정말 아무도 안 쓰는지 확인해보시길 권장합니다. nginx.conf의 해당 location 블록 자체를 지울지는 최종 삭제 시점에 같이 정리하면 됩니다.

## 2. 빈 배럴 파일 (신뢰도: 높음 — 내용이 아예 없음)

`export {}` 한 줄만 있고 아무도 import하지 않는 완전히 빈 자리표시자 파일입니다.

- `src/app/index.ts`
- `src/shared/styles/index.ts`
- `src/shared/types/index.ts`

## 3. 대체된 스크립트 (신뢰도: 높음 — 문서/실사용 명령이 다른 파일을 가리킴)

각 스크립트는 저장소 전체(문서, package.json, CI, 다른 스크립트, Dockerfile 등)를 검색해도 **어디서도 이름이 참조되지 않았고**, 실제로 쓰이는 대체 스크립트가 따로 존재합니다.

| 이동한 파일 | 대신 실제로 쓰이는 것 |
|---|---|
| `scripts/check-server.ps1` | `scripts/check-prod.ps1` (README에 명시) |
| `scripts/deploy-prod.ps1`, `scripts/deploy-prod.sh` | `scripts/deploy-prod-https.*` (README 안내, 실제 도메인+HTTPS 운영 방식과 일치) |
| `scripts/dev-env.cmd`, `scripts/dev-env.ps1` | `JAVA_HOME` 설정이 `scripts/build-android-debug*.ps1` 안에 이미 인라인으로 들어있음 |
| `scripts/node-tools.ps1` | `scripts/node-tools.cmd` |
| `scripts/npm-tools.ps1` | `scripts/npm-tools.cmd` (README에 명시) |
| `scripts/start-backend-local.cmd`, `scripts/start-backend-local.ps1` | README가 `docker compose up --build -d db api` 명령을 직접 안내 |
| `scripts/build-android-debug.sh` | `scripts/build-android-debug.ps1` (README에 명시, Windows 작업환경 기준) |

## 4. 이번엔 옮기지 않은 애매한 항목 (검토만 하시고 필요시 직접 정리하세요)

이동하지 않은 이유는 "확실히 안 쓴다"는 근거가 legacy-patch만큼 강하지 않아서입니다. 문서에 안내가 없을 뿐, 수동으로 그때그때 실행하는 운영 스크립트일 가능성이 있습니다.

- `scripts/set-prod-brevo.sh`, `scripts/set-prod-smtp.sh` — 이메일 발신 프로바이더(Brevo/SMTP) 설정용. 참조하는 문서는 없지만 최초 설정 시 1회성으로 수동 실행했을 가능성이 있습니다. 앞으로도 SMTP/Brevo 설정을 바꿀 계획이 없으면 삭제해도 됩니다.
- `scripts/check-web-ui.mjs` — Playwright로 로그인 후 전체 메뉴를 순회하는 수동 QA 스크립트. npm script나 CI에 연결되어 있지 않아 `node scripts/check-web-ui.mjs` 형태로 직접 실행했을 것으로 보입니다. 개발 중 화면 점검용으로 계속 쓰실 거면 남겨두세요.
- `src/shared/api/media.ts` — `uploadMedia()` 함수가 정의되어 있지만 앱 전체에서 이 함수를 호출하는 곳이 한 곳도 없습니다. README의 "Media upload accepts only image/video content types" 문구로 보아 이미지/동영상 업로드 기능 자체는 있어야 할 것 같은데, 실제 업로드 UI가 이 헬퍼를 안 쓰고 있거나(다른 방식으로 구현), 혹은 미완성 상태로 남아있는 것으로 보입니다. 육아/일기/여행/커뮤니티 등에서 사진 업로드가 실제로 동작하는지 확인해보시고, 안 쓰는 게 맞으면 다음 정리 때 옮기면 됩니다.
- `src/shared/api/index.ts`, `src/shared/utils/index.ts` — 배럴(재수출) 파일. 이 파일 자체를 import하는 곳은 없지만, 안의 개별 함수들(`auth`, `client`, `commonCodes`, `family`, `date`, `number`)은 각 화면에서 개별 경로로 직접 import되어 실제로 쓰이고 있습니다. 배럴 파일 자체만 안 쓰는 것이라 위험도가 낮고, 앞으로 재사용 편의를 위해 남겨둬도 무방합니다.
- `ios/` 폴더, `cap:ios` / `cap:open:ios` npm script, `@capacitor/ios` 의존성 — 사용자님 말씀대로 실제 배포는 안드로이드에만 하고 계시지만, `.github/workflows/ci.yml`의 `ios` job이 여전히 매 push/PR마다 iOS 시뮬레이터 빌드를 돌리고 있습니다(스토어 배포는 안 해도 빌드 자체는 CI에서 계속 검증 중). 완전히 iOS 계획이 없으시면 CI job과 `ios/` 폴더, 관련 npm script를 정리해서 CI 시간을 절약할 수 있습니다. 지금은 "안 쓰는 죽은 코드"라기보다 "쓰는 곳(CI)이 있는 기능"이라 이동하지 않았습니다.

## 최종 삭제하려면

이 폴더 전체를 지우고 커밋하면 됩니다:

```bash
git rm -r _deprecated_candidates
git commit -m "Remove deprecated legacy-patch pipeline and orphaned scripts"
```

부분적으로만 삭제하고 싶으면 해당 하위 경로만 `git rm -r`로 지우면 됩니다.
