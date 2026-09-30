import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.TWITOK_API_URL ?? "http://localhost:4000";

export async function POST(request: Request) {
  const token = (await cookies()).get("twitok_owner_session")?.value;
  if (!token) return NextResponse.json({ error: "Administrator session required" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const requestId = String(body.requestId ?? "");
  if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  const response = await fetch(`${API_URL}/api/v1/admin/verification/requests/${encodeURIComponent(requestId)}/review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ decision: body.decision, reviewNotes: body.reviewNotes })
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
