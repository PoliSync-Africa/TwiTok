"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function AuthRequiredPage() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <main style={{minHeight:"100vh",background:"#000",color:"#fff",display:"grid",placeItems:"center",padding:24}}>
      <section style={{width:"100%",maxWidth:440,background:"#111",border:"1px solid #292929",borderRadius:24,padding:32,textAlign:"center"}}>
        <h1 style={{fontSize:30,margin:"0 0 10px"}}>Sign in to continue</h1>
        <p style={{color:"#aaa",lineHeight:1.6}}>Sign in or create an account to continue.</p>
        <div className="auth-choice-buttons">
          <Link href={"/login?next="+encodeURIComponent(safeNext)} className="kente-button-wrap"><Link href={"/login?next="+encodeURIComponent(safeNext)} className="auth-primary">Sign in</Link></div>
          <Link href={"/register?next="+encodeURIComponent(safeNext)} className="kente-button-wrap"><Link href={"/register?next="+encodeURIComponent(safeNext)} className="auth-secondary">Sign up</Link></div>
          <Link href={safeNext} style={{display:"block",padding:12,color:"#aaa",textDecoration:"none"}}>Cancel</Link>
        </div>
      </section>
    </main>
  );
}
