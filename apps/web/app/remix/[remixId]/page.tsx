"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Remix={id:string;mode:"DUET"|"STITCH";status:string;sourceVideoId:string;sourceCaption:string;sourcePlayback?:{mp4Url?:string;hlsUrl?:string}|null;sourceThumbnail?:string|null;caption:string};

export default function RemixEditorPage(){
  const params=useParams<{remixId:string}>(); const router=useRouter();
  const api=process.env.NEXT_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";
  const [remix,setRemix]=useState<Remix|null>(null); const [caption,setCaption]=useState(""); const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false); const [recording,setRecording]=useState(false); const [mediaUrl,setMediaUrl]=useState(""); const [recorder,setRecorder]=useState<MediaRecorder|null>(null); const [recordingBlob,setRecordingBlob]=useState<Blob|null>(null);

  useEffect(()=>{const token=window.localStorage.getItem("twitok_user_token");if(!token)return;
    fetch(api+"/video/remixes/"+encodeURIComponent(params.remixId),{headers:{Authorization:"Bearer "+token},cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error??"Unable to load remix");setRemix(d.remix);setCaption(d.remix.caption??"")}).catch(e=>setMessage(e.message));
  },[api,params.remixId]);

  async function startRecording(){
    if(recording)return;
    if(!navigator.mediaDevices?.getUserMedia){setMessage("Camera and microphone recording is not supported on this device.");return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
      const chunks:Blob[]=[]; const mr=new MediaRecorder(stream);
      mr.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      mr.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mr.mimeType||"video/webm"});setRecordingBlob(blob);setMediaUrl(URL.createObjectURL(blob));setRecording(false);setRecorder(null)};
      mr.start(); setRecorder(mr); setRecording(true);
    }catch(e){setMessage(e instanceof Error?e.message:"Camera/microphone permission denied")}
  }
  function stopRecording(){recorder?.stop()}
  async function complete(){
    const token=window.localStorage.getItem("twitok_user_token"); if(!token||!remix||!recordingBlob)return;
    setSaving(true); setMessage("");
    try{
      const sessionRes=await fetch(api+"/video/remixes/"+encodeURIComponent(remix.id)+"/upload",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({mimeType:recordingBlob.type||"video/webm",sizeBytes:recordingBlob.size})});
      const session=await sessionRes.json(); if(!sessionRes.ok)throw new Error(session.error??"Unable to create upload");
      const put=await fetch(session.uploadUrl,{method:"PUT",headers:{"Content-Type":recordingBlob.type||"video/webm"},body:recordingBlob});
      if(!put.ok)throw new Error("Media upload failed");
      const r=await fetch(api+"/video/remixes/"+encodeURIComponent(remix.id)+"/complete",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({uploadId:session.uploadId,caption})});
      const d=await r.json(); if(!r.ok)throw new Error(d.error??"Unable to save remix");
      setRemix(d.remix); setRecordingBlob(null); setMessage("Remix recording uploaded and saved.");
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to save remix")}finally{setSaving(false)}
  }

  async function save(){const token=window.localStorage.getItem("twitok_user_token");if(!token||!remix)return;setSaving(true);setMessage("");
    try{const r=await fetch(api+"/video/remixes/"+encodeURIComponent(remix.id),{method:"PATCH",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({caption})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Unable to save");setRemix(d.remix);setMessage("Draft saved");}catch(e){setMessage(e instanceof Error?e.message:"Unable to save")}finally{setSaving(false)}
  }

  if(!remix)return <main className="remix-editor"><section><h1>Remix editor</h1><p>{message||"Loading…"}</p><Link href="/">Back to TwiTok</Link></section></main>;
  const src=remix.sourcePlayback?.mp4Url??remix.sourcePlayback?.hlsUrl;
  return <main className="remix-editor"><section className="remix-panel">
    <header><Link href="/">TwiTok</Link><strong>{remix.mode==="DUET"?"Duet":"Stitch"} draft</strong></header>
    <div className="remix-source">{src?<video src={src} poster={remix.sourceThumbnail??undefined} controls playsInline/>:<div>No preview available</div>}<p>{remix.sourceCaption||"Original video"}</p></div>
    <div className="remix-recording">{mediaUrl?<video src={mediaUrl} controls playsInline/>:<div className="remix-camera-placeholder">Camera preview will appear while recording.</div>}
      <div className="remix-actions"><button type="button" onClick={recording?stopRecording:startRecording}>{recording?"Stop recording":"Record remix"}</button>{mediaUrl&&<button type="button" onClick={complete} disabled={saving}>{saving?"Saving…":"Save recording"}</button>}</div>
    </div>
    <label>Your caption<textarea value={caption} onChange={e=>setCaption(e.target.value)} maxLength={2200} placeholder="Add a caption…"/></label>
    <div className="remix-actions"><button type="button" onClick={save} disabled={saving}>{saving?"Saving…":"Save draft"}</button><button type="button" onClick={()=>router.push("/")} className="secondary">Back to feed</button></div>
    {message&&<p className="remix-message">{message}</p>}
    <p className="remix-note">This draft preserves the original video reference. The recording/composition step can be added without changing the source attribution.</p>
  </section></main>;
}
