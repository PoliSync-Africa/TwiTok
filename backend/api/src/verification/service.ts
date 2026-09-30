import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

export const VERIFICATION_TYPES = ["PERSONAL", "BUSINESS", "INSTITUTIONAL"] as const;
export type VerificationType = typeof VERIFICATION_TYPES[number];

export const VERIFICATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export async function initializeVerificationIndexes(db: Db) {
  await Promise.all([
    db.collection("verification_requests").createIndex({ requestId: 1 }, { unique: true }),
    db.collection("verification_requests").createIndex({ userId: 1, status: 1, createdAt: -1 }),
    db.collection("verification_requests").createIndex({ status: 1, createdAt: 1 }),
    db.collection("verification_requests").createIndex({ reviewedBy: 1, reviewedAt: -1 }),
    db.collection("users").createIndex({ verificationStatus: 1 }),
    db.collection("users").createIndex({ isVerified: 1 })
  ]);
}

function normalizeLinks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(x => String(x).trim()).filter(Boolean))].slice(0, 10);
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function getVerificationStatus(db: Db, userId: string) {
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId) },
    { projection: { isVerified: 1, verificationType: 1, verificationStatus: 1, verifiedAt: 1 } }
  );
  if (!user) throw new Error("Account not found");

  const latest = await db.collection("verification_requests").findOne(
    { userId },
    { sort: { createdAt: -1 }, projection: { requestId: 1, type: 1, status: 1, createdAt: 1, reviewedAt: 1, rejectionReason: 1 } }
  );

  return {
    isVerified: user.isVerified === true,
    verificationType: user.verificationType ?? null,
    status: user.verificationStatus ?? "NONE",
    verifiedAt: user.verifiedAt ?? null,
    latestRequest: latest ? {
      requestId: String(latest.requestId),
      type: latest.type,
      status: latest.status,
      createdAt: latest.createdAt,
      reviewedAt: latest.reviewedAt ?? null,
      rejectionReason: latest.rejectionReason ?? null
    } : null
  };
}

export async function createVerificationRequest(db: Db, userId: string, input: {
  type: VerificationType;
  legalName: string;
  displayName: string;
  website?: string;
  identityDocumentKey: string;
  supportingLinks: string[];
  reason?: string;
}) {
  const user = await db.collection("users").findOne(
    { _id: new ObjectId(userId), status: "ACTIVE" },
    { projection: { username: 1, nickname: 1, bio: 1, profilePhotoKey: 1, isPrivate: 1, profileSetupComplete: 1, accountType: 1, emailVerified: 1, phoneVerified: 1, countryCode: 1, verificationStatus: 1, isVerified: 1, createdAt: 1 } }
  );
  if (!user) throw new Error("Account not found");
  if (user.isVerified === true) throw new Error("This account is already verified");
  if (user.verificationStatus === "PENDING") throw new Error("A verification request is already under review");

  const type = String(input.type).toUpperCase() as VerificationType;
  if (!VERIFICATION_TYPES.includes(type)) throw new Error("Invalid verification type");

  if (type === "BUSINESS" && user.accountType !== "BUSINESS") {
    throw new Error("Business verification requires a Business Account");
  }
  if (type === "PERSONAL" && user.accountType !== "PERSONAL") {
    throw new Error("Personal verification requires a Personal Account");
  }

  const legalName = String(input.legalName ?? "").trim();
  const displayName = String(input.displayName ?? "").trim();
  const identityDocumentKey = String(input.identityDocumentKey ?? "").trim();
  const supportingLinks = normalizeLinks(input.supportingLinks);

  if (!legalName || legalName.length > 120) throw new Error("Legal name is required");
  if (!displayName || displayName.length > 80) throw new Error("Display name is required");
  if (!identityDocumentKey || identityDocumentKey.length > 500) throw new Error("Identity document is required");
  if (supportingLinks.length < 2) throw new Error("At least two credible public supporting links are required");
  if (supportingLinks.some(link => !isHttpUrl(link))) throw new Error("Supporting links must be valid HTTP or HTTPS URLs");

  if (user.isPrivate) throw new Error("Your account must be public before requesting verification");
  if (user.profileSetupComplete !== true || !user.username || !user.nickname || !user.bio || !user.profilePhotoKey) {
    throw new Error("Complete your username, name, bio and profile photo before requesting verification");
  }

  const publicPost = await db.collection("videos").findOne(
    { ownerId: new ObjectId(userId), status: "PUBLISHED", visibility: "PUBLIC" },
    { projection: { _id: 1 } }
  );
  if (!publicPost) throw new Error("Publish at least one public post before requesting verification");

  const now = new Date();
  const cooldownFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentRejected = await db.collection("verification_requests").findOne({
    userId,
    status: "REJECTED",
    reviewedAt: { $gte: cooldownFrom }
  });
  if (recentRejected) throw new Error("You can submit another verification request 30 days after a rejection");

  const requestId = new ObjectId().toHexString();
  await db.collection("verification_requests").insertOne({
    requestId,
    userId,
    type,
    legalName,
    displayName,
    website: input.website?.trim() || null,
    identityDocumentKey,
    supportingLinks,
    reason: String(input.reason ?? "").trim().slice(0, 1000),
    status: "PENDING",
    createdAt: now,
    updatedAt: now
  });

  await db.collection("users").updateOne(
    { _id: new ObjectId(userId) },
    { $set: { verificationStatus: "PENDING", updatedAt: now } }
  );

  return getVerificationStatus(db, userId);
}

export async function reviewVerificationRequest(db: Db, requestId: string, reviewerId: string, decision: "APPROVE" | "REJECT", reviewNotes?: string) {
  const request = await db.collection("verification_requests").findOne({ requestId });
  if (!request) throw new Error("Verification request not found");
  if (request.status !== "PENDING") throw new Error("This verification request has already been reviewed");

  const now = new Date();
  const normalizedNotes = String(reviewNotes ?? "").trim().slice(0, 2000);

  const session = db.client?.startSession();
  if (!session) throw new Error("MongoDB session unavailable");

  try {
    await session.withTransaction(async () => {
      const current = await db.collection("verification_requests").findOne({ requestId, status: "PENDING" }, { session });
      if (!current) throw new Error("Verification request has already been reviewed");

      const userId = String(current.userId);
      if (decision === "APPROVE") {
        await db.collection("verification_requests").updateOne(
          { requestId, status: "PENDING" },
          { $set: { status: "APPROVED", reviewedBy: reviewerId, reviewedAt: now, reviewNotes: normalizedNotes, updatedAt: now } },
          { session }
        );
        await db.collection("users").updateOne(
          { _id: new ObjectId(userId) },
          { $set: {
              isVerified: true,
              verificationStatus: "APPROVED",
              verificationType: current.type,
              verifiedAt: now,
              verifiedBy: reviewerId,
              updatedAt: now
            } },
          { session }
        );
      } else {
        await db.collection("verification_requests").updateOne(
          { requestId, status: "PENDING" },
          { $set: { status: "REJECTED", reviewedBy: reviewerId, reviewedAt: now, reviewNotes: normalizedNotes, rejectionReason: normalizedNotes || "Verification requirements were not met", updatedAt: now } },
          { session }
        );
        await db.collection("users").updateOne(
          { _id: new ObjectId(userId) },
          { $set: { verificationStatus: "REJECTED", updatedAt: now }, $unset: { verifiedAt: "", verifiedBy: "" } },
          { session }
        );
      }
      await db.collection("audit_logs").insertOne({
        actorId: reviewerId,
        actorRole: "OWNER",
        action: decision === "APPROVE" ? "VERIFICATION_APPROVED" : "VERIFICATION_REJECTED",
        resourceType: "VERIFICATION_REQUEST",
        resourceId: requestId,
        createdAt: now
      }, { session });
    });
  } finally {
    await session.endSession();
  }

  return db.collection("verification_requests").findOne(
    { requestId },
    { projection: { _id: 0, requestId: 1, userId: 1, type: 1, status: 1, reviewedAt: 1, reviewNotes: 1, rejectionReason: 1 } }
  );
}
