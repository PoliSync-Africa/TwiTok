import { NextResponse } from "next/server";

export async function POST() {
  const result = NextResponse.json({ ok: true });
  result.cookies.set("twitok_owner_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
  return result;
}
