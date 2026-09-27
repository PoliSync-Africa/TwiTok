import { Db } from "mongodb";

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
    db.collection("appeals").createIndex({ userId: 1, createdAt: -1 })
  ]);
}

export async function evaluateText(db: Db, input: { userId:string; contentId:string; text:string; actionType:string }) {
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