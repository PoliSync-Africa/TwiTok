"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Status = {
  isVerified: boolean;
  verificationType: string | null;
  status: string;
  verifiedAt: string | null;
  latestRequest: { requestId:string; type:string; status:string; createdAt:string; reviewedAt:string|null; rejectionReason:string|null } | null;
};

export default function VerificationPage() {
  const api=process.env.NEXT_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";
  const [status,setStatus]=useState<Status|null>(null);
  const [type,setType]=useState("PERSONAL");
  const [legalName,setLegalName]=useState("");
  const [displayName,setDisplayName]=useState("");
  const [website,setWebsite]=useState("");
  const [links,setLinks]=useState(["",""]);
  const [reason,setReason]=useState("");
  const [documentKey,setDocumentKey]=useState("");
  const [documentName,setDocumentName]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const token=typeof window!=="undefined"?window.localStorage.getItem("twitok_user_token"):"";

  async function load(){
    if(!token)return;
    const r=await fetch(api+"/verification/me",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const d=await r.json().catch(()=>({})); if(r.ok)setStatus(d);
  }
  useEffect(()=>{void load()},[api,token]);

  async function uploadDocument(file:File){
    setBusy(true); setMessage("");
    try{
      const r=await fetch(api+"/verification/document-upload-url",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({mimeType:file.type})});
      const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error??"Unable to prepare upload");
      const put=await fetch(d.uploadUrl,{method:"PUT",headers:{"Content-Type":file.type},body:file});
      if(!put.ok)throw new Error("Document upload failed");
      setDocumentKey(d.objectKey);setDocumentName(file.name);setMessage("Identity document uploaded securely.");
    }catch(e){setMessage(e instanceof Error?e.message:"Document upload failed");}
    finally{setBusy(false)}
  }

  async function submit(){
    if(!token)return setMessage("Please sign in first.");
    if(!documentKey)return setMessage("Upload your identity document first.");
    if(links.filter(x=>x.trim()).length<2)return setMessage("Add at least two credible public supporting links.");
    setBusy(true);setMessage("");
    try{
      const r=await fetch(api+"/verification/requests",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({type,legalName,displayName,website,supportingLinks:links.filter(Boolean),reason,identityDocumentKey:documentKey})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Verification request failed");
      setStatus(d);setMessage("Verification request submitted. TwiTok will review the evidence.");
    }catch(e){setMessage(e instanceof Error?e.message:"Verification request failed")}
    finally{setBusy(false)}
  }

  return <main className="studio verification-page">
    <header className="studio-top"><div><Link href="/creator/studio" className="back">← Creator Studio</Link><h1>Verification</h1><p>Request an official TwiTok verified badge for an authentic person, business or institution.</p></div></header>
    {status?.isVerified?<section className="studio-panel verify-status"><span>VERIFIED</span><h2>✓ Verified {status.verificationType?.toLowerCase()}</h2><p>Your badge is applied by TwiTok and cannot be self-added.</p></section>:null}
    {!status?.isVerified&&status?.status==="PENDING"?<section className="studio-panel verify-status"><span>UNDER REVIEW</span><h2>Your request is being reviewed</h2><p>Request ID: {status.latestRequest?.requestId}</p></section>:null}
    {!status?.isVerified&&status?.status!=="PENDING"?<section className="studio-panel">
      <span>APPLICATION</span><h2>Request verification</h2>
      <p className="verify-note">Verification is free. We review authenticity, account completeness, activity, uniqueness and credible public evidence. Follower and like counts are not used as a purchase path for verification.</p>
      <label>Verification type</label><select value={type} onChange={e=>setType(e.target.value)}><option value="PERSONAL">Personal</option><option value="BUSINESS">Business</option><option value="INSTITUTIONAL">Institutional</option></select>
      <label>Legal / registered name</label><input value={legalName} onChange={e=>setLegalName(e.target.value)} placeholder="Your legal or registered name"/>
      <label>Public display name</label><input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Name shown on TwiTok"/>
      <label>Website (optional)</label><input value={website} onChange={e=>setWebsite(e.target.value)} placeholder="https://example.com"/>
      <label>Why should this account be verified?</label><textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} placeholder="Explain who you represent and why people need to distinguish this account from impersonators."/>
      <label>Identity document</label><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadDocument(file)}}/>{documentName&&<small>✓ {documentName}</small>}
      <label>Credible public supporting links</label>{links.map((x,i)=><input key={i} value={x} onChange={e=>setLinks(v=>v.map((item,j)=>j===i?e.target.value:item))} placeholder={"News/article URL "+(i+1)}/>)}
      <button className="primary" disabled={busy} onClick={submit}>{busy?"Working...":"Submit verification request"}</button>
      {message&&<p className="verify-message">{message}</p>}
    </section>:null}
    <section className="studio-panel"><span>HOW IT WORKS</span><h2>Authenticity first</h2><div className="verify-steps"><div><b>1</b><span>Apply</span><small>Submit identity and public evidence.</small></div><div><b>2</b><span>Review</span><small>TwitTok checks the account and evidence.</small></div><div><b>3</b><span>Decision</span><small>Approved accounts receive the badge.</small></div></div></section>
  </main>;
}
