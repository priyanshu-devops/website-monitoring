# Dashboard API

This folder contains a small Express API to read monitoring rows from Google Sheets.

## Install

```bash
cd dashboard-api
npm install
```

## Configuration

Copy `.env.example` to `.env` and set:

- `SPREADSHEET_ID`
- `SHEET_NAME`
- `GOOGLE_CREDENTIALS`
- `PORT`

The `GOOGLE_CREDENTIALS` value should be a JSON string for a Google service account.

## Run locally

```bash
npm run dev
```

## Build

```bash
npm run build
```
