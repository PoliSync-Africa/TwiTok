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
        <div style={{fontSize:46,marginBottom:12}}>🔐</div>
        <h1 style={{fontSize:30,margin:"0 0 10px"}}>Sign in to continue</h1>
        <p style={{color:"#aaa",lineHeight:1.6}}>You need a TwiTok account to complete this action.</p>
        <div style={{display:"grid",gap:10,marginTop:24}}>
          <Link href={"/login?next="+encodeURIComponent(safeNext)} style={{display:"block",padding:15,borderRadius:12,background:"#fe2c55",color:"#fff",fontWeight:900,textDecoration:"none"}}>Sign in</Link>
          <Link href={"/register?next="+encodeURIComponent(safeNext)} style={{display:"block",padding:15,borderRadius:12,background:"#25f4ee",color:"#000",fontWeight:900,textDecoration:"none"}}>Sign up</Link>
          <Link href={safeNext} style={{display:"block",padding:12,color:"#aaa",textDecoration:"none"}}>Cancel</Link>
        </div>
      </section>
    </main>
  );
}
