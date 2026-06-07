# Family Platform Go API

Spring Boot API를 Go로 전환하기 위한 신규 백엔드입니다.

현재 1차 전환 범위:

- `/api/health`
- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/families`

보안 기본값:

- bcrypt 비밀번호 해시
- 5회 로그인 실패 시 5분 잠금
- 중복 로그인 방지 및 `forceLogin` 시 기존 세션 무효화
- HMAC-SHA256 서명 토큰
- 토큰 세션 ID와 DB `active_session_id` 일치 검증
- 플랫폼 관리자 전체 가족 조회, 일반 사용자는 소속 가족만 조회
- CORS 허용 출처 제한
- 보안 헤더 기본 적용

## Local Run

```powershell
$env:APP_SECURITY_TOKEN_SECRET='replace-with-at-least-48-characters-secret-value'
$env:DATABASE_URL='postgres://family_app:family_app_password@localhost:5432/family_platform?sslmode=disable'
..\.tools\go\bin\go.exe run .\cmd\api
```

## 다음 전환 순서

1. 가족 구성원 CRUD와 구성원별 권한 체크
2. 가계부 API
3. 캘린더/알림 API
4. 여행/육아/일기 API
5. 커뮤니티/댓글/첨부 API
6. 파일 업로드 API
7. Spring Boot 제거 및 Docker Compose API 이미지 교체
