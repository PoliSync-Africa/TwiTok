import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.TWITOK_API_URL ?? "http://localhost:4000";

export async function GET(request: Request) {
  const token = (await cookies()).get("twitok_owner_session")?.value;
  if (!token) return NextResponse.json({ error: "Administrator session required" }, { status: 401 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  const response = await fetch(`${API_URL}/api/v1/admin/verification/requests?status=${encodeURIComponent(status)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
