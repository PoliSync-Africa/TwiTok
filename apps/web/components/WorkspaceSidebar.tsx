"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FeedSurface = "FOR_YOU" | "FOLLOWING" | "AFRICA";

const exploreCategories = [
  "All","Singing & dancing","Comedy","Sports","Anime and comics","Relationship","Shows","Lipsync",
  "Daily Life","Beauty","Games","Society","Outfit","Cars","Food","Animals","Family","Drama",
  "Fitness and Health","Education","Technology"
];

const dramaGroups = {
  "Settings / themes": ["rural","urban","survival"],
  "Characters": ["revenge","celebrities"],
  "Stories": ["second chance","lucky baby"],
  "Releases": ["within 7 days","within 30 days"]
};

function Icon({ children }: { children: string }) {
  return <span className="workspace-icon" aria-hidden="true">{children}</span>;
}

export default function WorkspaceSidebar({
  collapsed,
  onToggle,
  tab,
  onTabChange,
  category,
  onCategoryChange
}: {
  collapsed: boolean;
  onToggle: () => void;
  tab: FeedSurface;
  onTabChange: (surface: FeedSurface) => void;
  category: string;
  onCategoryChange: (value: string) => void;
}) {
  const [exploreOpen, setExploreOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [dramasOpen, setDramasOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [theme, setTheme] = useState<"dark"|"light"|"system">("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("twitok-web-theme");
    const next = saved === "light" || saved === "system" ? saved : "dark";
    setTheme(next);
    document.documentElement.dataset.twitokTheme = next;
  }, []);

  function setThemeMode(next: "dark"|"light"|"system") {
    setTheme(next);
    window.localStorage.setItem("twitok-web-theme", next);
    document.documentElement.dataset.twitokTheme = next;
  }

  function searchCategory(value: string) {
    onCategoryChange(value === "All" ? "" : value);
    onTabChange("FOR_YOU");
  }

  return <aside className={"rail desktop-workspace " + (collapsed ? "workspace-collapsed" : "")} aria-label="TwiTok desktop workspace">
    <div className="workspace-brand-row">
      <Link href="/" className="workspace-logo" aria-label="TwiTok home">
        <span className="logo-word">TwiTok</span><span className="logo-mark" aria-hidden="true" />
      </Link>
      <button className="workspace-collapse" type="button" onClick={onToggle} aria-label={collapsed ? "Expand workspace" : "Collapse workspace"}>{collapsed ? "›" : "‹"}</button>
    </div>

    <form className="workspace-search" onSubmit={event => {
      event.preventDefault();
      const q = (event.currentTarget.elements.namedItem("q") as HTMLInputElement)?.value.trim();
      window.location.href = q ? "/discover?q=" + encodeURIComponent(q) : "/discover";
    }}>
      <span aria-hidden="true">⌕</span>
      <input name="q" type="search" placeholder={collapsed ? "Search" : "Search"} aria-label="Search TwiTok" />
    </form>

    <nav className="workspace-scroll" aria-label="Desktop navigation">
      <div className="workspace-section">
        <button className="workspace-section-trigger" type="button" onClick={() => setExploreOpen(v => !v)}>
          <Icon>⌂</Icon><span>For You</span><b>{tab === "FOR_YOU" && !category ? "●" : ""}</b>
        </button>
        {!collapsed && <button className={"workspace-subitem " + (!category && tab === "FOR_YOU" ? "active" : "")} type="button" onClick={() => { onCategoryChange(""); onTabChange("FOR_YOU"); }}>Home feed</button>}
      </div>

      <div className="workspace-section">
        <button className="workspace-section-trigger" type="button" onClick={() => setExploreOpen(v => !v)}>
          <Icon>⌕</Icon><span>Explore</span><b>{exploreOpen ? "−" : "+"}</b>
        </button>
        {!collapsed && exploreOpen && <div className="workspace-nested">
          {exploreCategories.map(item => <button key={item} type="button" className={"workspace-subitem " + ((category || "All") === item ? "active" : "")} onClick={() => searchCategory(item)}>{item}</button>)}
        </div>}
      </div>

      <button className={"workspace-link " + (tab === "FOLLOWING" ? "active" : "")} type="button" onClick={() => { onCategoryChange(""); onTabChange("FOLLOWING"); }}><Icon>♡</Icon><span>Following</span></button>

      <div className="workspace-section">
        <button className="workspace-section-trigger" type="button" onClick={() => setFriendsOpen(v => !v)}>
          <Icon>♧</Icon><span>Friends</span><b>{friendsOpen ? "−" : "+"}</b>
        </button>
        {!collapsed && friendsOpen && <div className="workspace-nested">
          <Link href="/discover?mode=friends&view=mutual">Mutual follows</Link>
          <Link href="/discover?mode=friends&view=following-you">People you follow who follow you</Link>
          <Link href="/discover?mode=friends&view=username">Username search</Link>
          <Link href="/discover?mode=friends&view=facebook">Facebook discovery</Link>
          <Link href="/discover?mode=friends&view=qr">QR-code discovery</Link>
          <Link href="/discover?mode=friends&view=suggestions">Friend suggestions</Link>
          <Link href="/discover?mode=friends&view=contacts">Contacts</Link>
        </div>}
      </div>

      <div className="workspace-section">
        <button className="workspace-section-trigger" type="button" onClick={() => setDramasOpen(v => !v)}>
          <Icon>▤</Icon><span>Short dramas</span><b>{dramasOpen ? "−" : "+"}</b>
        </button>
        {!collapsed && dramasOpen && <div className="workspace-nested">
          <Link href="/short-dramas?filter=all">All</Link><Link href="/short-dramas?filter=ranking">Ranking</Link><Link href="/short-dramas?filter=latest">Latest</Link>
          {Object.entries(dramaGroups).map(([group, values]) => <div className="workspace-group" key={group}><small>{group}</small>{values.map(value => <Link key={value} href={"/short-dramas?filter=" + encodeURIComponent(value)}>{value}</Link>)}</div>)}
        </div>}
      </div>

      <Link className="workspace-link" href="/live"><Icon>◉</Icon><span>LIVE</span></Link>
      <Link className="workspace-link" href="/messages"><Icon>✉</Icon><span>Messages</span></Link>
      <Link className="workspace-link" href="/inbox"><Icon>♡</Icon><span>Activity</span></Link>
      <Link className="workspace-link" href="/create"><Icon>＋</Icon><span>Upload</span></Link>
      <Link className="workspace-link" href="/profile"><Icon>♙</Icon><span>Profile</span></Link>

      <div className="workspace-divider" />

      <div className="workspace-section">
        <button className="workspace-section-trigger" type="button" onClick={() => setCompanyOpen(v => !v)}><Icon>◆</Icon><span>Company</span><b>{companyOpen ? "−" : "+"}</b></button>
        {!collapsed && companyOpen && <div className="workspace-nested">
          {["Program","TwiTok for Good","Advertise","Sell on TwiTok Shop","TwiTok LIVE Creator Networks","Developers","Transparency","TwiTok Embeds","SoundOn Music Distribution","TwiTok Live","Terms & Policies"].map(item => <Link key={item} href={item === "Terms & Policies" ? "/terms" : item === "Sell on TwiTok Shop" ? "/wallet" : "/feedback"}>{item}</Link>)}
          <small>© 2026 TwiTok</small>
        </div>}
      </div>

      <div className="workspace-section">
        <button className="workspace-section-trigger" type="button" onClick={() => setMoreOpen(v => !v)}><Icon>⚙</Icon><span>More / Settings</span><b>{moreOpen ? "−" : "+"}</b></button>
        {!collapsed && moreOpen && <div className="workspace-nested">
          <Link href="/settings">General</Link>
          <button type="button" onClick={() => window.alert("Language follows your TwiTok account preference.")}>Language</button>
          <button type="button" onClick={() => setThemeMode("dark")}>Dark mode</button>
          <button type="button" onClick={() => setThemeMode("light")}>Light mode</button>
          <button type="button" onClick={() => setThemeMode("system")}>Automatic</button>
          <small>Current: {theme}</small>
        </div>}
      </div>

      <div className="workspace-section">
        <button className="workspace-section-trigger" type="button" onClick={() => setToolsOpen(v => !v)}><Icon>✦</Icon><span>Tools</span><b>{toolsOpen ? "−" : "+"}</b></button>
        {!collapsed && toolsOpen && <div className="workspace-nested">
          <Link href="/studio">TwiTok Studio</Link>
          <Link href="/create?tool=effects">Create TwiTok effects</Link>
          <Link href="/create?tool=promote">Promote post</Link>
          <Link href="/live">LIVE tools</Link>
          <Link href="/wallet">Get Coins</Link>
          <Link href="/wallet">Sell on TwiTok Shop</Link>
        </div>}
      </div>

      <Link className="workspace-link" href="/feedback"><Icon>?</Icon><span>Help Center</span></Link>
    </nav>

    <div className="rail-bottom workspace-footer">
      <Link className="workspace-link" href="/logout"><Icon>↪</Icon><span>Log Out</span></Link>
    </div>
  </aside>