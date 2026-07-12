import { google, sheets_v4 } from 'googleapis';
import { MonitoringRow } from './types.js';

const DEFAULT_SHEET_NAME = 'Sheet1';

export class DashboardSheetsService {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly sheetName: string;

  constructor(credentials: Record<string, unknown>, spreadsheetId: string, sheetName?: string) {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = spreadsheetId;
    this.sheetName = sheetName || DEFAULT_SHEET_NAME;
  }

  private parseRow(row: string[]): MonitoringRow {
    const cells = [...row];

    while (cells.length < 32) {
      cells.push('');
    }

    return {
      company: cells[0] ?? '',
      domain: cells[1] ?? '',
      websiteStatus: cells[2] ?? '',
      httpStatusCode: cells[3] ?? '',
      responseTime: cells[4] ?? '',
      sslExpiryDate: cells[5] ?? '',
      sslDaysRemaining: cells[6] ?? '',
      domainExpiryDate: cells[7] ?? '',
      websiteTitle: cells[8] ?? '',
      serverIP: cells[9] ?? '',
      hostingProvider: cells[10] ?? '',
      dnsStatus: cells[11] ?? '',
      nameservers: cells[12] ?? '',
      httpsEnabled: cells[13] ?? '',
      redirectURL: cells[14] ?? '',
      lastCheckedDate: cells[15] ?? '',
      lastCheckedTime: cells[16] ?? '',
      screenshotURL: cells[17] ?? '',
      screenshotThumbnailURL: cells[18] ?? '',
      websiteScreenshot: cells[19] ?? '',
      errorMessage: cells[20] ?? '',
      pageSize: cells[21] ?? '',
      wordpressDetection: cells[22] ?? '',
      cloudflareDetection: cells[23] ?? '',
      cdnDetection: cells[24] ?? '',
      technologyStack: cells[25] ?? '',
      metaTitle: cells[26] ?? '',
      metaDescription: cells[27] ?? '',
      sslIssuer: cells[28] ?? '',
      sslVersion: cells[29] ?? '',
      sslGrade: cells[30] ?? '',
      monitoringResult: cells[31] ?? '',
    };
  }

  async loadAllRows(): Promise<MonitoringRow[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A:AF`,
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = response.data.values ?? [];
    return rows.slice(1).map((row) => this.parseRow(row as string[])).filter((entry) => entry.domain.trim().length > 0);
  }
}
