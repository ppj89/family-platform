# Source Structure

The source tree is organized by real ownership.

## Main Areas

- `app`: app bootstrap, routing, shell, global providers.
- `features`: menu-specific code. Each menu owns its own page, API, hook, utility, type, component, and legacy compatibility code.
- `shared`: code used by more than one menu.
- `legacy-patch-manifest.mjs`: ordered assembly list for the generated `public/legacy-patch.js` file.

## Feature Areas

Each menu lives under `src/features/<menu>`.

- `components`: components used only by that menu.
- `pages`: list, detail, create, and edit page units for that menu.
- `api`: menu API calls and DTO mapping.
- `hooks`: menu-specific hooks.
- `utils`: menu-specific calculations and formatting.
- `types`: menu-specific types.
- `legacy-patch`: current production compatibility code for that menu.
- `index.js`: public entry point for that menu and the menu's legacy patch assembly map.

Do not edit another menu folder when fixing one menu unless the change is genuinely shared.

## Shared Areas

Shared code lives under `src/shared`.

- `components`: common Button, Input, Select, DatePicker, Modal, Panel, List, Chip.
- `api`: common API client, auth header, error parser.
- `hooks`: common hooks.
- `utils`: date, time, number, text, and permission helpers.
- `types`: common types.
- `styles`: common classes, tokens, and layout rules.
- `legacy-patch`: current production compatibility code shared by legacy-patch menus.

Do not copy shared UI/API/hook/util code into each menu.

## Legacy Patch Flow

The app still uses the generated `public/legacy-patch.js` file in production.

Source files are no longer kept in `src/legacy-patch-modules`.

- Menu-specific patch source: `src/features/<menu>/legacy-patch`.
- Shared patch source: `src/shared/legacy-patch`.
- Assembly order: `src/legacy-patch-manifest.mjs`.
- Generated output: `public/legacy-patch.js`.

When changing legacy patch source, edit the feature/shared source file first and run:

```bash
npm run build:legacy-patch
npm run check:legacy-patch
```

Then run the normal verification:

```bash
npm run lint
npm run build
```
