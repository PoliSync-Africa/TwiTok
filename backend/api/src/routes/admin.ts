import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo.js";
import { createOwnerToken, ensureOwnerAccount, verifyOwner } from "../auth/owner.js";
import { requireOwner } from "../auth/admin-middleware.js";
import { rateLimit, authRateLimit } from "../security/rate-limit.js";
import { verifyTotp } from "../security/totp.js";

export const adminRouter = Router();

adminRouter.post("/auth/login", rateLimit({windowMs:15*60*1000,max:6,key:authRateLimit}), async (req,res)=>{
  try {
    const {email,password,mfaCode}=req.body??{};
    if(typeof email!=="string"||typeof password!=="string") return res.status(400).json({error:"Email and password are required"});
    const db=await getDb(); await ensureOwnerAccount(db);
    const owner=await verifyOwner(db,email,password);
    if(!owner) return res.status(401).json({error:"Invalid administrator credentials"});
    let mfaVerified=!owner.mfaRequired;
    if(owner.mfaRequired){
      const secret=process.env.TWITOK_OWNER_MFA_SECRET;
      if(!secret) return res.status(503).json({error:"Administrator MFA is enabled but not configured"});
      mfaVerified=typeof mfaCode==="string" && verifyTotp(mfaCode,secret);
      if(!mfaVerified) return res.status(401).json({error:"Valid administrator MFA code required",mfaRequired:true});
    }
    const token=createOwnerToken(owner,mfaVerified);
    await db.collection("audit_logs").insertOne({actorId:String(owner._id),actorRole:"OWNER",action:"OWNER_LOGIN",resourceType:"ADMIN_SESSION",createdAt:new Date()});
    return res.json({token,administrator:{id:String(owner._id),displayName:owner.displayName,email:owner.email,role:owner.role,mfaRequired:owner.mfaRequired}});
  } catch { return res.status(500).json({error:"Administrator authentication is unavailable"}); }
});
adminRouter.get("/auth/me",requireOwner,async(req,res)=>{
  try {
    const db=await getDb();
    const owner=await db.collection("owner_accounts").findOne({_id:req.ownerId},{projection:{displayName:1,email:1,role:1,mfaRequired:1}});
    if(!owner) return res.status(401).json({error:"Administrator session expired"});
    return res.json({administrator:{id:String(owner._id),displayName:owner.displayName,email:owner.email,role:owner.role,mfaRequired:owner.mfaRequired}});
  } catch {
    return res.status(500).json({error:"Unable to load administrator session"});
  }
});
adminRouter.get("/overview",requireOwner,async(req,res)=>{
  try {
    const db=await getDb();
    const [users,videos,reports,live,creators,streams,wallets,withdrawals,ledgerTotals]=await Promise.all([
      db.collection("users").countDocuments(),db.collection("videos").countDocuments({status:"PUBLISHED"}),
      db.collection("moderation_cases").countDocuments({status:"OPEN"}),db.collection("live_streams").countDocuments({status:"LIVE"}),
      db.collection("creator_profiles").countDocuments(),db.collection("live_streams").countDocuments(),db.collection("wallets").countDocuments(),
      db.collection("withdrawals").countDocuments({status:"PENDING"}),db.collection("financial_ledger").aggregate([{$group:{_id:null,grossUsd:{$sum:"$grossUsd"},platformUsd:{$sum:"$platformUsd"},creatorUsd:{$sum:"$creatorUsd"}}}]).toArray()
    ]);
    return res.json({users,videos,reports,live,creators,streams,wallets,pendingWithdrawals:withdrawals,money:ledgerTotals[0]??{grossUsd:0,platformUsd:0,creatorUsd:0}});
  } catch { return res.status(500).json({error:"Unable to load administrator overview"}); }
});