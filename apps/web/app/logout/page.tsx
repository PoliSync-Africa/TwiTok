"use client";
import { useEffect } from "react";
import { signOut } from "../../lib/auth";
export default function LogoutPage(){useEffect(()=>{void signOut().then(()=>window.location.replace("/"))},[]);return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#050505",color:"#fff"}}>Signing you out…</main>}
