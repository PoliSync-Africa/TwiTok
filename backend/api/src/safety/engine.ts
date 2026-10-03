import type { Db } from "mongodb";

export type SafetyDecision = "ALLOW" | "RESTRICT" | "WARN_EDIT" | "BLOCK" | "ESCALATE";
export type SafetyRisk = "LOW" | "MEDIUM" | "HIGH" | "SEVERE";

const blockedPatterns = [
  /\bkill yourself\b/i,
  /\bgo die\b/i,
  /\bchild porn\b/i
];

export async function initializeSafetyIndexes(db: Db) {
  await Promise.all([
    db.collection("moderation_events").createIndex({ contentId: 1, createdAt: -1 }),
    db.collection("moderation_events").createIndex({ decision: 1, createdAt: -1 }),
    db.collection("moderation_cases").createIndex({ status: 1, priority: -1, createdAt: -1 }),
    db.collection("appeals").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("user_mutes").createIndex({ muterId: 1, mutedId: 1 }, { unique: true }),
    db.collection("user_mutes").createIndex({ muterId: 1, createdAt: -1 }),
    db.collection("user_reports").createIndex({ reporterId: 1, createdAt: -1 }),
    db.collection("user_reports").createIndex({ targetType: 1, targetId: 1, createdAt: -1 })
  ]);
}

export async function evaluateText(db: Db, input: { userId:string; contentId:string; text:string; actionType:string }): Promise<{ decision: SafetyDecision; risk: SafetyRisk; confidence: number; policyId: string; reviewStatus: string; userId: string; contentId: string; text: string; actionType: string; createdAt: Date }> {
  const text = String(input.text ?? "");
  const severe = blockedPatterns.some((pattern) => pattern.test(text));
  const decision: SafetyDecision = severe ? "BLOCK" : "ALLOW";
  const risk: SafetyRisk = severe ? "SEVERE" : "LOW";
  const event = {
    ...input,
    policyId: severe ? "TT-SAFETY-SEVERE-CONTENT" : "TT-SAFETY-TEXT-BASELINE",
    risk,
    confidence: severe ? 0.98 : 0.99,
    decision,
    reviewStatus: severe ? "NOT_REQUIRED" : "NOT_REQUIRED",
    createdAt: new Date()
  };
  await db.collection("moderation_events").insertOne(event);
  return event;
}

export async function openHumanReview(db: Db, input: { userId:string; contentId:string; reason:string; priority?:string }) {
  const caseRecord = {
    ...input,
    priority: input.priority ?? "NORMAL",
    status: "OPEN",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const result = await db.collection("moderation_cases").insertOne(caseRecord);
  return { ...caseRecord, caseId: String(result.insertedId) };
}

export type SafetyReportTarget = "USER" | "VIDEO" | "COMMENT" | "LIVE";

export async function muteUser(db: Db, muterId: string, mutedId: string) {
  if (!muterId || !mutedId || muterId === mutedId) throw new Error("Invalid user to mute");
  await db.collection("user_mutes").updateOne(
    { muterId, mutedId },
    { $setOnInsert: { muterId, mutedId, createdAt: new Date() } },
    { upsert: true }
  );
  return { muterId, mutedId, muted: true };
}

export async function unmuteUser(db: Db, muterId: string, mutedId: string) {
  await db.collection("user_mutes").deleteOne({ muterId, mutedId });
  return { muterId, mutedId, muted: false };
}

export async function listMutedUsers(db: Db, muterId: string) {
  return db.collection("user_mutes")
    .find({ muterId }, { projection: { _id: 0, mutedId: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();
}

export async function isMuted(db: Db, viewerId: string, authorId: string) {
  if (!viewerId || !authorId) return false;
  return Boolean(await db.collection("user_mutes").findOne({ muterId: viewerId, mutedId: authorId }, { projection: { _id: 1 } }));
}

export async function openUserReport(db: Db, input: {
  reporterId: string;
  targetType: SafetyReportTarget;
  targetId: string;
  reason: string;
  details?: string;
}) {
  if (!input.reporterId || !input.targetId || !input.reason) throw new Error("reporterId, targetId and reason are required");
  const record = {
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: String(input.reason).slice(0, 120),
    details: String(input.details ?? "").slice(0, 2000),
    status: "OPEN",
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const result = await db.collection("user_reports").insertOne(record);
  return { ...record, reportId: result.insertedId.toHexString() };
}
