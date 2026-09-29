import { ObjectId, type Db } from "mongodb";
import { createNotification } from "./notifications.js";
import { createPresignedPlayback, verifyMediaObject } from "../media/storage.js";

function videoObjectId(videoId: string) { if (!ObjectId.isValid(videoId)) throw new Error("Invalid video id"); return new ObjectId(videoId); }
async function getPublicVideo(db: Db, videoId: ObjectId) {
  const video = await db.collection("videos").findOne({ _id: videoId, status: "PUBLISHED", visibility: "PUBLIC" }, { projection: { _id: 1, allowComments: 1, ownerId: 1 } });
  if (!video) throw new Error("Video not found");
  return video;
}
export async function initializeEngagementIndexes(db: Db) {
  await Promise.all([
    db.collection("video_likes").createIndex({ videoId: 1, userId: 1 }, { unique: true }),
    db.collection("video_likes").createIndex({ videoId: 1, createdAt: -1 }),
    db.collection("video_saves").createIndex({ videoId: 1, userId: 1 }, { unique: true }),
    db.collection("video_saves").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("video_comments").createIndex({ videoId: 1, createdAt: -1 }),
    db.collection("video_comments").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("comment_likes").createIndex({ commentId: 1, userId: 1 }, { unique: true }),
    db.collection("comment_likes").createIndex({ commentId: 1, createdAt: -1 }),
    db.collection("video_shares").createIndex({ videoId: 1, createdAt: -1 }),
    db.collection("video_reposts").createIndex({ videoId: 1, userId: 1 }, { unique: true })
  ]);
}
export async function getEngagement(db: Db, userId: ObjectId, videoIdString: string) { const videoId=videoObjectId(videoIdString); await getPublicVideo(db,videoId); const [likes,comments,shares,saves,reposts,liked,saved,reposted]=await Promise.all([db.collection("video_likes").countDocuments({videoId}),db.collection("video_comments").countDocuments({videoId,status:{$ne:"DELETED"}}),db.collection("video_shares").countDocuments({videoId}),db.collection("video_saves").countDocuments({videoId}),db.collection("video_reposts").countDocuments({videoId}),db.collection("video_likes").findOne({videoId,userId},{projection:{_id:1}}),db.collection("video_saves").findOne({videoId,userId},{projection:{_id:1}}),db.collection("video_reposts").findOne({videoId,userId},{projection:{_id:1}})]); return {likeCount:likes,commentCount:comments,shareCount:shares,saveCount:saves,repostCount:reposts,liked:Boolean(liked),saved:Boolean(saved),reposted:Boolean(reposted)}; }
export async function toggleLike(db: Db,userId:ObjectId,videoIdString:string){const videoId=videoObjectId(videoIdString);await getPublicVideo(db,videoId);const existing=await db.collection("video_likes").findOne({videoId,userId},{projection:{_id:1}});if(existing){await db.collection("video_likes").deleteOne({_id:existing._id});return{liked:false};}await db.collection("video_likes").insertOne({videoId,userId,createdAt:new Date()});const video=await getPublicVideo(db,videoId);if(video.ownerId)await createNotification(db,{recipientId:video.ownerId,actorId:userId,type:"LIKE",videoId});return{liked:true};}
export async function toggleSave(db: Db,userId:ObjectId,videoIdString:string){const videoId=videoObjectId(videoIdString);await getPublicVideo(db,videoId);const existing=await db.collection("video_saves").findOne({videoId,userId},{projection:{_id:1}});if(existing){await db.collection("video_saves").deleteOne({_id:existing._id});return{saved:false};}await db.collection("video_saves").insertOne({videoId,userId,createdAt:new Date()});return{saved:true};}
export async function addComment(db: Db,userId:ObjectId,videoIdString:string,text:string,attachments:Array<{objectKey:string;mimeType:string}>=[],parentId?:string){
  const videoId=videoObjectId(videoIdString);const video=await getPublicVideo(db,videoId);if(video.allowComments===false)throw new Error("Comments are disabled for this video");
  const body=String(text??"").trim();if(!body&&!attachments.length)throw new Error("Comment cannot be empty");if(body.length>500)throw new Error("Comment is limited to 500 characters");if(attachments.length>4)throw new Error("A comment can contain up to 4 media attachments");
  const ownerSettings=await db.collection("users").findOne({_id:video.ownerId},{projection:{commentSettings:1}});const settings=ownerSettings?.commentSettings??{allowComments:true,filterAll:false,filterSpam:true,filterKeywords:[]};if(settings.allowComments===false)throw new Error("Comments are disabled for this creator");
  const lowered=body.toLowerCase();const keywordHit=(settings.filterKeywords??[]).some((keyword:string)=>keyword&&lowered.includes(keyword));const spamHit=settings.filterSpam&&/(https?:\/\/|www\.|buy now|free money|crypto giveaway)/i.test(body);if(settings.filterAll||keywordHit||spamHit)throw new Error("Comment blocked by your comment filters");
  for(const a of attachments){
    if(!a.objectKey.startsWith("comment-media/"+userId.toHexString()+"/"))throw new Error("Invalid comment attachment");
    if(!new RegExp("^(image/(jpeg|png|webp|gif)|video/(mp4|quicktime|webm)|audio/(mpeg|mp4|x-m4a|wav|webm))$","i").test(a.mimeType))throw new Error("Unsupported comment media type");
    const max=a.mimeType.startsWith("image/")?20*1024*1024:a.mimeType.startsWith("video/")?100*1024*1024:25*1024*1024;
    const verified=await verifyMediaObject(a.objectKey,a.mimeType,max);
    if(verified.sizeBytes<=0)throw new Error("Invalid comment attachment");
  }
  let parentObjectId:ObjectId|undefined;if(parentId){if(!ObjectId.isValid(parentId))throw new Error("Invalid parent comment");const parent=await db.collection("video_comments").findOne({_id:new ObjectId(parentId),videoId,status:"ACTIVE"},{projection:{_id:1}});if(!parent)throw new Error("Parent comment not found");if(parent.parentId)throw new Error("Replies can only be one level deep");parentObjectId=new ObjectId(parentId);}
  const createdAt=new Date();const result=await db.collection("video_comments").insertOne({videoId,userId,text:body,status:"ACTIVE",createdAt,updatedAt:createdAt,attachments,...(parentObjectId?{parentId:parentObjectId}:{})});
  if(video.ownerId)await createNotification(db,{recipientId:video.ownerId,actorId:userId,type:"COMMENT",videoId,commentId:result.insertedId});
  const mentioned=[...new Set((body.match(/@[a-z0-9._]{3,24}/gi)??[]).map(x=>x.slice(1).toLowerCase()))].slice(0,20);if(mentioned.length){const users=await db.collection("users").find({username:{$in:mentioned}},{projection:{_id:1}}).toArray());for(const user of users)await createNotification(db,{recipientId:user._id,actorId:userId,type:"MENTION",videoId,commentId:result.insertedId});}
  return{id:result.insertedId.toHexString(),userId:userId.toHexString(),text:body,createdAt,parentId:parentObjectId?.toHexString()??null,likeCount:0,liked:false,replyCount:0,attachments:await Promise.all(attachments.map(async a=>({...a,url:(await createPresignedPlayback(a.objectKey,900)).url})))};
}
