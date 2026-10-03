import type { Db } from "mongodb";

export type SafetyDecision = "ALLOW" | "RESTRICT" | "WARN_EDIT" | "BLOCK" | "ESCALATE";
export type SafetyRisk = "LOW" | "MEDIUM" | "HIGH" | "SEVERE";
export type ModerationCaseStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";

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
    db.collection("moderation_cases").createIndex({ reportId: 1 }, { unique: true, sparse: true }),
    db.collection("moderation_cases").createIndex({ assigneeId: 1, status: 1, updatedAt: -1 }),
    db.collection("moderation_case_events").createIndex({ caseId: 1, createdAt: -1 }),
    db.collection("appeals").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("user_mutes").createIndex({ muterId: 1, mutedId: 1 }, { unique: true }),
    db.collection("user_mutes").createIndex({ muterId: 1, createdAt: -1 }),
    db.collection("user_reports").createIndex({ reporterId: 1, createdAt: -1 }),
    db.collection("user_reports").createIndex({ targetType: 1, targetId: 1, createdAt: -1 }),
    db.collection("user_reports").createIndex({ reporterId: 1, targetType: 1, targetId: 1, status: 1 })
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

export async function listModerationCases(db: Db, input: { status?: ModerationCaseStatus; limit?: number }) {
  const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 100);
  const filter = input.status ? { status: input.status } : {};
  return db.collection("moderation_cases")
    .find(filter)
    .sort({ priority: -1, createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function updateModerationCase(db: Db, caseId: string, input: {
  status?: ModerationCaseStatus;
  assigneeId?: string | null;
  resolution?: string;
  reviewerId: string;
}) {
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(caseId)) throw new Error("Invalid moderation case id");
  const existing = await db.collection("moderation_cases").findOne({ _id: new ObjectId(caseId) });
  if (!existing) throw new Error("Moderation case not found");
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (input.status) update.status = input.status;
  if (input.assigneeId !== undefined) update.assigneeId = input.assigneeId;
  if (input.resolution !== undefined) update.resolution = String(input.resolution).slice(0, 2000);
  update.lastReviewedBy = input.reviewerId;
  await db.collection("moderation_cases").updateOne({ _id: new ObjectId(caseId) }, { $set: update });
  await db.collection("moderation_case_events").insertOne({
    caseId,
    reviewerId: input.reviewerId,
    changes: update,
    createdAt: new Date()
  });
  return db.collection("moderation_cases").findOne({ _id: new ObjectId(caseId) });
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
  const existing = await db.collection("user_reports").findOne({
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    status: "OPEN"
  }, { projection: { _id: 1, reportId: 1 } });
  if (existing) return { reportId: existing._id.toHexString(), duplicate: true };
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
  const reportId = result.insertedId.toHexString();
  await db.collection("moderation_cases").insertOne({
    reportId,
    source: "USER_REPORT",
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: record.reason,
    details: record.details,
    priority: "NORMAL",
    status: "OPEN",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  });
  return { ...record, reportId };
}
