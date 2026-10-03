import type { Db } from "mongodb";
import { createHash } from "node:crypto";

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
    db.collection("moderation_evidence").createIndex({ caseId: 1, createdAt: -1 }),
    db.collection("moderation_actions").createIndex({ caseId: 1, createdAt: -1 }),
    db.collection("moderation_actions").createIndex({ targetUserId: 1, status: 1, createdAt: -1 }),
    db.collection("moderation_action_events").createIndex({ actionId: 1, createdAt: -1 }),
    db.collection("appeals").createIndex({ caseId: 1, userId: 1 }, { unique: true }),
    db.collection("appeals").createIndex({ status: 1, createdAt: -1 }),
    db.collection("appeal_events").createIndex({ appealId: 1, createdAt: -1 }),
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

export type AppealStatus = "OPEN" | "IN_REVIEW" | "UPHELD" | "OVERTURNED" | "CLOSED";

export type ModerationAction = "CONTENT_BLOCK" | "CONTENT_RESTORE" | "ACCOUNT_RESTRICT" | "ACCOUNT_RESTORE";

export async function rollbackModerationAction(db: Db, input: {
  actionId: string;
  actorId: string;
}) {
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(input.actionId)) throw new Error("Invalid moderation action id");
  const filter = { _id: new ObjectId(input.actionId) };
  const action = await db.collection("moderation_actions").findOne(filter);
  if (!action) throw new Error("Moderation action not found");
  if (action.reversible !== true) throw new Error("Moderation action is not reversible");
  if (action.status !== "APPLIED") throw new Error("Moderation action is not currently applied");
  const result = await db.collection("moderation_actions").updateOne(
    { ...filter, status: "APPLIED" },
    { $set: { status: "ROLLED_BACK", rolledBackBy: input.actorId, rolledBackAt: new Date() } }
  );
  if (result.matchedCount !== 1) throw new Error("Moderation action changed concurrently; refresh and retry");
  await db.collection("moderation_action_events").insertOne({
    actionId: input.actionId,
    actorId: input.actorId,
    event: "ROLLBACK",
    createdAt: new Date()
  });
  return db.collection("moderation_actions").findOne(filter);
}

export async function recordModerationAction(db: Db, input: {
  caseId: string;
  actorId: string;
  source: "AUTOMATED" | "OWNER";
  action: ModerationAction;
  targetUserId?: string;
  targetContentId?: string;
  reason: string;
  evidenceId?: string;
}) {
  const record = {
    caseId: input.caseId,
    actorId: input.actorId,
    source: input.source,
    action: input.action,
    targetUserId: input.targetUserId,
    targetContentId: input.targetContentId,
    reason: String(input.reason).slice(0, 2000),
    evidenceId: input.evidenceId,
    status: "APPLIED",
    reversible: true,
    createdAt: new Date()
  };
  const result = await db.collection("moderation_actions").insertOne(record);
  return { ...record, actionId: result.insertedId.toHexString() };
}

export async function captureModerationEvidence(db: Db, input: {
  caseId: string;
  reviewerId: string;
  evidence: Record<string, unknown>;
}) {
  const snapshot = JSON.stringify(input.evidence, Object.keys(input.evidence).sort());
  const fingerprint = createHash("sha256").update(snapshot).digest("hex");
  const record = {
    caseId: input.caseId,
    reviewerId: input.reviewerId,
    evidence: input.evidence,
    fingerprint,
    capturedAt: new Date(),
    createdAt: new Date()
  };
  const result = await db.collection("moderation_evidence").insertOne(record);
  return { ...record, evidenceId: result.insertedId.toHexString() };
}

export async function createAppeal(db: Db, input: {
  caseId: string;
  userId: string;
  reason: string;
}) {
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(input.caseId)) throw new Error("Invalid moderation case id");
  const caseRecord = await db.collection("moderation_cases").findOne({ _id: new ObjectId(input.caseId) });
  if (!caseRecord) throw new Error("Moderation case not found");
  if (String(caseRecord.subjectUserId ?? "") !== input.userId) throw new Error("You are not authorized to appeal this moderation case");
  if (caseRecord.status !== "RESOLVED" && caseRecord.status !== "DISMISSED") throw new Error("Case is not appealable");
  const record = {
    caseId: input.caseId,
    userId: input.userId,
    reason: String(input.reason).slice(0, 2000),
    status: "OPEN" as AppealStatus,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  try {
    const result = await db.collection("appeals").insertOne(record);
    return { ...record, appealId: result.insertedId.toHexString() };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000) {
      throw new Error("An appeal already exists for this case");
    }
    throw error;
  }
}

export async function listAppeals(db: Db, input: { userId?: string; status?: AppealStatus; limit?: number }) {
  const limit = Math.min(Math.max(Number(input.limit ?? 50), 1), 100);
  const filter: Record<string, unknown> = {};
  if (input.userId) filter.userId = input.userId;
  if (input.status) filter.status = input.status;
  return db.collection("appeals").find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function updateAppeal(db: Db, appealId: string, input: {
  status: AppealStatus;
  reviewerId: string;
  resolution?: string;
}) {
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(appealId)) throw new Error("Invalid appeal id");
  const filter = { _id: new ObjectId(appealId) };
  const existing = await db.collection("appeals").findOne(filter);
  if (!existing) throw new Error("Appeal not found");
  const currentStatus = String(existing.status ?? "OPEN") as AppealStatus;
  if (!validAppealTransition(currentStatus, input.status)) throw new Error(`Invalid appeal transition: ${currentStatus} -> ${input.status}`);
  const update = {
    status: input.status,
    resolution: input.resolution ? String(input.resolution).slice(0, 2000) : existing.resolution,
    lastReviewedBy: input.reviewerId,
    updatedAt: new Date()
  };
  const result = await db.collection("appeals").updateOne(
    { ...filter, status: currentStatus, updatedAt: existing.updatedAt },
    { $set: update }
  );
  if (result.matchedCount !== 1) throw new Error("Appeal changed concurrently; refresh and retry");
  await db.collection("appeal_events").insertOne({
    appealId,
    reviewerId: input.reviewerId,
    changes: update,
    createdAt: new Date()
  });
  return db.collection("appeals").findOne(filter);
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

function validModerationTransition(from: ModerationCaseStatus, to: ModerationCaseStatus) {
  const allowed: Record<ModerationCaseStatus, ModerationCaseStatus[]> = {
    OPEN: ["IN_REVIEW", "DISMISSED"],
    IN_REVIEW: ["RESOLVED", "DISMISSED"],
    RESOLVED: [],
    DISMISSED: []
  };
  return from === to || allowed[from].includes(to);
}

function validAppealTransition(from: AppealStatus, to: AppealStatus) {
  const allowed: Record<AppealStatus, AppealStatus[]> = {
    OPEN: ["IN_REVIEW", "CLOSED"],
    IN_REVIEW: ["UPHELD", "OVERTURNED", "CLOSED"],
    UPHELD: ["CLOSED"],
    OVERTURNED: ["CLOSED"],
    CLOSED: []
  };
  return from === to || allowed[from].includes(to);
}

export async function updateModerationCase(db: Db, caseId: string, input: {
  status?: ModerationCaseStatus;
  assigneeId?: string | null;
  resolution?: string;
  reviewerId: string;
  evidenceId?: string;
}) {
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(caseId)) throw new Error("Invalid moderation case id");
  const existing = await db.collection("moderation_cases").findOne({ _id: new ObjectId(caseId) });
  if (!existing) throw new Error("Moderation case not found");
  const currentStatus = String(existing.status ?? "OPEN") as ModerationCaseStatus;
  if (input.status && !validModerationTransition(currentStatus, input.status)) throw new Error(`Invalid moderation case transition: ${currentStatus} -> ${input.status}`);
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (input.status) update.status = input.status;
  if (input.assigneeId !== undefined) update.assigneeId = input.assigneeId;
  if (input.resolution !== undefined) update.resolution = String(input.resolution).slice(0, 2000);
  if (input.evidenceId !== undefined) {
    const evidence = await db.collection("moderation_evidence").findOne({ _id: new ObjectId(input.evidenceId), caseId });
    if (!evidence) throw new Error("Evidence snapshot not found for moderation case");
    update.evidenceId = input.evidenceId;
    update.evidenceFingerprint = evidence.fingerprint;
  }
  update.lastReviewedBy = input.reviewerId;
  const result = await db.collection("moderation_cases").updateOne(
    { _id: new ObjectId(caseId), status: currentStatus, updatedAt: existing.updatedAt },
    { $set: update }
  );
  if (result.matchedCount !== 1) throw new Error("Moderation case changed concurrently; refresh and retry");
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
    subjectUserId: input.targetType === "USER" ? input.targetId : undefined,
    reason: record.reason,
    details: record.details,
    priority: "NORMAL",
    status: "OPEN",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  });
  return { ...record, reportId };
}
