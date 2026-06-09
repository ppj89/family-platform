#!/usr/bin/env sh
set -eu

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8080/api}"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

TOKEN=""

json_value() {
  python3 -c 'import json,sys; data=json.load(sys.stdin); cur=data
for part in sys.argv[1].split("."):
    cur=cur[int(part)] if isinstance(cur, list) else cur[part]
print("" if cur is None else cur)' "$1"
}

api() {
  method="$1"
  path="$2"
  body="${3:-}"
  output="$tmp_dir/response.json"
  if [ -n "$body" ]; then
    code="$(curl -sS -o "$output" -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
      --data "$body" \
      "$API_BASE_URL$path")"
  else
    code="$(curl -sS -o "$output" -w "%{http_code}" -X "$method" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
      "$API_BASE_URL$path")"
  fi
  case "$code" in
    200|201|204) cat "$output" ;;
    *) echo "API failed: $method $path -> $code" >&2; cat "$output" >&2; exit 1 ;;
  esac
}

api_expect_status() {
  expected="$1"
  method="$2"
  path="$3"
  body="${4:-}"
  output="$tmp_dir/response-status.json"
  if [ -n "$body" ]; then
    code="$(curl -sS -o "$output" -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
      --data "$body" \
      "$API_BASE_URL$path")"
  else
    code="$(curl -sS -o "$output" -w "%{http_code}" -X "$method" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
      "$API_BASE_URL$path")"
  fi
  if [ "$code" != "$expected" ]; then
    echo "Expected $expected but got $code: $method $path" >&2
    cat "$output" >&2
    exit 1
  fi
}

email="api-test-$(date +%s)-$$@test.local"
password="Testpass123!"

health="$(api GET /health)"
status="$(printf '%s' "$health" | json_value status)"
[ "$status" = "UP" ]
oauth_providers="$(api GET /auth/oauth/providers)"
[ "$(printf '%s' "$oauth_providers" | json_value 0.provider)" = "naver" ]
[ "$(printf '%s' "$oauth_providers" | json_value 0.configured)" = "False" ]
api_expect_status 503 GET /auth/oauth/google/start
api_expect_status 503 GET /auth/oauth/naver/start
api_expect_status 503 GET /auth/oauth/kakao/start
api_expect_status 404 GET /auth/oauth/unknown/start

register_body="$(printf '{"email":"%s","nickname":"api-test","password":"%s"}' "$email" "$password")"
register_response="$(api POST /auth/register "$register_body")"
TOKEN="$(printf '%s' "$register_response" | json_value accessToken)"
user_id="$(printf '%s' "$register_response" | json_value userId)"
registered_token="$TOKEN"

api GET /auth/me >/dev/null
api_expect_status 409 POST /auth/login "$(printf '{"email":"%s","password":"%s"}' "$email" "$password")"
forced_response="$(api POST /auth/login "$(printf '{"email":"%s","password":"%s","forceLogin":true}' "$email" "$password")")"
TOKEN="$(printf '%s' "$forced_response" | json_value accessToken)"
forced_token="$TOKEN"
TOKEN="$registered_token"
api_expect_status 401 GET /auth/me
TOKEN="$forced_token"

families="$(api GET /families)"
family_id="$(printf '%s' "$families" | json_value 0.id)"
api GET "/families/$family_id/members" >/dev/null

group="$(api POST "/common-code-groups?familyId=$family_id" '{"menuKey":"ledger","code":"integration","name":"Integration","active":true}')"
group_id="$(printf '%s' "$group" | json_value id)"
code_item="$(api POST "/common-code-groups/$group_id/codes" '{"code":"food","name":"Food","sortOrder":1,"active":true}')"
code_id="$(printf '%s' "$code_item" | json_value id)"
api GET "/common-code-groups?familyId=$family_id&menuKey=ledger" >/dev/null
api GET "/common-code-groups/$group_id/codes" >/dev/null
api PUT "/common-code-groups/$group_id/codes/$code_id" '{"code":"food","name":"Food updated","sortOrder":2,"active":true}' >/dev/null

ledger="$(api POST "/ledger-entries?familyId=$family_id" '{"title":"Integration expense","entryType":"expense","category":"Food","paymentMethod":"Card","memberName":"Dad","amount":12000,"transactionDate":"2026-06-08","memo":"test"}')"
ledger_id="$(printf '%s' "$ledger" | json_value id)"
api GET "/ledger-entries?familyId=$family_id&startDate=2026-06-01&endDate=2026-06-30" >/dev/null
api GET "/ledger-entries/summary?familyId=$family_id&startDate=2026-06-01&endDate=2026-06-30" >/dev/null
api PUT "/ledger-entries/$ledger_id" '{"title":"Integration income","entryType":"income","category":"Salary","paymentMethod":"Bank","memberName":"Mom","amount":35000,"transactionDate":"2026-06-09","memo":"updated"}' >/dev/null

schedule="$(api POST "/schedules?familyId=$family_id" '{"title":"Integration schedule","calendarBasis":"solar","scheduleDate":"2026-06-08","scheduleTime":"09:00","category":"Schedule","memberName":"Family","repeatRule":"none","memo":"reminder"}')"
schedule_id="$(printf '%s' "$schedule" | json_value id)"
api GET "/schedules?familyId=$family_id&startDate=2026-06-01&endDate=2026-06-30" >/dev/null
api POST "/notifications/schedule-reminders?date=2026-06-08" >/dev/null
notification_list="$(api GET "/notifications?unreadOnly=true")"
notification_id="$(printf '%s' "$notification_list" | json_value 0.id)"
api PATCH "/notifications/$notification_id/read" >/dev/null
api PATCH /notifications/read-all >/dev/null

trip="$(api POST "/trips?familyId=$family_id" '{"title":"Integration trip","startDate":"2026-06-01","endDate":"2026-06-03","description":"test"}')"
trip_id="$(printf '%s' "$trip" | json_value id)"
record="$(api POST "/trips/$trip_id/records" '{"sortOrder":1,"title":"Airport","category":"Transport","amount":1000,"note":"arrival","location":"Jeju Airport","latitude":33.507,"longitude":126.493,"recordDate":"2026-06-01","recordTime":"10:00","mediaUrls":[]}')"
record_id="$(printf '%s' "$record" | json_value id)"
api GET "/trips?familyId=$family_id" >/dev/null
api GET "/trips/$trip_id/records" >/dev/null
api PUT "/travel-records/$record_id" '{"sortOrder":2,"title":"Beach","category":"Tour","amount":0,"note":"updated","location":"Hyeopjae","latitude":33.394,"longitude":126.239,"recordDate":"2026-06-02","recordTime":"11:00","mediaUrls":[]}' >/dev/null

baby="$(api POST "/babies?familyId=$family_id" '{"name":"Baby","gender":"girl","birthDate":"2025-01-01","memo":"test","photoUrl":null,"latestHeightCm":80.5,"latestWeightKg":10.2}')"
baby_id="$(printf '%s' "$baby" | json_value id)"
baby_record="$(api POST "/babies/$baby_id/records" '{"recordType":"growth","recordDate":"2026-06-08","recordTime":"10:30","amountMl":null,"heightCm":81.1,"weightKg":10.5,"memo":"growth","mediaUrls":[]}')"
baby_record_id="$(printf '%s' "$baby_record" | json_value id)"
api GET "/babies?familyId=$family_id" >/dev/null
api GET "/babies/$baby_id/records?startDate=2026-06-01&endDate=2026-06-30" >/dev/null
api PUT "/baby-records/$baby_record_id" '{"recordType":"feeding","recordDate":"2026-06-08","recordTime":"11:00","amountMl":120,"heightCm":null,"weightKg":null,"memo":"updated","mediaUrls":[]}' >/dev/null

diary="$(api POST "/diaries?familyId=$family_id" '{"title":"Integration diary","body":"body","diaryDate":"2026-06-08","weather":"sunny","mood":"good","minTemperature":18,"maxTemperature":25,"mediaUrls":[]}')"
diary_id="$(printf '%s' "$diary" | json_value id)"
api GET "/diaries?familyId=$family_id&startDate=2026-06-01&endDate=2026-06-30" >/dev/null
api PUT "/diaries/$diary_id" '{"title":"Integration diary updated","body":"body updated","diaryDate":"2026-06-09","weather":"cloudy","mood":"normal","minTemperature":17,"maxTemperature":24,"mediaUrls":[]}' >/dev/null

png="$tmp_dir/test.png"
python3 - <<'PY' > "$png"
import base64, sys
sys.stdout.buffer.write(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="))
PY
media_response="$(curl -sS -H "Authorization: Bearer $TOKEN" -F "file=@$png;type=image/png" "$API_BASE_URL/media?familyId=$family_id")"
printf '%s' "$media_response" | json_value url >/dev/null
txt="$tmp_dir/test.txt"
printf 'not image' > "$txt"
bad_media_code="$(curl -sS -o "$tmp_dir/bad-media.json" -w "%{http_code}" -H "Authorization: Bearer $TOKEN" -F "file=@$txt;type=text/plain" "$API_BASE_URL/media?familyId=$family_id")"
[ "$bad_media_code" = "415" ]

post="$(api POST /community/posts '{"boardType":"free","title":"Integration post","body":"body","mediaUrls":[]}' )"
post_id="$(printf '%s' "$post" | json_value id)"
comment="$(api POST "/community/posts/$post_id/comments" '{"body":"comment"}')"
comment_id="$(printf '%s' "$comment" | json_value id)"
api GET "/community/posts?boardType=free" >/dev/null
api GET "/community/posts/$post_id" >/dev/null
api PUT "/community/comments/$comment_id" '{"body":"comment updated"}' >/dev/null
api DELETE "/community/comments/$comment_id" >/dev/null
api DELETE "/community/posts/$post_id" >/dev/null

api DELETE "/baby-records/$baby_record_id" >/dev/null
api DELETE "/babies/$baby_id" >/dev/null
api DELETE "/diaries/$diary_id" >/dev/null
api DELETE "/travel-records/$record_id" >/dev/null
api DELETE "/trips/$trip_id" >/dev/null
api DELETE "/schedules/$schedule_id" >/dev/null
api DELETE "/ledger-entries/$ledger_id" >/dev/null
api DELETE "/common-code-groups/$group_id/codes/$code_id" >/dev/null
api DELETE "/common-code-groups/$group_id" >/dev/null
api POST /auth/logout >/dev/null
api_expect_status 401 GET /auth/me
relogin_response="$(api POST /auth/login "$(printf '{"email":"%s","password":"%s"}' "$email" "$password")")"
TOKEN="$(printf '%s' "$relogin_response" | json_value accessToken)"
api GET /auth/me >/dev/null
api POST /auth/logout >/dev/null

echo "Go API integration test passed for user $user_id family $family_id"
