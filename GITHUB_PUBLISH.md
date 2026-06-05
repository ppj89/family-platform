# GitHub Publish

The local repository is ready on branch `main`.

Remote is already configured:

```bash
git remote -v
```

Expected:

```text
origin  https://github.com/ppj89/family-platform.git
```

## Create Repository

Sign in to GitHub as `ppj89`, then create:

- Repository name: `family-platform`
- Visibility: private recommended
- Do not initialize with README, .gitignore, or license

## Push

```bash
git push -u origin main
```

If Git asks for authentication, sign in through Git Credential Manager or use a GitHub personal access token with repository write permission.

## Current Local Commits

```text
4f7a998 Prepare production deployment
170b0c6 Initial family platform app
```

