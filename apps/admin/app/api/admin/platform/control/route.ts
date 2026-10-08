import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.TWITOK_API_URL ?? "http://localhost:4000";

async function proxy(request: Request, method: "GET" | "PATCH") {
  const cookieStore = await cookies();
  const token = cookieStore.get("twitok_owner_session")?.value;
  if (!token) return NextResponse.json({ error: "Administrator session required" }, { status: 401 });

  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    cache: "no-store"
  };
  if (method === "PATCH") init.body = await request.text();

  const response = await fetch(`${API_URL}/api/v1/admin/platform/control`, init);
  const data = await response.json().catch(() => ({ error: "Invalid administrator response" }));
  return NextResponse.json(data, { status: response.status });
}

export async function GET(request: Request) {
  return proxy(request, "GET");
}

export async function PATCH(request: Request) {
  return proxy(request, "PATCH");
}
