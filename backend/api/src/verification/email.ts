const RESEND_API_URL = "https://api.resend.com/emails";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type EmailOtpPurpose = "VERIFICATION" | "PASSWORD_RESET";

export async function sendEmailOtp(input: {
  to: string;
  code: string;
  purpose: EmailOtpPurpose;
  expiresInSeconds: number;
}) {
  const apiKey = getRequiredEnv("RESEND_API_KEY");
  const from = getRequiredEnv("TWITOK_EMAIL_FROM");

  const isPasswordReset = input.purpose === "PASSWORD_RESET";
  const subject = isPasswordReset
    ? "Your TwiTok password reset code"
    : "Your TwiTok verification code";

  const heading = isPasswordReset
    ? "Reset your TwiTok password"
    : "Verify your TwiTok email";

  const message = isPasswordReset
    ? "Use this one-time code to reset your TwiTok password."
    : "Use this one-time code to verify your TwiTok email address.";

  const safeCode = escapeHtml(input.code);
  const safeMessage = escapeHtml(message);
  const expiryMinutes = Math.ceil(input.expiresInSeconds / 60);

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject,
      text: `${heading}\n\n${message}\n\nYour code: ${input.code}\n\nThis code expires in ${expiryMinutes} minutes. If you did not request this, you can ignore this email.`,
      html: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#172033">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border-radius:18px;padding:32px;box-shadow:0 8px 30px rgba(0,0,0,.06)">
      <div style="font-size:28px;font-weight:800;margin-bottom:20px">TwiTok</div>
      <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px">${escapeHtml(heading)}</h1>
      <p style="font-size:16px;line-height:1.6;color:#5f6b7a;margin:0 0 24px">${safeMessage}</p>
      <div style="font-size:34px;letter-spacing:8px;font-weight:800;text-align:center;background:#f1f5ff;border-radius:14px;padding:18px 12px;margin:0 0 24px">${safeCode}</div>
      <p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0">This code expires in ${expiryMinutes} minutes and can only be used once.</p>
      <p style="font-size:13px;line-height:1.6;color:#8a94a6;margin:20px 0 0">If you did not request this code, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`
    }),
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json() as { message?: string };
      detail = typeof payload.message === "string" ? payload.message : "";
    } catch {
      // Keep provider response details out of the public API error.
    }
    throw new Error(detail ? `Email OTP delivery failed: ${detail}` : "Email OTP delivery failed");
  }

  return true;
}
