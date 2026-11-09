import { normalizeVendorReceipt } from '../booking-engine-worker/src/reply-guards.js';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Deployment credentials missing.');
async function query(sql, params=[]) {
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/281733ac-976d-4254-bc0e-df0e6eec3b88/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({sql,params})});
 const d=await r.json();
 if(!r.ok||!d.success||!d.result?.[0]?.success)throw new Error(`Audit query failed (${r.status}).`);
 return d.result[0].results;
}
const scope="SELECT id FROM prospects WHERE lower(email) LIKE '%@atozevents.com' OR lower(entity) LIKE '%a to z%'";
const messages=await query(`SELECT id,contact_id,body,direction,status,provider_message_id,metadata_json,created_at,received_at,sent_at FROM messages WHERE contact_id IN (${scope}) ORDER BY created_at`);
const escalations=await query(`SELECT id,message_id,status,category,created_at FROM escalations WHERE contact_id IN (${scope}) ORDER BY created_at`);
const events=await query(`SELECT event_type,payload_json,created_at FROM crm_events WHERE contact_id IN (${scope}) AND event_type IN ('autopilot_intervention_alert_sent','autopilot_intervention_alert_failed','autopilot_escalation_created','autopilot_initial_sent','autopilot_followup_sent','autopilot_reply_sent') ORDER BY created_at`);
const parse=s=>{try{return JSON.parse(s||'{}')}catch{return {}}};
const prospects=await query(`SELECT id,profile,campaign_type,status,campaign_active,next_action_at,metadata_json FROM prospects WHERE id IN (${scope})`);
const inbound=messages.filter(m=>m.direction==='inbound');
const byEvent={};for(const e of events)byEvent[e.event_type]=(byEvent[e.event_type]||0)+1;
const recent=messages.filter(m=>(m.sent_at||m.received_at||m.created_at||'')>='2026-11-09');
console.log(JSON.stringify({audit:'atoz-alerts',prospectStates:prospects.map(p=>({profile:p.profile,status:p.status,campaignActive:p.campaign_active,nextActionScheduled:!!p.next_action_at,followUpAt:p.next_action_at,reviewHoldUntil:parse(p.metadata_json).outreachHold?.until || null})),receiptMatches:inbound.map(m=>normalizeVendorReceipt(prospects.find(p=>p.id===m.contact_id)||{},m,parse(m.metadata_json).classification||{}).category==='vendor_review_pending'),messageCounts:{inbound:inbound.length,outbound:messages.filter(m=>m.direction==='outbound'&&m.status!=='draft').length,todayInbound:recent.filter(m=>m.direction==='inbound').length,todayOutbound:recent.filter(m=>m.direction==='outbound'&&m.status!=='draft').length},distinctInboundProviderIds:new Set(inbound.map(m=>m.provider_message_id).filter(Boolean)).size,distinctInboundInternetIds:new Set(inbound.map(m=>parse(m.metadata_json).internetMessageId).filter(Boolean)).size,inbound:inbound.map(m=>({receivedAt:m.received_at,createdAt:m.created_at,status:m.status,category:parse(m.metadata_json).classification?.category,mustEscalate:parse(m.metadata_json).classification?.mustEscalate})),escalations:{total:escalations.length,open:escalations.filter(e=>e.status==='open').length,distinctMessages:new Set(escalations.map(e=>e.message_id)).size,categories:escalations.map(e=>e.category)},events:byEvent,alerts:events.filter(e=>e.event_type==='autopilot_intervention_alert_sent').map(e=>({at:e.created_at,hasProviderMessageId:!!parse(e.payload_json).providerMessageId})),distinctAlertProviderIds:new Set(events.filter(e=>e.event_type==='autopilot_intervention_alert_sent').map(e=>parse(e.payload_json).providerMessageId).filter(Boolean)).size}));

