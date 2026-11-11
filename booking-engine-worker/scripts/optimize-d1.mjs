import { appendFileSync } from 'node:fs';
import { ensureD1ReadIndexes, isD1DailyLimit } from '../src/d1-read-indexes.js';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Cloudflare deployment credentials are missing.');
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/281733ac-976d-4254-bc0e-df0e6eec3b88/query`;
async function query(statements) {
  const response = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(statements.length === 1 ? statements[0] : { batch: statements }) });
  const data = await response.json();
  if (!response.ok || !data.success || !data.result?.every(r => r.success)) {
    const errors = [...(data.errors || []), ...(data.result || []).flatMap(r => r.errors || (r.error ? [{ message: r.error }] : []))];
    throw new Error(`D1 optimization failed (${response.status}): ${errors.map(e => e.message || e.code).join('; ')}`);
  }
  return data.result;
}
function prepare(sql) {
  let params = [];
  const statement = { sql, get params() { return params; }, bind(...values) { params = values; return statement; }, async first() { return (await query([{ sql, params }]))[0].results[0] || null; } };
  return statement;
}
const env = { DB: { prepare, batch: statements => query(statements.map(s => ({ sql: s.sql, params: s.params }))) } };
try {
  const result = await ensureD1ReadIndexes(env);
  console.log(JSON.stringify({ ...result, status: 'read-indexes-ready' }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'ready=true\n');
} catch (error) {
  if (!isD1DailyLimit(error)) throw error;
  console.log(JSON.stringify({ ready: false, status: 'pending-daily-reset', recovery: 'The deployed Worker will apply the indexes before the next scheduled campaign cycle after D1 becomes available.' }));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'ready=false\n');
}
