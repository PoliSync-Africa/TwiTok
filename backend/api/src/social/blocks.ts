import { ObjectId, type Db } from "mongodb";

export async function blockUser(db: Db, blockerId: string, blockedId: string) {
  if (!ObjectId.isValid(blockerId) || !ObjectId.isValid(blockedId) || blockerId === blockedId) {
    throw new Error("Invalid user to block");
  }
  const blocker = new ObjectId(blockerId);
  const blocked = new ObjectId(blockedId);
  await db.collection("blocks").updateOne(
    { blockerId: blocker, blockedId: blocked },
    { $setOnInsert: { blockerId: blocker, blockedId: blocked, createdAt: new Date() } },
    { upsert: true }
  );
  await db.collection("follows").deleteMany({
    $or: [
      { followerId: blocker, followingId: blocked },
      { followerId: blocked, followingId: blocker }
    ]
  });
  await db.collection("follow_requests").deleteMany({
    $or: [
      { requesterId: blocker, targetId: blocked },
      { requesterId: blocked, targetId: blocker }
    ]
  });
  return { blockerId, blockedId, blocked: true };
}

export async function unblockUser(db: Db, blockerId: string, blockedId: string) {
  if (!ObjectId.isValid(blockerId) || !ObjectId.isValid(blockedId)) throw new Error("Invalid user to unblock");
  await db.collection("blocks").deleteOne({
    blockerId: new ObjectId(blockerId),
    blockedId: new ObjectId(blockedId)
  });
  return { blockerId, blockedId, blocked: false };
}

export async function isBlockedEitherDirection(db: Db, userA: string, userB: string) {
  if (!ObjectId.isValid(userA) || !ObjectId.isValid(userB)) return false;
  const a = new ObjectId(userA);
  const b = new ObjectId(userB);
  const row = await db.collection("blocks").findOne({
    $or: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }]
  }, { projection: { _id: 1 } });
  return Boolean(row);
}

export async function listBlocks(db: Db, blockerId: string) {
  if (!ObjectId.isValid(blockerId)) throw new Error("Invalid user id");
  return db.collection("blocks")
    .find({ blockerId: new ObjectId(blockerId) }, { projection: { _id: 0, blockedId: 1, createdAt: 1 } })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();
}
