// SMS sender for phone OTP codes — Twilio when configured, otherwise the
// code is returned to the caller so dev mode can show it on screen.
const SID = process.env.TWILIO_ACCOUNT_SID || '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const FROM = process.env.TWILIO_PHONE || '';

export const SMS_CONFIGURED = !!(SID && AUTH_TOKEN && FROM);
export const DEV_MODE =
  (!SMS_CONFIGURED || process.env.DEV_CODES === '1') &&
  process.env.NODE_ENV !== 'production';

export async function sendSms(phone, body) {
  if (!SMS_CONFIGURED) {
    throw Object.assign(new Error('SMS is not configured'), { code: 'NO_SMS' });
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`;
  const auth = 'Basic ' + Buffer.from(`${SID}:${AUTH_TOKEN}`).toString('base64');
  const form = new URLSearchParams({ To: phone, From: FROM, Body: body });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twilio error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}