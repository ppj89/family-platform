# Family Platform Go API

Family Platform 운영용 Go 백엔드입니다.

현재 전환된 API:

- `/api/health`
- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/me`
- `/api/families`
- `/api/families/{familyId}/members`
- `/api/ledger-entries`
- `/api/ledger-entries/summary`
- `/api/schedules`
- `/api/common-code-groups`
- `/api/common-code-groups/{groupId}/codes`
- `/api/trips`
- `/api/trips/{tripId}/records`
- `/api/travel-records/{recordId}`
- `/api/babies`
- `/api/babies/{babyId}/records`
- `/api/baby-records/{recordId}`
- `/api/diaries`
- `/api/community/posts`
- `/api/community/comments/{commentId}`
- `/api/media`
- `/api/media/files/{fileName}`
- `/api/notifications`

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

1. Go API 통합 테스트 보강
2. 기존 Spring Boot 백엔드 제거 여부 결정
3. 실제 서버 배포와 도메인/HTTPS 연결
4. SSO OAuth/OIDC Provider 연동
