import { settleVendorReviewReceipts } from '../src/autopilot-replies.js';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw new Error('Deployment credentials missing.');
async function query(sql,params=[]) {
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/281733ac-976d-4254-bc0e-df0e6eec3b88/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({sql,params})});
 const data=await response.json();
 if(!response.ok||!data.success||!data.result?.[0]?.success)throw new Error(`Receipt settlement failed (${response.status}).`);
 return data.result[0];
}
const env={DB:{prepare(sql){let params=[];const statement={bind(...values){params=values;return statement},all(){return query(sql,params)},async first(){return (await query(sql,params)).results[0]||null},run(){return query(sql,params)}};return statement}}};
console.log(JSON.stringify({routineVendorReceiptTasksResolved:await settleVendorReviewReceipts(env),messagesSent:0}));
