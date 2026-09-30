import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env.TWITOK_API_URL ?? "http://localhost:4000";

type Money = Record<string, number>;
type FinanceData = {
  period: { from: string; to: string };
  revenue: Money;
  withdrawals: Record<string, { count: number; amountUsd: number }>;
  liabilities: Money;
  daily: Array<{
    _id: string;
    coinSalesGrossUsd: number;
    giftNetProceedsUsd: number;
    platformAllocationUsd: number;
    refundsUsd: number;
  }>;
};

function usd(value: unknown) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
}

async function getFinance(from?: string, to?: string): Promise<FinanceData | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("twitok_owner_session")?.value;
  if (!token) return null;

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const response = await fetch(
    `${API_URL}/api/v1/admin/finance/summary?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!response.ok) return null;
  return response.json();
}

export default async function FinanceCommandCenter({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range = "30" } = await searchParams;
  const days = [7, 30, 90].includes(Number(range)) ? Number(range) : 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const data = await getFinance(from.toISOString(), to.toISOString());
  if (!data) redirect("/admin/login");

  const r = data.revenue;
  const w = data.withdrawals;
  const maxDaily = Math.max(
    1,
    ...data.daily.map(day => Math.max(Number(day.coinSalesGrossUsd ?? 0), Number(day.giftNetProceedsUsd ?? 0)))
  );

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">T</div><div><strong>TwiTok</strong><span>OWNER CONTROL</span></div></div>
        <nav>
          <Link href="/admin">Command Center</Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/content">Content</Link>
          <Link href="/admin/safety">Safety & Moderation</Link>
          <Link href="/admin/youth">Youth Safety</Link>
          <Link href="/admin/live">LIVE</Link>
          <Link href="/admin/creators">Creators</Link>
          <Link href="/admin/communities">Communities</Link>
          <Link href="/admin/marketplace">Marketplace</Link>
          <Link href="/admin/analytics">Analytics</Link>
          <Link className="active" href="/admin/money">Finance</Link>
          <Link href="/admin/settings">Platform Settings</Link>
          <Link href="/admin/security">Security & Audit</Link>
        </nav>
        <div className="sidebar-footer"><div className="admin-badge">OWNER • PRIVILEGED</div><small>Financial data is owner-only.</small></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">TWITOK CREATOR ECONOMY</p>
            <h1>Finance Command Center</h1>
            <p className="muted">Real-time operational view of Coin sales, Gifts, creator allocations, refunds and withdrawals.</p>
          </div>
          <div className="finance-actions">
            {[7, 30, 90].map(daysOption => (
              <Link key={daysOption} className={daysOption === days ? "range active-range" : "range"} href={`/admin/money?range=${daysOption}`}>
                {daysOption}D
              </Link>
            ))}
            <Link className="logout" href="/admin">Command center</Link>
          </div>
        </header>

        <div className="notice">
          <strong>ACCOUNTING VIEW.</strong> Coin sales are shown separately from realized Gift/platform allocations so deferred proceeds are not double-counted.
        </div>

        <section className="stats finance-stats">
          <article className="stat accent-stat"><span>Coin sales</span><strong>{usd(r.coinSalesGrossUsd)}</strong><small>Gross customer payments</small></article>
          <article className="stat"><span>Net proceeds</span><strong>{usd(r.coinNetProceedsUsd)}</strong><small>After provider costs</small></article>
          <article className="stat"><span>Gift volume</span><strong>{usd(r.giftNetProceedsUsd)}</strong><small>Coins converted into Gifts</small></article>
          <article className="stat"><span>Creator allocation</span><strong>{usd(r.creatorAllocationUsd)}</strong><small>30% Gift allocation</small></article>
          <article className="stat"><span>Platform allocation</span><strong>{usd(r.platformAllocationUsd)}</strong><small>70% Gift allocation</small></article>
          <article className="stat"><span>Platform contribution</span><strong>{usd(r.estimatedPlatformContributionUsd)}</strong><small>Allocation less refunds & provider costs</small></article>
        </section>

        <section className="grid finance-grid">
          <article className="panel">
            <div className="panel-head"><div><p className="eyebrow">CASH FLOW</p><h2>Provider & refund costs</h2></div></div>
            <div className="metric-row"><span>Provider fees</span><strong>{usd(r.providerFeesUsd)}</strong></div>
            <div className="metric-row"><span>Provider taxes</span><strong>{usd(r.providerTaxesUsd)}</strong></div>
            <div className="metric-row"><span>Customer refunds</span><strong>{usd(r.refundsUsd)}</strong></div>
            <div className="metric-row"><span>Platform refunds</span><strong>{usd(r.platformRefundUsd)}</strong></div>
            <div className="metric-row"><span>Deferred proceeds</span><strong>{usd(r.deferredPlatformUsd)}</strong></div>
          </article>

          <article className="panel">
            <div className="panel-head"><div><p className="eyebrow">CREATOR PAYOUTS</p><h2>Withdrawal operations</h2></div></div>
            {["PENDING","PROCESSING","PAID","FAILED","REVERSED"].map(status => (
              <div className="metric-row" key={status}>
                <span>{status}</span>
                <strong>{w[status] ? `${w[status].count} · ${usd(w[status].amountUsd)}` : "0 · $0.00"}</strong>
              </div>
            ))}
          </article>

          <article className="panel">
            <div className="panel-head"><div><p className="eyebrow">LIABILITIES</p><h2>Current wallet exposure</h2></div></div>
            <div className="metric-row"><span>Creator refund liability</span><strong>{usd(data.liabilities.creatorRefundLiabilityUsd)}</strong></div>
            <div className="metric-row"><span>Buyer refund liability</span><strong>{usd(data.liabilities.buyerRefundLiabilityUsd)}</strong></div>
            <div className="metric-row"><span>Creator wallet cash</span><strong>{usd(data.liabilities.cashBalanceUsd)}</strong></div>
            <div className="metric-row"><span>Creator diamonds</span><strong>{Number(data.liabilities.diamondBalance ?? 0).toLocaleString()}</strong></div>
          </article>

          <article className="panel">
            <div className="panel-head"><div><p className="eyebrow">SETTLEMENT</p><h2>Creator reconciliation</h2></div></div>
            <div className="metric-row"><span>Gross creator allocation</span><strong>{usd(r.creatorAllocationUsd)}</strong></div>
            <div className="metric-row"><span>Cash credited</span><strong>{usd(r.creatorCashCreditUsd)}</strong></div>
            <div className="metric-row"><span>Liability offsets</span><strong>{usd(r.creatorLiabilityOffsetUsd)}</strong></div>
            <div className="metric-row"><span>Refunds recovered</span><strong>{usd(r.creatorRecoveredUsd)}</strong></div>
            <div className="metric-row"><span>Refunds still owed</span><strong>{usd(r.creatorRefundLiabilityUsd)}</strong></div>
          </article>

          <article className="panel wide">
            <div className="panel-head">
              <div><p className="eyebrow">DAILY TREND</p><h2>Monetization activity</h2></div>
              <span className="status-dot">{dateLabel(data.period.from)} – {dateLabel(data.period.to)}</span>
            </div>
            <div className="trend-list">
              {data.daily.length === 0 && <p className="muted">No financial events in this period.</p>}
              {data.daily.slice(-31).map(day => {
                const sales = Number(day.coinSalesGrossUsd ?? 0);
                const gifts = Number(day.giftNetProceedsUsd ?? 0);
                return (
                  <div className="trend-row" key={day._id}>
                    <span>{dateLabel(day._id)}</span>
                    <div className="trend-track"><i style={{ width: `${Math.max(2, Math.round((sales / maxDaily) * 100))}%` }} /></div>
                    <strong>{usd(sales)}</strong>
                    <small>Gifts {usd(gifts)}</small>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel wide">
            <div className="panel-head"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Latest financial events</h2></div><span className="status-dot">Immutable-by-compensation</span></div>
            <FinanceLedger />
          </article>
        </section>
      </section>
    </main>
  );
}

async function FinanceLedger() {
  const cookieStore = await cookies();
  const token = cookieStore.get("twitok_owner_session")?.value;
  if (!token) return null;
  const response = await fetch(`${API_URL}/api/v1/admin/finance/ledger?limit=30`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) return <p className="muted">Ledger unavailable.</p>;
  const data = await response.json();

  return (
    <div className="ledger-wrap">
      <div className="ledger">
        <div className="ledger-head"><span>Event</span><span>Provider</span><span>Amount</span><span>Status</span><span>Time</span></div>
        {data.rows.map((row: Record<string, unknown>) => {
          const amount = row.eventType === "COIN_PURCHASE"
            ? Number(row.grossUsd ?? 0)
            : row.eventType === "REFUND"
              ? Number(row.netRefundUsd ?? 0)
              : Number(row.netProceedsUsd ?? 0);
          return (
            <div className="ledger-row" key={String(row.transactionId)}>
              <span>{String(row.eventType ?? "EVENT").replaceAll("_", " ")}</span>
              <span>{String(row.provider ?? "—")}</span>
              <strong>{usd(amount)}</strong>
              <span>{String(row.status ?? "—")}</span>
              <small>{new Date(String(row.createdAt)).toLocaleString()}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
