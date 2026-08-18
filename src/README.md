# Source Structure

The source tree is organized by real ownership.

## Main Areas

- `app`: app bootstrap, routing, shell, global providers.
- `features`: menu-specific code. Each menu owns its own page, API, hook, utility, type, and component code.
- `shared`: code used by more than one menu.

## Feature Areas

Each menu lives under `src/features/<menu>`.

- `components`: components used only by that menu.
- `pages`: list, detail, create, and edit page units for that menu.
- `api`: menu API calls and DTO mapping.
- `hooks`: menu-specific hooks.
- `utils`: menu-specific calculations and formatting.
- `types`: menu-specific types.

Do not edit another menu folder when fixing one menu unless the change is genuinely shared.

## Shared Areas

Shared code lives under `src/shared`.

- `components`: common Button, Input, Select, DatePicker, Modal, Panel, List, Chip.
- `api`: common API client, auth header, error parser.
- `hooks`: common hooks.
- `utils`: date, time, number, text, and permission helpers.
- `types`: common types.
- `styles`: common classes, tokens, and layout rules.

Do not copy shared UI/API/hook/util code into each menu.

## Legacy Patch Flow (retired)

React migration is complete: `src/App.tsx` renders every menu's `pages` component directly, and production no longer loads a generated legacy bundle. The former legacy-patch source (`src/features/*/legacy-patch`, `src/shared/legacy-patch`, `src/legacy-patch-manifest.mjs`, `scripts/build-legacy-patch.mjs`, `public/legacy-patch.js`, `public/legacy/`) was moved to `_deprecated_candidates/` on 2026-08-18 for final review before deletion. Do not create new legacy-patch source.

Normal verification:

```bash
npm run lint
npm run build
```
