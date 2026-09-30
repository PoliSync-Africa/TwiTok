"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Analytics = {
  period: { days: number; from: string; to: string };
  summary: { impressions:number; views:number; uniqueViewers:number; completedViews:number; completionRate:number; rewatches:number; watchTimeMs:number; averageWatchTimeMs:number; likes:number; comments:number; shares:number; saves:number; followsGained:number; engagementRate:number };
  daily: Array<{date:string;views:number;completedViews:number;likes:number;comments:number;shares:number;saves:number;follows:number}>;
  topVideos: Array<{id:string;views:number;completedViews:number;likes:number;comments:number;shares:number;saves:number;caption:string;mediaType:string;publishedAt?:string|null}>;
  audienceCountries: Array<{countryCode:string;viewers:number;views:number}>;
  audience: { followerTotal:number; newFollowers:number; dailyFollowerGrowth:Array<{date:string;newFollowers:number}>; followerCountries:Array<{countryCode:string;followers:number}> };
  live: {streams:number;endedStreams:number;totalDurationMs:number;giftsUsd:number;peakViewerCount:number};
  trafficSources: Array<{source:string;views:number;tracked:boolean}>;
  earnings: {grossCreatorEarningsUsd:number;cashCreditedUsd:number;diamonds:number};
};

const nf = new Intl.NumberFormat("en-US");
const usd = (n:number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(n||0));
const compact = (n:number) => new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(Number(n||0));
const hours = (ms:number) => { const h=ms/3600000; return h>=1 ? h.toFixed(1)+"h" : Math.round(ms/60000)+"m"; };
const duration = (ms:number) => { const m=Math.floor(ms/60000); const s=Math.floor((ms%60000)/1000); return m+"m "+s+"s"; };

export default function CreatorAnalytics() {
  const api = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
  const [days,setDays] = useState(28);
  const [data,setData] = useState<Analytics|null>(null);
  const [error,setError] = useState("");
  const token = typeof window !== "undefined" ? window.localStorage.getItem("twitok_user_token") : "";

  useEffect(() => {
    if (!token) return;
    setError("");
    fetch(api + "/analytics/creator/overview?days=" + days,{headers:{Authorization:"Bearer "+token},cache:"no-store"})
      .then(async r => { const d=await r.json(); if(!r.ok) throw new Error(d.error ?? "Unable to load analytics"); setData(d); })
      .catch(e => setError(e instanceof Error ? e.message : "Unable to load analytics"));
  },[api,token,days]);

  const maxViews = Math.max(1,...(data?.daily??[]).map(x=>x.views));
  const maxTop = Math.max(1,...(data?.topVideos??[]).map(x=>x.views));
  const maxCountry = Math.max(1,...(data?.audienceCountries??[]).map(x=>x.viewers));
  const maxFollowerCountry = Math.max(1,...(data?.audience?.followerCountries??[]).map(x=>x.followers));
  const topCountries = useMemo(()=>data?.audienceCountries.slice(0,8)??[],[data]);
  const topFollowerCountries = useMemo(()=>data?.audience?.followerCountries.slice(0,8)??[],[data]);

  return <main className="studio creator-analytics">
    <header className="studio-top">
      <div><Link href="/creator/studio" className="back">← Creator Studio</Link><h1>Creator Analytics</h1><p>Understand how your content is being watched, shared and discovered.</p></div>
      <div className="range-tabs">{[7,28,90].map(n=><button key={n} className={days===n?"range active":"range"} onClick={()=>setDays(n)}>{n}D</button>)}<Link href="/creator/wallet" className="range">Wallet</Link></div>
    </header>

    {error && <div className="analytics-error">{error}</div>}

    <section className="metrics">
      <article><span>VIEWS</span><strong>{compact(data?.summary.views??0)}</strong><small>{nf.format(data?.summary.uniqueViewers??0)} unique viewers</small></article>
      <article><span>WATCH TIME</span><strong>{hours(data?.summary.watchTimeMs??0)}</strong><small>Avg {duration(data?.summary.averageWatchTimeMs??0)} per view</small></article>
      <article><span>COMPLETION</span><strong>{(data?.summary.completionRate??0).toFixed(1)}%</strong><small>{compact(data?.summary.completedViews??0)} completed views</small></article>
      <article><span>FOLLOWERS GAINED</span><strong>+{compact(data?.audience?.newFollowers??data?.summary.followsGained??0)}</strong><small>{compact(data?.audience?.followerTotal??0)} total followers</small></article>
    </section>

    <section className="analytics-stat-grid">
      {[["Impressions",data?.summary.impressions??0],["Rewatches",data?.summary.rewatches??0],["Likes",data?.summary.likes??0],["Comments",data?.summary.comments??0],["Shares",data?.summary.shares??0],["Saves",data?.summary.saves??0]].map(([label,value])=><article className="studio-panel mini-stat" key={String(label)}><span>{label}</span><strong>{compact(Number(value))}</strong></article>)}
    </section>

    <section className="studio-grid">
      <article className="studio-panel wide">
        <div className="panel-head"><div><span>PERFORMANCE</span><h2>Views over time</h2></div><small>{days}-day period</small></div>
        <div className="analytics-bars">{(data?.daily??[]).map(d=><div className="analytics-bar-col" key={d.date} title={d.date+": "+nf.format(d.views)+" views"}><i style={{height:Math.max(4,(d.views/maxViews)*100)+"%"}}/><small>{d.date.slice(5)}</small></div>)}</div>
      </article>

      <article className="studio-panel">
        <span>ENGAGEMENT</span><h2>Audience actions</h2>
        <div className="wallet-lines">
          <div><span>Likes</span><strong>{nf.format(data?.summary.likes??0)}</strong></div>
          <div><span>Comments</span><strong>{nf.format(data?.summary.comments??0)}</strong></div>
          <div><span>Shares</span><strong>{nf.format(data?.summary.shares??0)}</strong></div>
          <div><span>Saves</span><strong>{nf.format(data?.summary.saves??0)}</strong></div>
        </div>
      </article>

      <article className="studio-panel wide">
        <div className="panel-head"><div><span>CONTENT</span><h2>Top videos</h2></div><small>Based on views in this period</small></div>
        {data?.topVideos.length ? <div className="analytics-video-list">{data.topVideos.map((v,i)=><div className="analytics-video" key={v.id}><b>{i+1}</b><div className="analytics-video-main"><strong>{v.caption||"Untitled video"}</strong><small>{v.mediaType} · {compact(v.views)} views · {compact(v.completedViews)} completed · {compact(v.likes)} likes</small><div className="earning-track"><i style={{width:Math.max(3,(v.views/maxTop)*100)+"%"}}/></div></div></div>)}</div> : <p>No content activity in this period.</p>}
      </article>

      <article className="studio-panel">
        <span>AUDIENCE</span><h2>Top viewer countries</h2>
        {topCountries.length ? <div className="country-list">{topCountries.map(c=><div className="country-row" key={c.countryCode}><div><strong>{c.countryCode}</strong><small>{compact(c.views)} views</small></div><b>{compact(c.viewers)}</b><i><em style={{width:Math.max(4,(c.viewers/maxCountry)*100)+"%"}}/></i></div>)}</div> : <p>No viewer country data yet.</p>}
      </article>

      <article className="studio-panel">
        <span>FOLLOWERS</span><h2>Audience growth</h2>
        <div className="wallet-lines">
          <div><span>Total followers</span><strong>{compact(data?.audience?.followerTotal??0)}</strong></div>
          <div><span>New in period</span><strong>+{compact(data?.audience?.newFollowers??0)}</strong></div>
        </div>
        {topFollowerCountries.length ? <div className="country-list">{topFollowerCountries.map(c=><div className="country-row" key={c.countryCode}><div><strong>{c.countryCode}</strong><small>followers</small></div><b>{compact(c.followers)}</b><i><em style={{width:Math.max(4,(c.followers/maxFollowerCountry)*100)+"%"}}/></i></div>)}</div> : <p>No follower country data yet.</p>}
      </article>

      <article className="studio-panel">
        <span>LIVE</span><h2>LIVE performance</h2>
        <div className="wallet-lines">
          <div><span>Streams</span><strong>{nf.format(data?.live.streams??0)}</strong></div>
          <div><span>LIVE time</span><strong>{hours(data?.live.totalDurationMs??0)}</strong></div>
          <div><span>Peak viewers</span><strong>{nf.format(data?.live.peakViewerCount??0)}</strong></div>
          <div><span>LIVE Gifts</span><strong>{usd(data?.live.giftsUsd??0)}</strong></div>
        </div>
      </article>

      <article className="studio-panel">
        <span>MONETIZATION</span><h2>Earnings</h2>
        <div className="wallet-lines">
          <div><span>Gross creator earnings</span><strong>{usd(data?.earnings.grossCreatorEarningsUsd??0)}</strong></div>
          <div><span>Cash credited</span><strong>{usd(data?.earnings.cashCreditedUsd??0)}</strong></div>
          <div><span>Diamonds</span><strong>{compact(data?.earnings.diamonds??0)}</strong></div>
        </div>
        <Link href="/creator/wallet" className="primary full">Open Wallet</Link>
      </article>

      <article className="studio-panel">
        <span>TRAFFIC SOURCES</span><h2>Where views come from</h2>
        {data?.trafficSources?.length ? <div className="country-list">{data.trafficSources.map(s=><div className="country-row" key={s.source}><div><strong>{s.source.replace(/_/g," ")}</strong><small>{compact(s.impressions)} impressions</small></div><b>{compact(s.views)}</b><i><em style={{width:Math.max(4,(s.views/Math.max(1,data.summary.views))*100)+"%"}}/></i></div>)}</div> : <p>No traffic-source data yet.</p>}
      </article>
    </section>
  </main>;
}
