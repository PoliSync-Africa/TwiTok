import type { Db } from "mongodb";

export async function initializeBlockIndexes(db: Db) {
  await Promise.all([
    db.collection("user_blocks").createIndex({ blockerId: 1, blockedId: 1 }, { unique: true }),
    db.collection("user_blocks").createIndex({ blockerId: 1, createdAt: -1 }),
    db.collection("user_blocks").createIndex({ blockedId: 1, createdAt: -1 })
  ]);
}

export async function blockUser(db: Db, blockerId: string, blockedId: string) {
  if (!blockedId || blockerId === blockedId) throw new Error("Invalid user to block");
  const now = new Date();
  await db.collection("user_blocks").updateOne(
    { blockerId, blockedId },
    { $setOnInsert: { blockerId, blockedId, createdAt: now } },
    { upsert: true }
  );
  return { blockerId, blockedId, blocked: true };
}

export async function unblockUser(db: Db, blockerId: string, blockedId: string) {
  await db.collection("user_blocks").deleteOne({ blockerId, blockedId });
  return { blockerId, blockedId, blocked: false };
}

export async function isBlockedEitherDirection(db: Db, userA: string, userB: string) {
  const row = await db.collection("user_blocks").findOne({
    $or: [{ blockerId: userA, blockedId: userB }, { blockerId: userB, blockedId: userA }]
  }, { projection: { _id: 1 } });
  return Boolean(row);
}
