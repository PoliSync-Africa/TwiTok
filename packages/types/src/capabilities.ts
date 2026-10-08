export type CapabilityStatus = "CORE" | "PARTIAL" | "PROVIDER_DEPENDENT" | "PLANNED";

export type TwiTokCapability = {
  id: string;
  domain: string;
  status: CapabilityStatus;
  surfaces: string[];
  dependencies: string[];
};

export const TWITOK_CAPABILITIES: TwiTokCapability[] = [
  { id:"identity.auth", domain:"Identity", status:"CORE", surfaces:["signup","login","logout","profile-setup"], dependencies:["mongodb","http-only-session-cookie"] },
  { id:"identity.recovery", domain:"Identity", status:"PARTIAL", surfaces:["password-reset","account-recovery","security"], dependencies:["email-provider","sms-provider"] },
  { id:"identity.devices", domain:"Security", status:"PARTIAL", surfaces:["sessions","devices","revoke-all"], dependencies:["mongodb","session-version"] },
  { id:"profile.social-graph", domain:"Profile", status:"CORE", surfaces:["profile","follow","followers","following","block","mute"], dependencies:["mongodb"] },
  { id:"feed.for-you", domain:"Discovery", status:"CORE", surfaces:["for-you","following","discovery","not-interested"], dependencies:["feed-events","redis","safety-engine"] },
  { id:"feed.personalization", domain:"Discovery", status:"PARTIAL", surfaces:["topics","keyword-filters","refresh-feed","diversity"], dependencies:["feed-events","recommendation-worker"] },
  { id:"creation.media", domain:"Creation", status:"CORE", surfaces:["camera","gallery","photo","video","text","upload"], dependencies:["cloudflare-stream-or-s3","processing-workers"] },
  { id:"creation.editor", domain:"Creation", status:"CORE", surfaces:["trim","clips","speed","effects","stickers","captions","sounds","cover"], dependencies:["media-pipeline"] },
  { id:"stories", domain:"Social", status:"CORE", surfaces:["stories","replies","reactions"], dependencies:["media-pipeline"] },
  { id:"messaging", domain:"Social", status:"CORE", surfaces:["dm","voice","delivery","read","blocking"], dependencies:["websocket","redis"] },
  { id:"notifications", domain:"Social", status:"CORE", surfaces:["activity","security","system","creator"], dependencies:["websocket","mongodb"] },
  { id:"live", domain:"LIVE", status:"CORE", surfaces:["host","guests","moderators","chat","gifts","replay"], dependencies:["livekit","redis","media-storage"] },
  { id:"creator.studio", domain:"Creator", status:"CORE", surfaces:["content","comments","analytics","monetization"], dependencies:["analytics","safety","mongodb"] },
  { id:"monetization", domain:"Money", status:"CORE", surfaces:["coins","gifts","subscriptions","rewards","wallet","withdrawals"], dependencies:["ledger","payment-providers","risk"] },
  { id:"safety", domain:"Trust", status:"CORE", surfaces:["reports","moderation","appeals","age-policy","restricted-mode"], dependencies:["safety-engine","admin"] },
  { id:"verification", domain:"Trust", status:"CORE", surfaces:["apply","review","badge","status"], dependencies:["admin","audit-log"] },
  { id:"ai-media", domain:"AI", status:"PROVIDER_DEPENDENT", surfaces:["background","relight","object-removal","enhancement","captions"], dependencies:["ai-provider","media-pipeline"] },
  { id:"commerce", domain:"Business", status:"PLANNED", surfaces:["creator-marketplace","brand-collaboration","commerce"], dependencies:["monetization","business-accounts","regional-policy"] },
  { id:"admin", domain:"Operations", status:"CORE", surfaces:["users","content","reports","announcements","staff","audit"], dependencies:["rbac","audit-log"] },
  { id:"observability", domain:"Platform", status:"PARTIAL", surfaces:["health","metrics","logs","alerts"], dependencies:["render","redis","mongodb"] }
];

export function getCapability(id: string) {
  return TWITOK_CAPABILITIES.find(capability => capability.id === id) ?? null;
}
