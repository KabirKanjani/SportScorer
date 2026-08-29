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
    purpose === 'login'
      ? 'Your login code'
      : purpose === 'reset'
        ? 'Your password reset code'
        : 'Verify your email';
  return `<!DOCTYPE html>
<html>
<body style="font-family:Segoe UI,Arial,sans-serif;background:#0b1120;margin:0;padding:32px 16px">
  <div style="max-width:440px;margin:auto;background:#ffffff;border-radius:16px;padding:32px">
    <div style="font-size:26px;font-weight:800;background:linear-gradient(90deg,#2563eb,#7c3aed);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:4px">🎾 SportScore</div>
    <h2 style="margin:12px 0 4px;color:#0f172a">${headline}</h2>
    <p style="color:#475569;margin-top:8px">Enter this code to continue.</p>
    <div style="font-size:34px;letter-spacing:10px;font-weight:800;color:#2563eb;text-align:center;padding:20px 0;border-radius:12px;background:#f1f5f9">${code}</div>
    <p style="color:#64748b;font-size:14px">The code expires in 10 minutes and can only be used once.</p>
    <p style="color:#94a3b8;font-size:12px;margin-bottom:0">If you didn't request this, you can safely ignore this email.</p>
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