# Responsive QA Checklist

All UI changes must be checked before they are committed or deployed. Do not treat a screen as done until it works at the target web and app sizes below.

## Required Viewports

- PC: `1440 x 900`
- Tablet landscape: `1280 x 800`
- Tablet portrait: `820 x 1180`
- Mobile: `390 x 844`
- App webview baseline: Android/Capacitor-sized mobile viewport, `390 x 844`

## Required Screens

Check the changed screen and any shared layout it touches. If common form, calendar, select, modal, list, sidebar, or action-button CSS changes, also check:

- Login
- Home
- Calendar
- Ledger
- Travel
- Baby care
- Diary
- Family group
- Restaurant
- Community
- Admin

## Pass Criteria

- No horizontal overflow unless the component is intentionally scrollable.
- Main content and right-side form panels do not overlap.
- Mobile and tablet views do not hide required buttons such as save, delete, or close.
- Inputs, selects, datepickers, textareas, file buttons, confirm dialogs, and toast messages use the shared visual style.
- Datepicker, select dropdown, modal, toast, and confirm layers appear above maps, panels, and scroll containers.
- Text fits inside buttons, chips, list rows, calendar cells, and cards.
- Empty states do not show hardcoded sample data before API data loads.
- API loading states never block the screen after the request finishes or fails.
- Click actions still work after moving between menus.

## Required Verification

For code changes, run at least:

```powershell
npm run build
npm run lint
git diff --check
```

For visual changes, open the changed screen at each required viewport and verify the pass criteria above before deployment.
