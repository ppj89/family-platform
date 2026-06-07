# OIDC 로그인, 중복 로그인, 인증 처리 가이드

회사 프로젝트에서 OIDC 로그인을 바꿀 때는 `로그인 성공` 자체보다 `세션을 어떻게 발급하고 검증할지`가 핵심입니다.

## 권장 흐름

1. 사용자가 OIDC Provider 로그인 페이지로 이동합니다.
2. 콜백에서 `code`를 받습니다.
3. 백엔드가 `code`를 Provider에 전달해 `id_token`과 `access_token`을 받습니다.
4. 백엔드가 `id_token`을 검증합니다.
5. `issuer`, `audience`, `exp`, `nonce`, `sub`를 확인합니다.
6. 내부 사용자 계정을 `provider + sub` 기준으로 찾거나 생성합니다.
7. 내부 서비스용 세션 ID를 새로 발급합니다.
8. DB에 `active_session_id`를 저장합니다.
9. 프론트에는 내부 서비스 토큰 또는 보안 쿠키를 내려줍니다.

## 중복 로그인 처리

DB 사용자 테이블에 아래 컬럼을 둡니다.

```sql
active_session_id varchar(255),
session_issued_at timestamp with time zone,
last_login_at timestamp with time zone
```

로그인 시:

```text
if active_session_id exists and forceLogin is false:
  409 Conflict 반환
  message = "현재 로그인이 되어있습니다. 로그인을 하시겠습니까?"

if forceLogin is true:
  active_session_id를 새 값으로 교체
  기존 토큰은 다음 API 요청부터 무효 처리
```

API 인증 시:

```text
1. 토큰 서명 검증
2. 토큰 만료 검증
3. 토큰 안의 session_id 추출
4. DB의 active_session_id와 비교
5. 다르면 401 Unauthorized
```

이 방식이면 별도 Redis 없이도 단일 서버에서는 중복 로그인 방지가 됩니다.

## Go 예시

```go
func requireActiveSession(ctx context.Context, db *pgxpool.Pool, userID int64, sessionID string) bool {
	var activeSessionID sql.NullString
	err := db.QueryRow(ctx, "select active_session_id from users where id = $1", userID).Scan(&activeSessionID)
	return err == nil && activeSessionID.Valid && activeSessionID.String == sessionID
}
```

## Spring Boot 예시

```java
boolean isActiveSession(AuthenticatedUser user) {
  return users.findById(user.id())
      .map(appUser -> user.sessionId().equals(appUser.getActiveSessionId()))
      .orElse(false);
}
```

## 로그인 실패 잠금

권장 정책:

- 실패 횟수는 사용자 단위로 저장
- 5회 실패 시 5분 잠금
- 잠금 중에는 비밀번호 비교도 하지 않음
- 성공 로그인 시 실패 횟수와 잠금 시간 초기화

```sql
failed_login_attempts integer default 0,
locked_until timestamp with time zone
```

## OIDC 검증 체크리스트

- `iss`가 기대한 Provider 주소와 같은지
- `aud`가 우리 Client ID와 같은지
- `exp`가 지나지 않았는지
- `nonce`가 로그인 시작 시 저장한 값과 같은지
- `sub`를 사용자 고유키로 쓰는지
- 이메일은 변경될 수 있으므로 고유키로 쓰지 않는지
- 콜백 URL은 HTTPS인지
- 프론트에 OIDC Provider 토큰을 그대로 오래 보관하지 않는지

## 실무 결론

OIDC는 외부 로그인 인증이고, 우리 서비스 권한은 내부 세션으로 관리하는 게 안전합니다.

즉:

```text
OIDC Provider = 사용자가 누구인지 확인
우리 백엔드 = 이 사용자가 우리 서비스에서 무엇을 할 수 있는지 결정
```

중복 로그인, 권한, 가족별 데이터 차단은 OIDC Provider가 아니라 우리 백엔드에서 처리해야 합니다.
