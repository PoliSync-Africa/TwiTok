import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.TWITOK_API_URL ?? "http://localhost:4000";

async function callBackend(request: Request, path: string) {
  const token = (await cookies()).get("twitok_owner_session")?.value;
  if (!token) return NextResponse.json({ error: "Administrator session required" }, { status: 401 });
  const response = await fetch(`${API_URL}/api/v1/admin/notifications${path}`, {
    method: request.method,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: request.method === "GET" ? undefined : await request.text(),
    cache: "no-store"
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return callBackend(request, url.search);
}

export async function POST(request: Request) {
  return callBackend(request, "");
}
