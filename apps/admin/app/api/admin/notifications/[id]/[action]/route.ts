import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.TWITOK_API_URL ?? "http://localhost:4000";

export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const token = (await cookies()).get("twitok_owner_session")?.value;
  if (!token) return NextResponse.json({ error: "Administrator session required" }, { status: 401 });
  const { id, action } = await context.params;
  if (!/^[a-f0-9]{24}$/i.test(id) || !/^(publish|archive)$/.test(action)) {
    return NextResponse.json({ error: "Invalid notification route" }, { status: 400 });
  }
  const response = await fetch(`${API_URL}/api/v1/admin/notifications/${id}/${action}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
