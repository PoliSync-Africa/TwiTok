"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";
const WEB_TOKEN_KEY = "twitok_web_session";

export default function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "authenticated">(
    pathname.startsWith("/auth") ? "authenticated" : "checking"
  );

  useEffect(() => {
    if (pathname.startsWith("/auth")) {
      setState("authenticated");
      return;
    }
    let cancelled = false;
    fetch(API + "/auth/me", {
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(typeof window !== "undefined" && localStorage.getItem(WEB_TOKEN_KEY)
          ? { Authorization: "Bearer " + localStorage.getItem(WEB_TOKEN_KEY) }
          : {})
      }
    })
      .then(response => {
        if (cancelled) return;
        if (response.ok) setState("authenticated");
        else { localStorage.removeItem(WEB_TOKEN_KEY); router.replace("/auth"); }
      })
      .catch(() => {
        if (!cancelled) router.replace("/auth");
      });
    return () => { cancelled = true; };
  }, [pathname, router]);

  if (pathname.startsWith("/auth")) return <>{children}</>;
  if (state !== "authenticated") {
    return <main style={{minHeight:"100dvh",display:"grid",placeItems:"center",background:"#050507",color:"#fff",fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:38,fontWeight:900}}>TwiTok</div><div style={{marginTop:10,color:"#92929b"}}>Checking your account…</div></div>
    </main>;
  }
  return <>{children}</>;
}
