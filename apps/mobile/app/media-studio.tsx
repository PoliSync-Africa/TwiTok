import { useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getAuthToken } from "../lib/auth";
import UnifiedMediaStudio, { DEFAULT_STUDIO_PLAN, StudioPlan } from "../components/unified-media-studio";

const API = process.env.EXPO_PUBLIC_TWITOK_API_URL ?? "http://localhost:4000/api/v1";

export default function MediaStudioScreen() {
  const params = useLocalSearchParams<{ uri?: string; mimeType?: string; mode?: string; duration?: string }>();
  const mode = String(params.mode ?? "VIDEO").toUpperCase() === "PHOTO" ? "PHOTO" : "VIDEO";
  const [plan, setPlan] = useState<StudioPlan>(DEFAULT_STUDIO_PLAN);
  const [processing, setProcessing] = useState(false);

  async function runAI() {
    const uri = String(params.uri ?? "");
    if (!uri) { Alert.alert("Media Studio", "Add a photo or video first."); return; }
    const token = await getAuthToken();
    if (!token) { Alert.alert("Media Studio", "Please sign in again."); return; }
    try {
      setProcessing(true);
      const blob = await (await fetch(uri)).blob();
      const mimeType = String(params.mimeType ?? blob.type ?? (mode === "PHOTO" ? "image/jpeg" : "video/mp4"));
      const endpoint = mode === "PHOTO" ? "/video/photos/uploads" : "/video/uploads";
      const body = mode === "PHOTO" ? {mimeType,sizeBytes:blob.size} : {mimeType,sizeBytes:blob.size,durationMs:Number(params.duration ?? 0)||undefined};
      const sessionResponse = await fetch(API+endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify(body)});
      const session=await sessionResponse.json().catch(()=>({}));
      if(!sessionResponse.ok || !session.uploadId || !session.uploadUrl) throw new Error(session.error||"Unable to prepare media.");
      const upload=await fetch(session.uploadUrl,{method:"PUT",headers:{"Content-Type":mimeType},body:blob});
      if(!upload.ok) throw new Error("Media upload failed.");
      const completeEndpoint=mode==="PHOTO"?"/video/photos/uploads/"+session.uploadId+"/complete":"/video/uploads/"+session.uploadId+"/complete";
      const complete=await fetch(API+completeEndpoint,{method:"POST",headers:{Authorization:"Bearer "+token}});
      if(!complete.ok) throw new Error("Unable to verify media.");
      const response=await fetch(API+"/ai-media/restyle",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({mode:mode==="PHOTO"?"IMAGE":"VIDEO",style:plan.filter==="PORTRAIT"?"PORTRAIT_PRO":"CLEAN",qualityProfile:plan.quality,aiTool:plan.aiTool,faceFilter:plan.faceFilter,background:plan.background,outputSpec:{contrast:true,denoise:true,sharpen:true,naturalSkin:true,preserveIdentity:true,qualityProfile:plan.quality},prompt:[plan.aiPrompt,plan.faceFilter!=="NONE"?`Apply the ${plan.faceFilter} face treatment naturally.`:"",plan.background!=="ORIGINAL"?`Use ${plan.background} background treatment.`:"",plan.quality==="12K_AI"?"Produce the highest practical AI resolution with premium detail reconstruction.":""].filter(Boolean).join(" "),sourceObjectKey:session.objectKey,targetResolution:plan.quality})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||"Unable to start AI Studio.");
      let outputUrl=String(data.outputUrl??"");
      if(!outputUrl && data.jobId) {
        for(let attempt=0; attempt<45; attempt++) {
          await new Promise(resolve=>setTimeout(resolve,2000));
          const jobResponse=await fetch(API+"/ai-media/jobs/"+encodeURIComponent(String(data.jobId)),{headers:{Authorization:"Bearer "+token}});
          const job=await jobResponse.json().catch(()=>({}));
          if(!jobResponse.ok) throw new Error(job.error||"Unable to check AI Studio.");
          if(["FAILED","ERROR","CANCELLED"].includes(String(job.status))) throw new Error(`AI Studio generation failed (${String(job.status)}).`);
          outputUrl=String(job.outputUrl??"");
          if(outputUrl) break;
        }
      }
      if(!outputUrl) throw new Error("AI Studio is still processing. Please try again shortly.");
      router.replace({pathname:"/create",params:{aiOutputUri:outputUrl,aiOutputMimeType:mode==="PHOTO"?"image/jpeg":"video/mp4",aiOutputDuration:String(params.duration??""),aiOutputMode:mode}});
    } catch(e) { Alert.alert("AI Studio",e instanceof Error?e.message:"Unable to process media."); } finally { setProcessing(false); }
  }

  return <UnifiedMediaStudio visible mode={mode} value={plan} onChange={setPlan} onClose={()=>router.back()} onRunAI={()=>void runAI()} />;
}