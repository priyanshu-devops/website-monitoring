# Domain Monitor — Logs

This directory stores daily monitoring logs.

| File | Description |
|------|-------------|
| `monitor-YYYY-MM-DD.log` | Full run log with timestamps |
| `failed-domains-YYYY-MM-DD.log` | Pipe-delimited list of failed domains |

Log files older than 30 days can be safely deleted.
GitHub Actions also uploads logs as workflow artifacts (retained 30 days).
