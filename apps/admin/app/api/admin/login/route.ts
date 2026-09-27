import { NextResponse } from "next/server";

const API_URL = process.env.TWITOK_API_URL ?? "http://localhost:4000";

export async function POST(request: Request) {
  const body = await request.json();

  const response = await fetch(`${API_URL}/api/v1/admin/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  const result = NextResponse.json({
    administrator: data.administrator
  });

  result.cookies.set("twitok_owner_session", data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 30
  });

  return result;
}
