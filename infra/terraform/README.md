# Terraform — GitHub 저장소 설정

이 디렉터리는 `ppj89/family-platform` 저장소의 설정을 코드로 관리한다.

| 리소스 | 내용 |
|---|---|
| `github_repository.app` | 저장소 설정(머지 후 브랜치 삭제, 취약점 알림, 시크릿 스캔). `prevent_destroy`로 삭제 차단 |
| `github_repository_dependabot_security_updates.app` | Dependabot 보안 업데이트 PR 자동 생성 |
| `github_branch_protection.main` | main 머지 전 CI 통과 필수. 관리자(소유자)는 직접 push 가능 |

VPS(netcup)와 DNS(deSEC `dedyn.io`)는 쓸 만한 Terraform provider가 없어서 관리 대상에서 뺐다.
서버 내부 구성은 `scripts/`의 셸 스크립트가 담당한다.

## 상태(state) 저장소

상태 파일은 기존 Cloudflare R2 버킷의 `terraform/github.tfstate`에 저장한다(S3 호환 backend, 잠금 파일 사용).
접속 정보는 git에 올라가지 않는 `backend.hcl`에 둔다. `backend.hcl.example`을 복사해서 서버 `.env.production`의 `APP_MEDIA_S3_*` 값을 채운다.

## 사용법 (PowerShell)

```powershell
cd infra/terraform
terraform init '-backend-config=backend.hcl'
$env:GITHUB_TOKEN = (gh auth token)
terraform plan
terraform apply
```

PowerShell 5.1에서는 `-backend-config=backend.hcl`처럼 `.`이 들어간 인수를 따옴표로 감싸야 한다.

CI의 `Terraform validate` job이 PR마다 `terraform fmt -check`와 `terraform validate`를 실행한다. 이 job은 자격 증명 없이 돈다.
`plan`과 `apply`는 로컬에서 실행한다.
