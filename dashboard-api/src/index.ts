import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { DashboardSheetsService } from './sheets-service.js';
import { DashboardResponse, MonitoringRow } from './types.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);
const spreadsheetId = process.env.SPREADSHEET_ID;
const sheetName = process.env.SHEET_NAME ?? 'Sheet1';
const rawCreds = process.env.GOOGLE_CREDENTIALS;

if (!spreadsheetId || !rawCreds) {
  console.error('Missing required environment variables: SPREADSHEET_ID and GOOGLE_CREDENTIALS.');
  process.exit(1);
}

let credentials: Record<string, unknown>;
try {
  credentials = JSON.parse(rawCreds);
} catch (err) {
  console.error('Invalid GOOGLE_CREDENTIALS JSON:', err);
  process.exit(1);
}

const sheetsService = new DashboardSheetsService(credentials, spreadsheetId, sheetName);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/monitoring-data', async (_req, res) => {
  try {
    const rows: MonitoringRow[] = await sheetsService.loadAllRows();
    const summary = rows.reduce(
      (acc, row) => {
        acc.totalDomains += 1;
        if (row.monitoringResult.toLowerCase() === 'pass') acc.passCount += 1;
        else acc.failCount += 1;
        if (row.websiteStatus.toLowerCase().includes('offline') || row.websiteStatus.toLowerCase().includes('error')) acc.offlineCount += 1;
        const sslDays = Number(row.sslDaysRemaining);
        if (row.sslDaysRemaining && !Number.isNaN(sslDays) && sslDays >= 0 && sslDays <= 14) acc.warningCount += 1;
        return acc;
      },
      { totalDomains: 0, passCount: 0, failCount: 0, offlineCount: 0, warningCount: 0 },
    );

    const response: DashboardResponse = {
      summary: {
        ...summary,
        lastUpdated: new Date().toISOString(),
      },
      rows,
    };

    res.json(response);
  } catch (error) {
    console.error('Failed to fetch monitoring data:', error);
    res.status(502).json({ message: 'Unable to load monitoring data from Google Sheets.' });
  }
});

app.listen(port, () => {
  console.log(`Dashboard API listening on http://localhost:${port}`);
});
