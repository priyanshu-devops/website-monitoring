# Domain Monitor — Screenshots

This directory stores Playwright screenshots for all monitored domains.

- `{domain}.png` — Full 1366×768 viewport screenshot
- `{domain}_thumb.png` — Compressed 400×300 thumbnail

Screenshots are committed automatically by the GitHub Actions workflow
after each monitoring run. Google Sheets uses the raw GitHub URLs
via `=IMAGE("...")` formulas in column T.
