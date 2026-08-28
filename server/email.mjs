// Outgoing email via the Resend API.
// Without RESEND_API_KEY the app runs in dev mode: nothing is sent, but callers
// can surface the would-be code on screen for local testing.

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
export const EMAIL_CONFIGURED = !!RESEND_API_KEY;
export const DEV_MODE =
  (!RESEND_API_KEY || process.env.DEV_CODES === '1') &&
  process.env.NODE_ENV !== 'production';

const FROM = process.env.EMAIL_FROM || 'SportScore <onboarding@resend.dev>';

export function otpEmailHtml(code, purpose) {
  const headline =
    purpose === 'login' ? 'Your login code' : 'Verify your email';
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f7fb;margin:0;padding:24px">
  <div style="max-width:420px;margin:auto;background:#fff;border-radius:12px;padding:28px">
    <h2 style="margin-top:0">🎾 SportScore</h2>
    <p>${headline}</p>
    <div style="font-size:32px;letter-spacing:10px;font-weight:700;color:#0f766e;text-align:center;padding:16px 0">${code}</div>
    <p style="color:#555">Enter this code in the app. It expires in 10 minutes and can only be used once.</p>
    <p style="color:#999;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
  </div>
</body>
</html>`;
}

export async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    return { ok: true, dev: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Email send failed (${res.status}): ${detail}`);
  }
  return { ok: true, id: (await res.json()).id };
}