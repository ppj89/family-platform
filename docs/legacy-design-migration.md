# Legacy Design Migration Checklist

When a React screen is being matched to a legacy screen, inspect the full legacy screen and source before changing React code. Do not wait for the user to point out each mismatch one by one.

## Required Source Check

- Check the legacy CSS rules for the same screen and component.
- Check the legacy JS behavior for data rendering, popup behavior, selected states, and crowded-data handling.
- Check existing React component files and screen CSS separately.
- Prefer screen-specific React component/CSS changes over legacy patch changes.

## Required Visual Check

Compare the full screen, not only the reported element:

- Page title, eyebrow, section order, and visible spacing.
- Card width, height, padding, border, radius, background, and shadow.
- Button width, height, padding, radius, font size, font weight, icon, selected state, and disabled state.
- Input/select/datepicker/textarea height, background, border, label, required mark, placeholder, and selected value style.
- Typography for every visible text level: title, label, value, caption, helper, empty state, chip, and count.
- Icons: use the same legacy icon shape/source when the user asks for legacy match.
- Responsive layout on PC, tablet, mobile, and app WebView.

## Calendar Month Checklist

For the calendar month screen, verify each part separately:

- Month header row height and column widths.
- Previous/next month buttons.
- Month datepicker trigger text size, weight, and height.
- View tabs height, active tab, radius, shadow, font size, and font weight.
- Weekday row height, padding, gap, font size, and font weight.
- Day cell fixed height, width, gap, padding, radius, border, background, overflow, and selected border.
- Current-month weekday, Sunday/holiday, Saturday, and outside-month colors.
- Previous/next month holidays remain holiday-colored when legacy does so.
- Lunar text font size, weight, color, wrapping, and line-height.
- Holiday text font size, weight, color, truncation, and line-height.
- Schedule chip display rule: first item only, then `+N` for remaining items when legacy does so.
- Schedule chip font size, weight, padding, radius, color, and overflow.
- `+N` count size, weight, line-height, position, color, and height.
- Month schedule list below the grid, including empty state and crowded data.

## Required Verification

- Test with realistic data and crowded data, not only an empty screen.
- Use data that can expose height changes, wrapping, overflow, and count display.
- Verify rendered DOM/computed styles or screenshots after the change.
- After production deployment, repeat the same visual/user-path verification on the deployed site.
