"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CoinPackage = { sku: string; coins: number; priceUsd?: number; priceGhs?: number };
type Catalog = {
  coinPackages?: CoinPackage[];
  featuredCoinPackages?: CoinPackage[];
  additionalCoinPackages?: CoinPackage[];
  collectionProviders?: string[];
  collectionCurrency?: string | null;
  creatorSharePercent?: number;
  platformSharePercent?: number;
  diamondsPerCoin?: number;
  diamondCashValueUsd?: number;
  minWithdrawalUsd?: number;
  cashbackOffer?: { percent: number; maxUsd: number; eligibility: string };
};
type Wallet = { coinBalance?: number; diamondBalance?: number; cashBalanceUsd?: number };
type LedgerRow = { transactionId?: string; type: string; coinsDelta?: number; diamondsDelta?: number; cashDeltaUsd?: number; referenceId?: string; createdAt?: string };
type PurchaseRow = { reference: string; sku: string; coins: number; priceUsd?: number; amountGhs?: number; amountLocal?: number; currency?: string; status: string; provider: string; createdAt?: string; creditedAt?: string };
type GiftRow = { giftName: string; quantity: number; coinsSpent?: number; diamondsAwarded?: number; createdAt?: string };
type Withdrawal = { withdrawalId: string; amountUsd: number; payoutAmount: number; payoutCurrency: string; type: string; status: string; createdAt?: string };
type User = { _id?: string; username?: string; nickname?: string; avatarUrl?: string; avatar?: string; countryCode?: string };
type Earnings = { summary?: { giftsReceived?: number; diamonds?: number; grossCreatorEarningsUsd?: number; cashCreditedUsd?: number; currentCashBalanceUsd?: number } };

const GH_PRICES: Record<number, number> = { 30: 4.49, 50: 7.49, 70: 10.49, 100: 14.99, 200: 29.95, 300: 44.89, 500: 74.85 };
const money = (n: number, currency = "USD") => currency === "GHS" ? "GHS" + n.toFixed(2) : "$" + n.toFixed(2);

export default function WalletPage() {
  const api = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<Wallet>({});
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [referral, setReferral] = useState<{ code: string; shareUrl: string; invitedCount: number } | null>(null);
  const [offer, setOffer] = useState<{ percent: number; maxUsd: number; unlocked: boolean; trigger: string } | null>(null);
  const [provider, setProvider] = useState("PAYSTACK");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<"purchases" | "ledger">("purchases");
  const [earningsOpen, setEarningsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [purchaseMessage, setPurchaseMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [payoutType, setPayoutType] = useState<"BANK" | "MOBILE_MONEY">("MOBILE_MONEY");
  const [destination, setDestination] = useState({ name: "", accountNumber: "", bankCode: "" });
  const [payoutMessage, setPayoutMessage] = useState("");

  async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    const token = typeof window !== "undefined" ? window.localStorage.getItem("twitok_user_token") : null;
    if (token) headers.set("Authorization", "Bearer " + token);
    return fetch(input, { ...init, credentials: "include", headers, cache: "no-store" });
  }

  const signedIn = Boolean(user);

  async function loadAll() {
    setError("");
    try {
      const meResponse = await authFetch(api + "/auth/me");
      if (!meResponse.ok) { setUser(null); setLoading(false); return; }
      const me = await meResponse.json();
      setUser(me.user ?? null);

      const [walletResponse, catalogResponse, ledgerResponse, purchasesResponse, giftsResponse, withdrawalsResponse, earningsResponse, referralResponse, offerResponse] = await Promise.all([
        authFetch(api + "/wallet/me"),
        authFetch(api + "/wallet/catalog"),
        authFetch(api + "/wallet/me/ledger?limit=100"),
        authFetch(api + "/wallet/me/purchases?limit=100"),
        authFetch(api + "/wallet/me/gifts?limit=30"),
        authFetch(api + "/wallet/me/withdrawals?limit=20"),
        authFetch(api + "/wallet/me/earnings?days=30"),
        authFetch(api + "/wallet/referral"),
        authFetch(api + "/wallet/offers")
      ]);

      if (walletResponse.ok) setWallet(await walletResponse.json());
      if (catalogResponse.ok) {
        const nextCatalog = await catalogResponse.json();
        setCatalog(nextCatalog);
        const providers = Array.isArray(nextCatalog.collectionProviders) ? nextCatalog.collectionProviders : [];
        setProvider(current => providers.includes(current) ? current : (providers[0] ?? current));
      }
      if (ledgerResponse.ok) setLedger((await ledgerResponse.json()).transactions ?? []);
      if (purchasesResponse.ok) setPurchases((await purchasesResponse.json()).purchases ?? []);
      if (giftsResponse.ok) setGifts((await giftsResponse.json()).gifts ?? []);
      if (withdrawalsResponse.ok) setWithdrawals((await withdrawalsResponse.json()).withdrawals ?? []);
      if (earningsResponse.ok) setEarnings(await earningsResponse.json());
      if (referralResponse.ok) setReferral(await referralResponse.json());
      if (offerResponse.ok) setOffer(await offerResponse.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load your TwiTok wallet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  const featured = useMemo(() => {
    if (catalog?.featuredCoinPackages?.length) return catalog.featuredCoinPackages;
    if ((user?.countryCode ?? "").toUpperCase() === "GH") return [30,50,70,100,200,300,500].map(coins => ({ sku: "web_" + coins + "_coins_gh", coins, priceGhs: GH_PRICES[coins] }));
    return (catalog?.coinPackages ?? []).slice(0, 7);
  }, [catalog, user]);

  const additional = useMemo(() => {
    const featuredCoins = new Set(featured.map(p => p.coins));
    return (catalog?.additionalCoinPackages ?? catalog?.coinPackages ?? []).filter(p => !featuredCoins.has(p.coins));
  }, [catalog, featured]);

  const currency = catalog?.collectionCurrency ?? ((user?.countryCode ?? "").toUpperCase() === "GH" ? "GHS" : "USD");
  const isGhana = (user?.countryCode ?? "").toUpperCase() === "GH";
  const currentUserName = user?.nickname || user?.username || "TwiTok user";
  const avatar = user?.avatarUrl || user?.avatar || "";

  function packagePrice(pkg: CoinPackage) {
    if (isGhana && pkg.priceGhs != null) return money(pkg.priceGhs, "GHS");
    if (isGhana && GH_PRICES[pkg.coins] != null && pkg.sku.startsWith("web_")) return money(GH_PRICES[pkg.coins], "GHS");
    return money(Number(pkg.priceUsd ?? 0), "USD");
  }

  async function purchase(pkg: CoinPackage) {
    setSelectedSku(pkg.sku); setPurchaseMessage("");
    try {
      if (!signedIn) { window.location.href = "/login?next=/coin"; return; }
      const path = provider === "FLUTTERWAVE" ? "/wallet/coins/flutterwave/initialize" : "/wallet/coins/paystack/initialize";
      const response = await authFetch(api + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provider === "FLUTTERWAVE" ? { sku: pkg.sku, provider: "FLUTTERWAVE" } : { sku: pkg.sku })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.authorizationUrl) throw new Error(body.error ?? "Unable to start checkout.");
      window.location.assign(body.authorizationUrl);
    } catch (e) {
      setPurchaseMessage(e instanceof Error ? e.message : "Unable to start payment.");
    } finally {
      setSelectedSku(null);
    }
  }

  async function copyReferral() {
    if (!referral) return;
    try { await navigator.clipboard.writeText(referral.code); setCopyMessage("Invitation code copied"); window.setTimeout(() => setCopyMessage(""), 2200); }
    catch { setCopyMessage("Copy failed"); }
  }

  async function shareReferral() {
    if (!referral) return;
    try {
      if (navigator.share) { await navigator.share({ title: "Join me on TwiTok", text: "Join me on TwiTok and get rewards.", url: referral.shareUrl }); return; }
      await navigator.clipboard.writeText(referral.shareUrl);
      setCopyMessage("Invite link copied"); window.setTimeout(() => setCopyMessage(""), 2200);
    } catch {}
  }

  async function refresh() { setRefreshing(true); await loadAll(); setRefreshing(false); }

  async function withdraw() {
    setPayoutMessage("");
    const amount = Number(withdrawAmount);
    const min = catalog?.minWithdrawalUsd ?? 10;
    if (!Number.isFinite(amount) || amount < min) { setPayoutMessage("Enter at least " + money(min) + " to withdraw."); return; }
    try {
      const response = await authFetch(api + "/wallet/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "twitok-web-" + crypto.randomUUID() },
        body: JSON.stringify({ countryCode: user?.countryCode ?? "", type: payoutType, amountUsd: amount, destination })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Withdrawal failed.");
      setPayoutMessage("Withdrawal submitted: " + (body.status ?? "PENDING")); setWithdrawAmount(""); await loadAll();
    } catch (e) { setPayoutMessage(e instanceof Error ? e.message : "Withdrawal failed."); }
  }

  const estimatedCash = Number(wallet.cashBalanceUsd ?? earnings?.summary?.currentCashBalanceUsd ?? 0);
  const creatorShare = Number(catalog?.creatorSharePercent ?? 30);
  const platformShare = Number(catalog?.platformSharePercent ?? 70);

  if (loading) return <main className="coin-page loading-page"><div className="loading-spinner" /><span>Loading Get Coins…</span></main>;

  if (!signedIn) return (
    <main className="coin-page">
      <header className="coin-topbar"><Link href="/" className="brand">TwiTok<span className="brand-dot" /></Link><div className="top-search"><span>⌕</span><input placeholder="Search" aria-label="Search TwiTok" /></div><div className="top-actions"><Link href="/login" className="login-button">Sign in</Link><Link href="/register" className="signup-button">Sign up</Link></div></header>
      <section className="signin-card"><div className="coin-large">♪</div><h1>Get Coins</h1><p>Sign in to view your balance, recharge Coins, use referral rewards and manage your transaction history.</p><Link href="/login?next=/coin" className="primary-button">Sign in to continue</Link></section>
    </main>
  );

  return (
    <main className="coin-page">
      <header className="coin-topbar">
        <Link href="/" className="brand">TwiTok<span className="brand-dot" /></Link>
        <div className="top-search"><span>⌕</span><input placeholder="Search" aria-label="Search TwiTok" /></div>
        <div className="top-actions"><Link href="/create" className="upload-button"><b>＋</b> Upload</Link><Link href="/messages" className="top-icon" aria-label="Messages">✈</Link><Link href="/inbox" className="top-icon" aria-label="Inbox">▢</Link><Link href="/profile" className="avatar-button" aria-label="Profile">{avatar ? <img src={avatar} alt="" /> : <span>{(currentUserName[0] ?? "T").toUpperCase()}</span>}</Link></div>
      </header>

      <aside className="floating-tools" aria-label="TwiTok quick actions">
        <Link href="/" className="floating-tool" aria-label="TwiTok">◉</Link>
        <Link href="/inbox" className="floating-tool" aria-label="Notifications">♧</Link>
        <Link href="/profile" className="floating-tool" aria-label="Saved and profile">＋</Link>
        <Link href="/feedback" className="floating-tool" aria-label="Help">?</Link>
      </aside>

      <section className="coin-shell">
        <div className="coin-heading-row"><div><h1>Get Coins</h1><p>Recharge Coins and use them for Gifts, LIVE interactions and creator support.</p></div><button className="history-link" onClick={() => setHistoryOpen(true)}>View transaction history</button></div>

        <div className="account-row">
          <div className="account-card"><div className="profile-avatar">{avatar ? <img src={avatar} alt="" /> : <span>{(currentUserName[0] ?? "T").toUpperCase()}</span>}</div><div className="account-copy"><strong>{user?.username ? "@" + user.username : currentUserName}</strong><span><i className="mini-coin">♪</i>{Math.floor(wallet.coinBalance ?? 0)} Coins</span></div></div>
          <div className="invite-card"><div className="invite-copy"><strong>Invite &amp; Get Rewards <span>›</span></strong><small>{referral?.code ?? "Generating your invite code…"}</small></div><button className="copy-code" onClick={copyReferral} disabled={!referral} aria-label="Copy invitation code">▣</button><button className="invite-share" onClick={shareReferral} disabled={!referral}>Invite</button></div>
        </div>

        {copyMessage && <div className="toast">{copyMessage}</div>}

        <div className="section-title recharge-title"><h2>Recharge</h2><span>Save around 25% with a lower third-party service fee. <em>ⓘ</em></span></div>
        {purchaseMessage && <div className="message-banner">{purchaseMessage}</div>}

        <div className="coin-grid">
          {featured.map((pkg, index) => (
            <button key={pkg.sku} className={"coin-package " + (index === 0 ? "selected" : "")} onClick={() => purchase(pkg)} disabled={selectedSku === pkg.sku}>
              <span className="coin-icon">♪</span><b>{pkg.coins.toLocaleString()}</b><small>{packagePrice(pkg)}</small>{selectedSku === pkg.sku && <span className="package-loading">Opening…</span>}
            </button>
          ))}
          <button className="coin-package custom-package" onClick={() => setCustomOpen(true)}><span className="coin-icon">♪</span><b>Custom</b><small>Large amount supported</small></button>
        </div>

        {additional.length > 0 && <details className="more-packages"><summary>More coin packages</summary><div className="more-grid">{additional.map(pkg => <button key={pkg.sku} className="more-package" onClick={() => purchase(pkg)} disabled={selectedSku === pkg.sku}><span><i className="mini-coin">♪</i>{pkg.coins.toLocaleString()} Coins</span><b>{packagePrice(pkg)}</b></button>)}</div></details>}

        <section className="offer-section">
          <div className="offer-header"><h2>Special offer <em>ⓘ</em></h2><span>{offer?.unlocked ? "5% cash back active" : "5% cash back on your next order"}</span></div>
          <div className="offer-card"><div className="offer-rate">5<small>%</small></div><div className="offer-copy"><strong>Recharge once to unlock 5% cash back up to USD250 on your next order</strong><small>{offer?.unlocked ? "Your offer is unlocked." : "From Invite & Get Rewards"} <span>›</span></small><small>{offer?.unlocked ? "Cashback eligibility is active for the next order." : "Recharge once to unlock the offer."}</small></div><div className={"offer-check " + (offer?.unlocked ? "active" : "")}>{offer?.unlocked ? "✓" : "5%"}</div></div>
        </section>

        <section className="payment-section">
          <div className="payment-heading"><div><h2>Payment method</h2><p>Choose a supported payment provider for your region.</p></div><span className="payment-currency">{currency}</span></div>
          <div className="provider-grid">
            {(catalog?.collectionProviders ?? []).map(method => <button key={method} className={"provider-card " + (provider === method ? "active" : "")} onClick={() => setProvider(method)}><span className={"provider-logo " + method.toLowerCase()}>{method === "PAYSTACK" ? "P" : "F"}</span><span><strong>{method === "PAYSTACK" ? "Paystack" : "Flutterwave"}</strong><small>Secure checkout</small></span>{provider === method && <span className="provider-check">✓</span>}</button>)}
            {!catalog?.collectionProviders?.length && <div className="provider-empty">No web payment provider is configured for this account country.</div>}
          </div>
          <p className="payment-note">Mobile app purchases can also use Apple App Store / Google Play Billing through the existing TwiTok IAP infrastructure. Web checkout is verified server-side before Coins are credited.</p>
        </section>

        <section className="bottom-tools">
          <button className="tool-row" onClick={() => setHistoryOpen(true)}><span className="tool-icon">↔</span><span><strong>Transaction history</strong><small>Purchases, Coin activity and payment status</small></span><b>›</b></button>
          <button className="tool-row" onClick={() => setEarningsOpen(v => !v)}><span className="tool-icon">◆</span><span><strong>Creator wallet &amp; earnings</strong><small>Diamonds, gifts, cash balance and withdrawals</small></span><b>{earningsOpen ? "⌃" : "›"}</b></button>
        </section>

        {earningsOpen && <section className="creator-panel">
          <div className="payout-model"><h3>Creator payout model</h3><div className="payout-rules"><span><b>1 Coin spent → {Number(catalog?.diamondsPerCoin ?? 0.3).toFixed(2)} Diamonds</b><small>{money(Number(catalog?.diamondCashValueUsd ?? 0.003))} per Diamond</small></span><span><b>Cashout threshold</b><small>{money(Number(catalog?.minWithdrawalUsd ?? 10))}</small></span></div></div><div className="creator-grid"><div><small>Diamonds</small><strong>{Number(wallet.diamondBalance ?? 0).toFixed(2)}</strong></div><div><small>Estimated cash</small><strong>{money(estimatedCash)}</strong></div><div><small>Creator share</small><strong>{creatorShare}%</strong></div><div><small>Platform share</small><strong>{platformShare}%</strong></div></div>
          <div className="creator-columns">
            <div className="creator-subpanel"><h3>Recent gifts received</h3>{gifts.length === 0 ? <p className="empty-copy">No gifts received yet.</p> : gifts.map((gift,i) => <div className="activity-row" key={gift.giftName+i}><span><b>{gift.giftName}</b><small>× {gift.quantity}{gift.createdAt ? " · " + new Date(gift.createdAt).toLocaleString() : ""}</small></span><strong>+{Number(gift.diamondsAwarded ?? 0).toFixed(2)} ♦</strong></div>)}</div>
            <div className="creator-subpanel"><h3>Withdraw earnings</h3><p className="muted-copy">Ghana supports bank and mobile money payouts. Other regions use their configured payout provider.</p><div className="form-grid"><select value={payoutType} onChange={e => setPayoutType(e.target.value as "BANK" | "MOBILE_MONEY")}><option value="MOBILE_MONEY">Mobile Money</option><option value="BANK">Bank</option></select><input placeholder="Account name" value={destination.name} onChange={e => setDestination({...destination,name:e.target.value})}/><input placeholder={payoutType === "MOBILE_MONEY" ? "MoMo number" : "Bank account number"} value={destination.accountNumber} onChange={e => setDestination({...destination,accountNumber:e.target.value})}/><input placeholder={payoutType === "MOBILE_MONEY" ? "Provider code" : "Bank code"} value={destination.bankCode} onChange={e => setDestination({...destination,bankCode:e.target.value})}/><input type="number" min={catalog?.minWithdrawalUsd ?? 10} step="0.01" placeholder="Amount in USD" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}/><button onClick={withdraw}>Withdraw earnings</button></div>{payoutMessage && <p className="muted-copy">{payoutMessage}</p>}</div>
          </div>
          <div className="creator-subpanel"><h3>Withdrawal history</h3>{withdrawals.length === 0 ? <p className="empty-copy">No withdrawals yet.</p> : withdrawals.map(withdrawal => <div className="activity-row" key={withdrawal.withdrawalId}><span><b>{withdrawal.status}</b><small>{withdrawal.type}{withdrawal.createdAt ? " · " + new Date(withdrawal.createdAt).toLocaleString() : ""}</small></span><strong>{money(withdrawal.amountUsd)} → {withdrawal.payoutAmount.toFixed(2)} {withdrawal.payoutCurrency}</strong></div>)}</div>
        </section>}

        {error && <div className="message-banner">{error}</div>}
        <button className="refresh-button" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh wallet"}</button>
      </section>

      {customOpen && <div className="modal-backdrop" onClick={() => setCustomOpen(false)}><div className="modal-card" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setCustomOpen(false)} aria-label="Close">×</button><div className="coin-large">♪</div><h2>Custom Coin purchase</h2><p>Large Coin amounts are supported. For custom-volume pricing, contact TwiTok support so the final amount can be quoted and verified before payment.</p><div className="modal-actions"><Link href="/feedback?topic=coin-purchase" className="primary-button">Contact support</Link><button className="secondary-button" onClick={() => setCustomOpen(false)}>Close</button></div></div></div>}

      {historyOpen && <div className="modal-backdrop" onClick={() => setHistoryOpen(false)}><div className="history-modal" onClick={e => e.stopPropagation()}><div className="history-top"><div><h2>Transaction history</h2><p>Coins, payments and wallet activity.</p></div><button className="modal-close" onClick={() => setHistoryOpen(false)} aria-label="Close">×</button></div><div className="history-tabs"><button className={historyTab === "purchases" ? "active" : ""} onClick={() => setHistoryTab("purchases")}>Purchases</button><button className={historyTab === "ledger" ? "active" : ""} onClick={() => setHistoryTab("ledger")}>Wallet activity</button></div><div className="history-list">
        {historyTab === "purchases" ? (purchases.length ? purchases.map(row => <div className="activity-row" key={row.reference}><span><b>{row.coins.toLocaleString()} Coins · {row.provider}</b><small>{row.reference} · {row.createdAt ? new Date(row.createdAt).toLocaleString() : ""}</small></span><strong>{row.amountGhs != null ? money(row.amountGhs,"GHS") : row.amountLocal != null ? money(row.amountLocal,row.currency ?? currency) : money(Number(row.priceUsd ?? 0))} · {row.status}</strong></div>) : <p className="empty-copy">No Coin purchases yet.</p>)
        : (ledger.length ? ledger.map((row,i) => <div className="activity-row" key={row.transactionId ?? i}><span><b>{row.type.replaceAll("_"," ")}</b><small>{row.referenceId ?? ""}{row.createdAt ? " · " + new Date(row.createdAt).toLocaleString() : ""}</small></span><strong>{row.coinsDelta ? (row.coinsDelta > 0 ? "+" : "") + row.coinsDelta + " Coins" : row.diamondsDelta ? (row.diamondsDelta > 0 ? "+" : "") + row.diamondsDelta.toFixed(2) + " ♦" : row.cashDeltaUsd ? money(row.cashDeltaUsd) : "—"}</strong></div>) : <p className="empty-copy">No wallet activity yet.</p>)}
      </div></div></div>}

      <style jsx global>{`
        :root{--tt-bg:#f6f6f7;--tt-white:#fff;--tt-text:#161616;--tt-muted:#777;--tt-pink:#fe2c55;--tt-cyan:#25f4ee;--tt-gold:#f6c640}
        *{box-sizing:border-box}
        .coin-page{min-height:100vh;background:var(--tt-bg);color:var(--tt-text);font-family:"TikTok Sans",Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .coin-topbar{height:74px;background:#fff;border-bottom:1px solid #e9e9ea;display:grid;grid-template-columns:260px minmax(260px,520px) 1fr;align-items:center;padding:0 30px;gap:28px;position:sticky;top:0;z-index:30}
        .brand{font-size:27px;letter-spacing:-.05em;font-weight:950;color:#111;text-decoration:none;display:flex;align-items:center;gap:6px}.brand-dot{width:9px;height:9px;border-radius:3px;background:linear-gradient(135deg,var(--tt-cyan),var(--tt-pink));display:inline-block}
        .top-search{height:44px;border-radius:999px;background:#f2f2f4;display:flex;align-items:center;padding:0 14px;gap:9px;color:#777}.top-search input{flex:1;border:0;outline:none;background:transparent;font-size:15px}.top-actions{display:flex;justify-content:flex-end;align-items:center;gap:14px}.upload-button{border:1px solid #dcdcdf;background:#fff;color:#111;text-decoration:none;padding:10px 16px;font-weight:800}.upload-button b{font-size:19px;vertical-align:-1px}.top-icon{width:38px;height:38px;display:grid;place-items:center;color:#111;text-decoration:none;font-size:20px}.avatar-button{width:38px;height:38px;border-radius:50%;overflow:hidden;background:#ddd;text-decoration:none;display:grid;place-items:center;color:#111;font-weight:900}.avatar-button img{width:100%;height:100%;object-fit:cover}
        .login-button,.signup-button{padding:9px 14px;border-radius:7px;text-decoration:none;font-weight:800}.login-button{color:#111}.signup-button{color:#fff;background:#111}
        .coin-shell{width:min(1000px,calc(100% - 30px));margin:26px auto 60px;background:#fff;border-radius:11px;padding:34px 34px 42px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
        .coin-heading-row{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.coin-heading-row h1{margin:0;font-size:30px;letter-spacing:-.04em}.coin-heading-row p{margin:7px 0 0;color:#777;font-size:13px}.history-link{border:0;background:none;color:#181818;font-weight:800;font-size:14px;padding:4px 0;cursor:pointer}
        .account-row{display:grid;grid-template-columns:1.15fr .9fr;gap:20px;margin:25px 0 28px}.account-card,.invite-card{min-height:89px;background:#f8f8f9;border-radius:9px;display:flex;align-items:center;padding:16px 18px}.account-card{gap:13px}.profile-avatar{width:51px;height:51px;flex:none;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#2b2b2b,#101010);display:grid;place-items:center;color:#fff;font-weight:900}.profile-avatar img{width:100%;height:100%;object-fit:cover}.account-copy{display:grid;gap:7px;min-width:0}.account-copy strong{font-size:15px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-copy span{display:flex;align-items:center;gap:7px;font-size:13px;color:#777}.mini-coin{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--tt-gold);color:#fff;font-size:11px;font-style:normal;font-weight:900;box-shadow:inset 0 0 0 2px rgba(255,255,255,.36)}
        .invite-card{gap:12px}.invite-copy{min-width:0;display:grid;gap:7px}.invite-copy strong{font-size:14px}.invite-copy strong span{font-size:20px;vertical-align:-2px}.invite-copy small{font-size:12px;color:#858585;letter-spacing:.02em}.copy-code,.invite-share{border:0;cursor:pointer;font-weight:800}.copy-code{background:transparent;font-size:18px;color:#666}.invite-share{margin-left:auto;border:1px solid #ddd;border-radius:7px;background:#fff;padding:8px 12px}
        .section-title{display:flex;justify-content:space-between;align-items:center;gap:12px}.recharge-title h2,.offer-header h2,.payment-heading h2{margin:0;font-size:16px}.recharge-title span,.payment-heading p{color:#777;font-size:13px}.recharge-title span{font-weight:700}.section-title em,.offer-header em{font-style:normal;color:#aaa;font-size:12px}
        .message-banner{margin:14px 0;padding:11px 13px;border-radius:8px;background:#fff1f4;color:#c21840;border:1px solid #ffd3dc;font-size:13px}
        .coin-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:14px}.coin-package{min-height:103px;border:1px solid transparent;border-radius:9px;background:#f7f7f8;display:grid;grid-template-columns:auto 1fr;align-content:center;justify-items:start;column-gap:10px;row-gap:4px;padding:16px 14px;cursor:pointer;text-align:left;position:relative}.coin-package:hover{background:#f4f4f6}.coin-package.selected{border-color:#f18ca3;background:#fff2f5}.coin-package .coin-icon{grid-row:1/3;align-self:center;width:31px;height:31px;border-radius:50%;background:var(--tt-gold);color:#fff;display:grid;place-items:center;font-weight:900;box-shadow:inset 0 0 0 2px rgba(255,255,255,.45)}.coin-package b{font-size:24px;line-height:1;font-variant-numeric:tabular-nums}.coin-package small{font-size:13px;color:#777}.custom-package b{font-size:20px}.custom-package small{font-size:12px}.package-loading{position:absolute;right:10px;top:8px;font-size:9px;color:var(--tt-pink);font-weight:800}
        .more-packages{margin-top:16px;border-top:1px solid #eee;padding-top:14px}.more-packages summary{cursor:pointer;font-weight:800;font-size:13px}.more-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:11px}.more-package{border:1px solid #eee;background:#fafafa;border-radius:9px;padding:12px 13px;display:flex;justify-content:space-between;align-items:center;cursor:pointer}.more-package span{display:flex;gap:7px;align-items:center}.more-package b{font-size:13px}
        .offer-section{margin-top:18px;background:#fbf7f8;border-radius:9px;padding:18px}.offer-header{display:flex;justify-content:space-between;align-items:center;gap:14px}.offer-header>span{color:var(--tt-pink);font-size:13px;font-weight:800}.offer-card{margin-top:12px;background:#fff;border-radius:8px;padding:18px;display:grid;grid-template-columns:70px 1fr 36px;align-items:center;gap:14px}.offer-rate{font-size:38px;font-weight:950;color:var(--tt-pink);letter-spacing:-.06em;text-align:center}.offer-rate small{font-size:18px}.offer-copy{display:grid;gap:7px}.offer-copy strong{font-size:14px}.offer-copy small{color:#777;font-size:12px}.offer-copy small span{padding:0 4px}.offer-check{width:28px;height:28px;border-radius:50%;border:2px solid #d4d4d4;color:#aaa;display:grid;place-items:center;font-size:11px;font-weight:900}.offer-check.active{background:var(--tt-pink);border-color:var(--tt-pink);color:#fff}
        .payment-section{margin-top:22px;padding-top:19px;border-top:1px solid #efefef}.payment-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.payment-heading p{margin:5px 0 0}.payment-currency{font-weight:850;font-size:12px;color:#777;padding:7px 9px;border-radius:999px;background:#f3f3f4}.provider-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:13px}.provider-card{border:1px solid #e3e3e5;background:#fff;border-radius:10px;min-height:70px;padding:11px 13px;display:flex;align-items:center;gap:10px;text-align:left;cursor:pointer}.provider-card.active{border-color:#111;box-shadow:0 0 0 1px #111}.provider-logo{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:#fff;font-weight:950}.provider-logo.paystack{background:#111}.provider-logo.flutterwave{background:#f5a623}.provider-card>span:nth-child(2){display:grid;gap:3px;flex:1}.provider-card strong{font-size:13px}.provider-card small{color:#888;font-size:10px}.provider-check{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:#111;color:#fff;font-size:11px;font-weight:900}.provider-empty{grid-column:1/-1;padding:15px;background:#f8f8f8;color:#777;border-radius:8px;font-size:12px}.payment-note{color:#888;font-size:10px;line-height:1.5;margin:12px 0 0}
        .bottom-tools{border-top:1px solid #eee;margin-top:22px}.tool-row{width:100%;border:0;background:transparent;border-bottom:1px solid #eee;padding:16px 1px;display:flex;align-items:center;text-align:left;gap:12px;cursor:pointer}.tool-row:hover{background:#fafafa}.tool-row>span:nth-child(2){display:grid;gap:4px;flex:1}.tool-row strong{font-size:14px}.tool-row small{color:#888;font-size:11px}.tool-row>b{font-size:21px;color:#777}.tool-icon{width:28px;height:28px;border-radius:8px;background:#f2f2f4;display:grid;place-items:center;color:#555}
        .payout-model{border:1px solid #292929;border-radius:10px;padding:14px;margin-bottom:14px}.payout-model h3{font-size:14px;margin:0 0 10px}.payout-rules{display:grid;grid-template-columns:1fr 1fr;gap:10px}.payout-rules span{display:grid;gap:5px;background:#171717;border-radius:9px;padding:12px}.payout-rules b{font-size:12px}.payout-rules small{color:#888;font-size:10px}.creator-panel{margin-top:14px;padding:18px;border-radius:10px;background:#101010;color:#fff}.creator-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.creator-grid>div{background:#171717;border:1px solid #262626;border-radius:10px;padding:13px;display:grid;gap:7px}.creator-grid small{color:#888;font-size:10px}.creator-grid strong{font-size:20px}.creator-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.creator-subpanel{border:1px solid #292929;border-radius:10px;padding:14px}.creator-subpanel h3{font-size:14px;margin:0 0 11px}.activity-row{min-height:55px;padding:9px 0;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;gap:12px}.creator-panel .activity-row{border-bottom-color:#2a2a2a}.activity-row:last-child{border-bottom:0}.activity-row span{display:grid;gap:4px;min-width:0}.activity-row b{font-size:12px}.activity-row small{font-size:10px;color:#888}.activity-row>strong{font-size:11px;white-space:nowrap}.empty-copy,.muted-copy{color:#888;font-size:11px;line-height:1.45}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.form-grid input,.form-grid select{width:100%;height:38px;border-radius:8px;border:1px solid #343434;background:#171717;color:#fff;padding:0 10px;outline:none}.form-grid button{grid-column:1/-1;height:40px;border:0;border-radius:8px;background:#fff;color:#111;font-weight:900;cursor:pointer}
        .refresh-button{margin-top:14px;border:1px solid #ddd;background:#fff;border-radius:8px;padding:9px 12px;font-weight:800;cursor:pointer}.refresh-button:disabled{opacity:.55}.floating-tools{position:fixed;right:14px;top:50%;transform:translateY(-50%);display:grid;gap:14px;z-index:40}.floating-tool{width:48px;height:48px;border-radius:50%;background:#fff;border:1px solid #eee;display:grid;place-items:center;text-decoration:none;color:#111;font-weight:900;font-size:18px;box-shadow:0 4px 14px rgba(0,0,0,.08)}.floating-tool:hover{transform:translateY(-2px)}.toast{position:fixed;top:86px;right:22px;background:#111;color:#fff;border-radius:999px;padding:9px 14px;font-size:12px;z-index:80}
        .signin-card{width:min(480px,calc(100% - 30px));margin:80px auto;background:#fff;border-radius:16px;padding:42px;text-align:center}.signin-card h1{margin:12px 0 7px;font-size:30px}.signin-card p{color:#777;line-height:1.55;font-size:13px}.coin-large{margin:auto;width:64px;height:64px;border-radius:50%;background:var(--tt-gold);color:#fff;display:grid;place-items:center;font-size:28px;font-weight:950;box-shadow:inset 0 0 0 4px rgba(255,255,255,.35)}
        .primary-button,.secondary-button{min-height:42px;padding:0 18px;border-radius:8px;font-weight:850;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.primary-button{background:#111;color:#fff;border:1px solid #111}.secondary-button{background:#fff;color:#111;border:1px solid #ddd}.modal-actions{display:flex;justify-content:center;gap:8px;margin-top:18px}.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.46);display:grid;place-items:center;padding:16px;z-index:90}.modal-card,.history-modal{background:#fff;border-radius:14px;box-shadow:0 18px 70px rgba(0,0,0,.28)}.modal-card{width:min(440px,100%);padding:30px;text-align:center;position:relative}.modal-card h2{font-size:21px;margin:13px 0 7px}.modal-card p{color:#777;font-size:13px;line-height:1.55}.modal-close{width:32px;height:32px;border:0;background:#f2f2f4;border-radius:50%;font-size:22px;color:#555;cursor:pointer}.modal-card>.modal-close{position:absolute;right:14px;top:14px}.history-modal{width:min(740px,100%);max-height:82vh;overflow:hidden;display:flex;flex-direction:column}.history-top{display:flex;justify-content:space-between;gap:15px;padding:20px 22px;border-bottom:1px solid #eee}.history-top h2{margin:0;font-size:21px}.history-top p{margin:5px 0 0;color:#888;font-size:11px}.history-tabs{display:flex;border-bottom:1px solid #eee;padding:0 22px}.history-tabs button{border:0;background:none;padding:13px 7px;margin-right:20px;font-weight:850;color:#888;cursor:pointer}.history-tabs button.active{color:#111;border-bottom:2px solid #111}.history-list{overflow:auto;padding:8px 22px 18px}
        .loading-page{display:grid;place-items:center;align-content:center;gap:12px}.loading-spinner{width:30px;height:30px;border:3px solid #ddd;border-top-color:#111;border-radius:50%;animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:900px){.coin-topbar{grid-template-columns:190px minmax(160px,1fr) auto;padding:0 16px;gap:14px}.coin-shell{padding:25px 20px}.account-row{grid-template-columns:1fr}.coin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.provider-grid{grid-template-columns:1fr 1fr}.creator-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.creator-columns{grid-template-columns:1fr}.more-grid{grid-template-columns:1fr 1fr}}
        @media(max-width:900px){.floating-tools{display:none}}
        @media(max-width:620px){.coin-topbar{height:60px;grid-template-columns:1fr auto}.top-search{display:none}.brand{font-size:23px}.top-actions{gap:6px}.coin-shell{width:100%;margin:0;border-radius:0;padding:22px 14px 40px}.coin-heading-row{display:grid;gap:10px}.coin-heading-row h1{font-size:27px}.history-link{justify-self:start}.coin-grid{gap:9px}.coin-package{min-height:94px;padding:12px 10px}.coin-package b{font-size:20px}.coin-package .coin-icon{width:27px;height:27px}.offer-card{grid-template-columns:50px 1fr 29px;padding:14px}.offer-rate{font-size:31px}.provider-grid{grid-template-columns:1fr}.creator-grid{grid-template-columns:1fr 1fr}.form-grid{grid-template-columns:1fr}.form-grid button{grid-column:auto}.activity-row{align-items:flex-start}.activity-row>strong{white-space:normal;text-align:right}.invite-card{padding:13px}.modal-actions{flex-direction:column}.signin-card{padding:30px 22px;margin-top:45px}}
      `}</style>
    </main>
  );
}
