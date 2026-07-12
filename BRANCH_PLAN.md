# Branch-ready commit plan

This file describes the exact branch and commit flow for adding the dashboard UI and API.

## Recommended branch

Create a dedicated branch for the new dashboard work:

```bash
git checkout main
git pull origin main
git checkout -b dashboard-ui
```

## Commit the new dashboard artifacts

1. Add the frontend and API folders:

```bash
git add dashboard dashboard-api .github/workflows/dashboard.yml README.md
```

2. Commit with a clear message:

```bash
git commit -m "feat: add dashboard UI and dashboard API support"
```

3. Push the branch:

```bash
git push --set-upstream origin dashboard-ui
```

## Review and merge

- Create a pull request from `dashboard-ui` into `main`
- Verify the new `Dashboard CI` workflow passes
- Confirm the dashboard app builds successfully
- Confirm the API package builds successfully
- Merge when ready

## Notes

- Leave `main` as the stable monitoring code branch
- Continue feature development in `dashboard-ui` for UI and API improvements
- If you want a public dashboard later, deploy only the `dashboard/` build and keep the API secured behind environment variables
