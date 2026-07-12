import { DashboardSheetsService } from '../src/sheets-service.js';
import { MonitoringRow } from '../src/types.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method not allowed' });
    return;
  }

  const spreadsheetId = process.env.SPREADSHEET_ID;
  const rawCreds = process.env.GOOGLE_CREDENTIALS;

  if (!spreadsheetId || !rawCreds) {
    res.status(500).json({ message: 'Missing SPREADSHEET_ID or GOOGLE_CREDENTIALS.' });
    return;
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(rawCreds);
  } catch (error) {
    res.status(500).json({ message: 'Invalid GOOGLE_CREDENTIALS JSON.' });
    return;
  }

  try {
    const sheetsService = new DashboardSheetsService(credentials, spreadsheetId, process.env.SHEET_NAME ?? 'Sheet1');
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

    res.status(200).json({
      summary: {
        ...summary,
        lastUpdated: new Date().toISOString(),
      },
      rows,
    });
  } catch (error) {
    console.error('Vercel API error:', error);
    res.status(502).json({ message: 'Unable to load monitoring data from Google Sheets.' });
  }
}
