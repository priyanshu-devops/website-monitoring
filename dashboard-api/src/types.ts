export interface MonitoringRow {
  company: string;
  domain: string;
  websiteStatus: string;
  httpStatusCode: string;
  responseTime: string;
  sslExpiryDate: string;
  sslDaysRemaining: string;
  domainExpiryDate: string;
  websiteTitle: string;
  serverIP: string;
  hostingProvider: string;
  dnsStatus: string;
  nameservers: string;
  httpsEnabled: string;
  redirectURL: string;
  lastCheckedDate: string;
  lastCheckedTime: string;
  screenshotURL: string;
  screenshotThumbnailURL: string;
  websiteScreenshot: string;
  errorMessage: string;
  pageSize: string;
  wordpressDetection: string;
  cloudflareDetection: string;
  cdnDetection: string;
  technologyStack: string;
  metaTitle: string;
  metaDescription: string;
  sslIssuer: string;
  sslVersion: string;
  sslGrade: string;
  monitoringResult: string;
}

export interface DashboardResponse {
  summary: {
    totalDomains: number;
    passCount: number;
    failCount: number;
    offlineCount: number;
    warningCount: number;
    lastUpdated: string;
  };
  rows: MonitoringRow[];
}
