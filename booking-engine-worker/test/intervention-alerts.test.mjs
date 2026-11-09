import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createEscalation, settleVendorReviewReceipts } from '../src/autopilot-replies.js';
import { normalizeVendorReceipt } from '../src/reply-guards.js';

const body = 'Thank you for reaching out. Your information has been forwarded to our Talent and Vendor team for review. Please do not submit separately to avoid duplication. The team will reach out if interested or if more information is needed.';
const classification = {category:'submission_redirect',mustEscalate:false,autoReplyAllowed:true,summary:'Information forwarded to the vendor team.',recommendedAction:'Optionally acknowledge receipt.',channel:'email'};
function fixture() {
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE messages(id TEXT PRIMARY KEY,contact_id TEXT,provider TEXT,provider_message_id TEXT,metadata_json TEXT,sender TEXT,subject TEXT,body TEXT,status TEXT);
 CREATE TABLE prospects(id TEXT PRIMARY KEY,entity TEXT,contact_name TEXT,contact_role TEXT,email TEXT,phone TEXT,profile TEXT,campaign_type TEXT,status TEXT,campaign_active INTEGER,next_action_at TEXT);
 CREATE TABLE escalations(id TEXT PRIMARY KEY,contact_id TEXT,message_id TEXT,category TEXT,priority TEXT,summary TEXT,proposed_action TEXT,metadata_json TEXT,status TEXT DEFAULT 'open',created_at TEXT DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT);
 CREATE TABLE crm_events(id INTEGER PRIMARY KEY,contact_id TEXT,event_type TEXT,channel TEXT,payload_json TEXT);
 INSERT INTO prospects VALUES('p','A to Z Events','Contact','Vendor Team','join@example.com','+15555550123','vendor','vendor','Replied',0,NULL);`);
 for(let i=1;i<=4;i++)sql.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?)').run('m'+i,'p','microsoft-graph','graph'+i,JSON.stringify({internetMessageId:'<same-reply@example.com>',classification}),'join@example.com','Thank you',body,'processed');
 const env={DB:{prepare(query){let params=[];const stmt={bind(...v){params=v;return stmt},async first(){return sql.prepare(query).get(...params)||null},async all(){return {results:sql.prepare(query).all(...params)}},async run(){const r=sql.prepare(query).run(...params);return {meta:{changes:Number(r.changes)}}}};return stmt}},SMS_BLAST:{async fetch(){env.sent++;return new Response(JSON.stringify({sid:'test-sid',status:'sent'}),{status:200})}},sent:0};
 return {sql,env};
}
const config={interventionAlertsEnabled:true,interventionAlertPhone:'+15555550000'};
test('vendor referral receipts wait without another email or an owner decision',()=>{
 const result=normalizeVendorReceipt({profile:'vendor'},{body},classification);
 assert.equal(result.category,'vendor_review_pending');assert.equal(result.autoReplyAllowed,false);assert.equal(result.mustEscalate,false);
 assert.equal(normalizeVendorReceipt({profile:'room'},{body},classification),classification);
 for(const change of [{submissionUrl:'https://example.com/apply'},{mustEscalate:true},{extractedMoneyOrTerms:'Commission'},{requestedDates:['2026-12-01']},{category:'rate_request'}]) {
  const input={...classification,...change};assert.equal(normalizeVendorReceipt({profile:'vendor'},{body},input),input);
 }
 assert.equal(normalizeVendorReceipt({profile:'vendor'},{body:'Please complete our vendor application.'},classification),classification);
});
test('four concurrent processors and four copies of the same logical reply send only one alert',async()=>{
 const {sql,env}=fixture();
 const ids=await Promise.all([1,2,3,4].map(i=>createEscalation(env,'p','m'+i,classification,config)));
 assert.equal(new Set(ids).size,1);assert.equal(env.sent,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM escalations').get().n,1);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM crm_events WHERE event_type='autopilot_intervention_alert_sent'").get().n,1);
 sql.prepare("UPDATE escalations SET status='resolved'").run();
 await createEscalation(env,'p','m1',classification,config);assert.equal(env.sent,1);
 sql.close();
});
test('existing receipt alerts are resolved, history is retained, and no new text is sent',async()=>{
 const {sql,env}=fixture();
 for(let i=1;i<=3;i++)sql.prepare('INSERT INTO escalations(id,contact_id,message_id,category,priority,summary,proposed_action,metadata_json) VALUES(?,?,?,?,?,?,?,?)').run('old'+i,'p','m'+i,'submission_redirect','normal','Receipt','Wait',JSON.stringify(classification));
 assert.equal(await settleVendorReviewReceipts(env),3);assert.equal(env.sent,0);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM escalations WHERE status='open'").get().n,0);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM escalations').get().n,3);
 assert.equal(sql.prepare('SELECT status FROM prospects').get().status,'Awaiting Vendor Review');
 assert.equal(await settleVendorReviewReceipts(env),0);
 sql.close();
});
