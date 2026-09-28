"use client";

import type { CSSProperties } from "react";

import { useEffect, useMemo, useState } from "react";

type Wallet = { coinBalance?: number; diamondBalance?: number; cashBalanceUsd?: number };
type Catalog = { coinPackages: Array<{ sku: string; coins: number; priceUsd: number }>; gifts: Array<{ giftId: string; name: string; coins: number; animation: string }>; creatorSharePercent: number; platformSharePercent: number; diamondCashValueUsd: number; minWithdrawalUsd: number };
type LedgerRow = { type: string; coinsDelta?: number; diamondsDelta?: number; cashDeltaUsd?: number; createdAt?: string };
type GiftRow = { giftName: string; quantity: number; coinsSpent: number; diamondsAwarded: number; createdAt?: string };
type Withdrawal = { withdrawalId: string; amountUsd: number; payoutAmount: number; payoutCurrency: string; type: string; status: string; createdAt?: string };

const money = (n: number) => "$" + n.toFixed(2);

export default function WalletPage() {
  const api = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
  const [wallet, setWallet] = useState<Wallet>({});
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [payoutType, setPayoutType] = useState<"BANK" | "MOBILE_MONEY">("MOBILE_MONEY");
  const [destination, setDestination] = useState({ name: "", accountNumber: "", bankCode: "" });
  const [payoutMessage, setPayoutMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    const token = window.localStorage.getItem("twitok_user_token");
    if (!token) { setError("Sign in to view your creator wallet."); setLoading(false); return; }
    const headers = { Authorization: "Bearer " + token };
    try {
      const [w, c, l, g] = await Promise.all([
        fetch(api + "/wallet/me", { headers, cache: "no-store" }),
        fetch(api + "/wallet/catalog", { cache: "no-store" }),
        fetch(api + "/wallet/me/ledger?limit=30", { headers, cache: "no-store" }),
        fetch(api + "/wallet/me/gifts?limit=30", { headers, cache: "no-store" })
      ]);
      if (!w.ok) throw new Error("Unable to load wallet");
      setWallet(await w.json());
      if (c.ok) setCatalog(await c.json());
      if (l.ok) setLedger((await l.json()).transactions ?? []);
      if (g.ok) setGifts((await g.json()).gifts ?? []);
      const wd = await fetch(api + "/wallet/me/withdrawals?limit=20", { headers, cache: "no-store" });
      if (wd.ok) setWithdrawals((await wd.json()).withdrawals ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load wallet"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const estimated = useMemo(() => Number(wallet.cashBalanceUsd ?? 0), [wallet.cashBalanceUsd]);

  if (loading) return <main style={styles.page}><p>Loading your wallet…</p></main>;
  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <div><div style={styles.kicker}>TWITOK CREATOR</div><h1 style={styles.title}>Wallet & Earnings</h1><p style={styles.sub}>Coins, Diamonds, gifts and creator earnings in one place.</p></div>
        <button style={styles.refresh} onClick={() => { setLoading(true); void load(); }}>Refresh</button>
      </div>
      {error && <div style={styles.error}>{error}</div>}
      <section style={styles.cards}>
        <Card label="Coins" value={String(Math.floor(wallet.coinBalance ?? 0))} />
        <Card label="Diamonds" value={String((wallet.diamondBalance ?? 0).toFixed(2))} />
        <Card label="Estimated cash" value={money(estimated)} />
        <Card label="Minimum cashout" value={money(catalog?.minWithdrawalUsd ?? 10)} />
      </section>

      <section style={styles.panel}>
        <h2 style={styles.heading}>Creator payout model</h2>
        <p style={styles.sub}>TwiTok credits creators with 30% of gift value. Platform share is 70%. Diamonds are the creator accounting unit.</p>
        <div style={styles.rule}><b>1 Coin spent → 0.30 Diamonds</b><span>{money(catalog?.diamondCashValueUsd ?? 0.003)} per Diamond</span></div>
        <div style={styles.rule}><b>Cashout threshold</b><span>{money(catalog?.minWithdrawalUsd ?? 10)}</span></div>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.heading}>Coin packages</h2>
        <div style={styles.grid}>{(catalog?.coinPackages ?? []).map(p => <div style={styles.package} key={p.sku}><b>{p.coins.toLocaleString()} Coins</b><strong>{money(p.priceUsd)}</strong><small>{p.sku}</small></div>)}</div>
        <p style={styles.note}>Purchasing is intentionally separated from the wallet display. Apple/Google purchases must be verified server-side before Coins are credited.</p>
      </section>

      <div style={styles.columns}>
        <section style={styles.panel}>
          <h2 style={styles.heading}>Recent gifts received</h2>
          {gifts.length === 0 ? <p style={styles.empty}>No gifts received yet.</p> : gifts.map((g, i) => <div style={styles.row} key={i}><span><b>{g.giftName}</b> × {g.quantity}<small>{g.createdAt ? new Date(g.createdAt).toLocaleString() : ""}</small></span><span>+{g.diamondsAwarded.toFixed(2)} ♦</span></div>)}
        </section>
        <section style={styles.panel}>
          <h2 style={styles.heading}>Wallet activity</h2>
          {ledger.length === 0 ? <p style={styles.empty}>No wallet activity yet.</p> : ledger.map((r, i) => <div style={styles.row} key={i}><span><b>{r.type.replaceAll("_", " ")}</b><small>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}</small></span><span>{r.cashDeltaUsd ? money(r.cashDeltaUsd) : r.diamondsDelta ? (r.diamondsDelta > 0 ? "+" : "") + r.diamondsDelta.toFixed(2) + " ♦" : r.coinsDelta ? (r.coinsDelta > 0 ? "+" : "") + r.coinsDelta + " Coins" : "—"}</span></div>)}
        </section>
      </div>

      <section style={styles.panel}>
        <h2 style={styles.heading}>Bank & Mobile Money</h2>
        <p style={styles.sub}>Ghana payouts support bank and mobile money. Your cash balance is reserved when the request is created and restored automatically if the provider rejects or reverses the transfer.</p>
        <div style={styles.formGrid}>
          <select style={styles.input} value={payoutType} onChange={e => setPayoutType(e.target.value as "BANK" | "MOBILE_MONEY")}><option value="MOBILE_MONEY">Mobile Money</option><option value="BANK">Bank</option></select>
          <input style={styles.input} placeholder="Account name" value={destination.name} onChange={e => setDestination({...destination,name:e.target.value})} />
          <input style={styles.input} placeholder={payoutType === "MOBILE_MONEY" ? "MoMo number" : "Bank account number"} value={destination.accountNumber} onChange={e => setDestination({...destination,accountNumber:e.target.value})} />
          <input style={styles.input} placeholder={payoutType === "MOBILE_MONEY" ? "Provider code" : "Bank code"} value={destination.bankCode} onChange={e => setDestination({...destination,bankCode:e.target.value})} />
          <input style={styles.input} type="number" min={catalog?.minWithdrawalUsd ?? 10} step="0.01" placeholder="Amount in USD" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} />
        </div>
        <button style={styles.withdraw} onClick={async () => {
          setPayoutMessage("");
          const token = window.localStorage.getItem("twitok_user_token");
          const amount = Number(withdrawAmount);
          if (!token || !Number.isFinite(amount) || amount < (catalog?.minWithdrawalUsd ?? 10)) { setPayoutMessage("Enter at least the $10 minimum and sign in."); return; }
          const response = await fetch(api + "/wallet/withdrawals", { method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+token}, body:JSON.stringify({countryCode:"GH",type:payoutType,amountUsd:amount,destination}) });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) { setPayoutMessage(body.error ?? "Withdrawal failed."); return; }
          setPayoutMessage("Withdrawal submitted: " + body.status);
          setWithdrawAmount("");
          setLoading(true); void load();
        }}>Withdraw earnings</button>
        {payoutMessage && <p style={styles.sub}>{payoutMessage}</p>}
      </section>
      <section style={styles.panel}>
        <h2 style={styles.heading}>Withdrawal history</h2>
        {withdrawals.length === 0 ? <p style={styles.empty}>No withdrawals yet.</p> : withdrawals.map(w => <div style={styles.row} key={w.withdrawalId}><span><b>{w.status}</b><small>{w.type} · {w.createdAt ? new Date(w.createdAt).toLocaleString() : ""}</small></span><span>{money(w.amountUsd)} → {w.payoutAmount.toFixed(2)} {w.payoutCurrency}</span></div>)}
      </section>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return <div style={styles.card}><span>{label}</span><b>{value}</b></div>;
}

const styles: Record<string, CSSProperties> = {
  page:{minHeight:"100vh",background:"#080808",color:"#fff",padding:"32px max(20px,calc((100vw - 1100px)/2))",fontFamily:"Arial, sans-serif"},
  header:{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-start",marginBottom:28},
  kicker:{fontSize:12,fontWeight:800,letterSpacing:2,color:"#ff2d55"},
  title:{fontSize:34,margin:"6px 0"},
  sub:{color:"#aaa",lineHeight:1.5,margin:"6px 0"},
  refresh:{background:"#fff",color:"#000",border:0,borderRadius:10,padding:"10px 16px",fontWeight:700},
  error:{background:"#35131b",border:"1px solid #703040",padding:14,borderRadius:12,marginBottom:18},
  cards:{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:12,marginBottom:18},
  card:{background:"#151515",border:"1px solid #252525",borderRadius:16,padding:20,display:"flex",flexDirection:"column",gap:10},
  panel:{background:"#111",border:"1px solid #252525",borderRadius:16,padding:20,marginBottom:18},
  heading:{fontSize:19,margin:"0 0 14px"},
  rule:{display:"flex",justifyContent:"space-between",gap:20,padding:"12px 0",borderTop:"1px solid #242424"},
  grid:{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:10},
  package:{background:"#181818",borderRadius:12,padding:14,display:"flex",flexDirection:"column",gap:8},
  note:{fontSize:12,color:"#777",marginBottom:0},
  columns:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18},
  row:{display:"flex",justifyContent:"space-between",gap:16,padding:"12px 0",borderTop:"1px solid #222"},
  rowSmall:{},
  empty:{color:"#777"},
  formGrid:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10},
  input:{width:"100%",boxSizing:"border-box",padding:13,borderRadius:10,border:"1px solid #333",background:"#181818",color:"#fff"},
  withdraw:{marginTop:12,width:"100%",padding:14,borderRadius:10,border:0,background:"#fff",color:"#000",fontWeight:800},
};

