import { env } from 'cloudflare:workers';
export const CONSENT = 'I agree to receive The Limo Man book news and release updates by email.';
export const SOURCE = 'The Limo Man website';
export function database() { if (!env.DB) throw new Error('Database unavailable'); return env.DB; }
export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) && !/[\r\n\0]/.test(email) ? email : null;
}
export function sameOrigin(request: Request) { return request.headers.get('origin') === new URL(request.url).origin; }
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' } });
}
export async function rateLimit(request: Request) {
  const salt = env.SIGNUP_HASH_SALT || (import.meta.env.DEV ? 'local-development-only' : '');
  if (!salt) throw new Error('Rate limiter unavailable');
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
  const bucket = Math.floor(Date.now() / 3_600_000);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  const key = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  const result = await database().prepare(`INSERT INTO signup_limits (key,bucket,count) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET bucket=excluded.bucket,
    count=CASE WHEN signup_limits.bucket=excluded.bucket THEN signup_limits.count+1 ELSE 1 END RETURNING count`)
    .bind(key,bucket).first<{ count: number }>();
  return !!result && result.count <= 12;
}
export async function saveSubscriber(email: string, source = SOURCE, consent = CONSENT, at = Date.now()) {
  await database().prepare(`INSERT INTO subscribers
    (id,email,status,source,consent_text,subscribed_at,consent_at,updated_at,signup_count)
    VALUES (?,?,'subscribed',?,?,?,?,?,1)
    ON CONFLICT(email) DO UPDATE SET status='subscribed',source=excluded.source,consent_text=excluded.consent_text,
    consent_at=excluded.consent_at,updated_at=excluded.updated_at,signup_count=subscribers.signup_count+1`)
    .bind(crypto.randomUUID(),email,source,consent,at,at,Date.now()).run();
}
export type Subscriber = { id: string; email: string; status: string; source: string; consent_text: string; subscribed_at: number; consent_at: number; updated_at: number; signup_count: number };
export function csvCell(value: unknown) {
  let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}
export function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (c==='"') { if (quoted && text[i+1]==='"') { field+='"'; i++; } else quoted=!quoted; }
    else if (c===',' && !quoted) { row.push(field); field=''; }
    else if ((c==='\n' || c==='\r') && !quoted) { if(c==='\r' && text[i+1]==='\n') i++; row.push(field); if(row.some(Boolean)) rows.push(row); row=[]; field=''; }
    else field+=c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  row.push(field); if(row.some(Boolean)) rows.push(row); return rows;
}
