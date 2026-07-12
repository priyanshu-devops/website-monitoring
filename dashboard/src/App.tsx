import { ReactNode, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, BarChart3, Clock, ShieldCheck, ShieldOff, Sparkles } from 'lucide-react';
import { DashboardResponse, MonitoringRow } from './types';

const apiUrl = import.meta.env.VITE_API_URL || '/api/monitoring-data';

function statusClass(status: string) {
  if (status.toLowerCase().includes('pass') || status.toLowerCase().includes('online')) return 'status-pass';
  if (status.toLowerCase().includes('fail') || status.toLowerCase().includes('offline') || status.toLowerCase().includes('error')) return 'status-fail';
  return 'status-neutral';
}

function formatBadge(value: string) {
  return value || 'N/A';
}

function SummaryCard({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="summary-card">
      <div className="summary-card-icon">{icon}</div>
      <div>
        <p className="summary-card-label">{title}</p>
        <p className="summary-card-value">{value}</p>
      </div>
    </div>
  );
}

function DomainRow({ row }: { row: MonitoringRow }) {
  return (
    <tr>
      <td>{row.company}</td>
      <td>{row.domain}</td>
      <td className={statusClass(row.websiteStatus)}>{row.websiteStatus || 'Unknown'}</td>
      <td>{row.httpStatusCode || '-'}</td>
      <td>{row.responseTime || '-'}</td>
      <td>{row.sslDaysRemaining || '-'}</td>
      <td>{row.monitoringResult}</td>
      <td>{row.screenshotThumbnailURL ? <img src={row.screenshotThumbnailURL} alt={row.domain} className="thumbnail" /> : '—'}</td>
    </tr>
  );
}

function App() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    axios
      .get<DashboardResponse>(apiUrl)
      .then((response) => {
        setData(response.data);
        setError(null);
      })
      .catch((err) => {
        setError(err?.response?.data?.message || err.message || 'Failed to load dashboard data');
      })
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const summary = data?.summary;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Domain Monitoring Dashboard</p>
          <h1>Live status from Google Sheets</h1>
          <p className="subtitle">A DevOps-friendly dashboard for uptime, SSL, performance, and screenshots.</p>
        </div>
        <div className="header-tags">
          <span>{summary?.lastUpdated ? `Last updated: ${summary.lastUpdated}` : 'No data yet'}</span>
        </div>
      </header>

      {loading ? (
        <div className="status-box">Loading dashboard data…</div>
      ) : error ? (
        <div className="status-box status-fail">{error}</div>
      ) : (
        <>
          <section className="summary-grid">
            <SummaryCard title="Total domains" value={summary?.totalDomains ?? 0} icon={<BarChart3 />} />
            <SummaryCard title="PASS" value={summary?.passCount ?? 0} icon={<ShieldCheck />} />
            <SummaryCard title="FAIL" value={summary?.failCount ?? 0} icon={<ShieldOff />} />
            <SummaryCard title="Offline / Error" value={summary?.offlineCount ?? 0} icon={<AlertTriangle />} />
            <SummaryCard title="SSL warnings" value={summary?.warningCount ?? 0} icon={<Sparkles />} />
            <SummaryCard title="Last refresh" value={summary?.lastUpdated ?? '—'} icon={<Clock />} />
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Domain status table</h2>
              <p>Review the latest domain checks, SSL expiry, response latency, and screenshot previews.</p>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Domain</th>
                    <th>Status</th>
                    <th>HTTP</th>
                    <th>Latency</th>
                    <th>SSL days</th>
                    <th>Result</th>
                    <th>Screenshot</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8}>No rows found in the sheet.</td>
                    </tr>
                  ) : (
                    rows.map((row) => <DomainRow key={`${row.domain}-${row.lastCheckedDate}-${row.monitoringResult}`} row={row} />)
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default App;
