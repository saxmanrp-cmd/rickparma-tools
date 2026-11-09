import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createEscalation, settleVendorReviewReceipts } from '../src/autopilot-replies.js';
import { applyVendorReviewHold, activeOutreachHold, recipientHasActiveOutreachHold, reviewHoldFor } from '../src/outreach-hold.js';
import { prospectEligible, normalizeAutopilotConfig } from '../src/autopilot-policy.js';
import { normalizeVendorReceipt } from '../src/reply-guards.js';

const body = 'Thank you for reaching out. Your information has been forwarded to our Talent and Vendor team for review. Please do not submit separately to avoid duplication. The team will reach out if interested or if more information is needed.';
const classification = {category:'submission_redirect',mustEscalate:false,autoReplyAllowed:true,summary:'Information forwarded to the vendor team.',recommendedAction:'Optionally acknowledge receipt.',channel:'email'};
function fixture() {
 const sql=new DatabaseSync(':memory:');
 sql.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 sql.prepare("INSERT INTO prospects(id,dedupe_key,entity,email,profile,campaign_type,status,last_contacted_at,touch_count) VALUES('p','test-p','A to Z Events','join@example.com','vendor','vendor','Replied','2026-11-09T21:00:00Z',1)").run();
 for(let i=1;i<=4;i++)sql.prepare("INSERT INTO messages(id,contact_id,direction,channel,provider,provider_message_id,metadata_json,sender,subject,body,status,received_at) VALUES(?,?,'inbound','email',?,?,?,?,?,?,?,'2026-11-09T22:07:55Z')").run('m'+i,'p','microsoft-graph','graph'+i,JSON.stringify({internetMessageId:'<same-reply@example.com>',classification}),'join@example.com','Thank you',body,'processed');
 const env={DB:{prepare(query){let params=[];const stmt={bind(...v){params=v;return stmt},async first(){return sql.prepare(query).get(...params)||null},async all(){return {results:sql.prepare(query).all(...params)}},async run(){const r=sql.prepare(query).run(...params);return {meta:{changes:Number(r.changes)}}}};return stmt}},SMS_BLAST:{async fetch(){env.sent++;return new Response(JSON.stringify({sid:'test-sid',status:'sent'}),{status:200})}},sent:0};
 return {sql,env};
}
const config={interventionAlertsEnabled:true,interventionAlertPhone:'+15555550000'};
test('vendor referral receipts wait without another email or an owner decision',()=>{
 const result=normalizeVendorReceipt({profile:'vendor'},{body},classification);
 assert.equal(result.category,'vendor_review_pending');assert.equal(result.autoReplyAllowed,false);assert.equal(result.mustEscalate,false);
 assert.equal(normalizeVendorReceipt({profile:'room'},{body},classification).category,'vendor_review_pending');
 for(const change of [{mustEscalate:true},{extractedMoneyOrTerms:'Commission'},{requestedDates:['2026-12-01']},{category:'rate_request'}]) {
  const input={...classification,...change};assert.equal(normalizeVendorReceipt({profile:'vendor'},{body},input),input);
 }
 const application={...classification,summary:'Please complete our vendor application.',recommendedAction:'Submit the requested form.',submissionUrl:'https://example.com/apply'};
 assert.equal(normalizeVendorReceipt({profile:'vendor'},{body:'Please complete our vendor application.'},application),application);
 const forwarded={...classification,summary:'Information was forwarded to the Talent and Vendor team for review.',recommendedAction:'Do not send a duplicate submission. Wait for their follow-up.',submissionUrl:'https://example.com'};
 assert.equal(normalizeVendorReceipt({profile:'vendor'},{body:'Thank you for reaching out.'},forwarded).category,'vendor_review_pending');
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

test('list placements and simple team referrals receive the same 60-day no-acknowledgement rule',()=>{
 for(const receipt of [
  "We will add you to our vendor list.",
  "We'll add you to our list.",
  "We've added your information to our preferred vendor database.",
  "You have been added to our entertainment roster.",
  "We will keep your details on file.",
  "We'll keep your information in mind.",
  "Your information was forwarded to our team.",
  "I passed your information along to our booking manager for consideration."
 ]) {
  const result=normalizeVendorReceipt({profile:'room'},{body:receipt},{category:'positive_interest',mustEscalate:false,summary:'',recommendedAction:''});
  assert.equal(result.category,'vendor_review_pending',receipt);
  assert.equal(result.outreachHoldDays,60);assert.equal(result.autoReplyAllowed,false);
 }
 for(const receipt of ["We cannot add you to our list.","We have not forwarded your information.","Please send your videos and complete our application."]) {
  const input={category:'question',mustEscalate:false,summary:'',recommendedAction:''};
  assert.equal(normalizeVendorReceipt({profile:'vendor'},{body:receipt},input),input,receipt);
 }
 const sensitive={category:'vendor_review_pending',mustEscalate:true,extractedMoneyOrTerms:'Contract commission'};
 assert.equal(normalizeVendorReceipt({profile:'vendor'},{body},sensitive).category,'other');
});

test('review hold survives reloads, covers duplicate records, expires at 60 days and does not create duplicate follow-ups',async()=>{
 const {sql,env}=fixture();const now=new Date('2026-11-09T23:00:00Z');
 sql.prepare("UPDATE prospects SET automation_safe='YES_TARGETED',fit_score=95,confidence=0.95,metadata_json=? WHERE id='p'").run(JSON.stringify({keepExisting:'yes'}));
 sql.prepare("INSERT INTO prospects(id,dedupe_key,entity,email,status) VALUES('duplicate','test-copy','Another room','JOIN@example.com','researched')").run();
 const message=sql.prepare("SELECT * FROM messages WHERE id='m1'").get();
 const hold=await applyVendorReviewHold(env,message,now);
 assert.equal(hold.until,'2027-01-08T22:07:55.000Z');
 const primary=sql.prepare("SELECT * FROM prospects WHERE id='p'").get();
 const copy=sql.prepare("SELECT * FROM prospects WHERE id='duplicate'").get();
 assert.equal(primary.next_action_at,hold.until);assert.equal(primary.campaign_active,1);
 assert.equal(copy.campaign_active,0);assert.equal(copy.next_action_at,null);
 assert.equal(JSON.parse(primary.metadata_json).keepExisting,'yes');
 assert.equal(JSON.parse(copy.metadata_json).outreachHold.until,hold.until);
 const before=new Date(Date.parse(hold.until)-1);const at=new Date(hold.until);
 assert.ok(activeOutreachHold(primary,before));assert.equal(activeOutreachHold(primary,at),null);
 const ready=normalizeAutopilotConfig({mode:'live',businessPostalAddress:'Test address'});
 assert.equal(prospectEligible(ready,primary,before).ok,false);
 assert.equal(prospectEligible(ready,primary,at).ok,true);
 assert.equal(await recipientHasActiveOutreachHold(env,{id:'other',email:'join@example.com'},before),true);
 assert.equal(await recipientHasActiveOutreachHold(env,{id:'other',email:'join@example.com'},at),false);
 const repeated=await applyVendorReviewHold(env,{...message,id:'new-copy',received_at:'2026-11-11T00:00:00Z'},new Date('2026-11-11'));
 assert.equal(repeated.until,hold.until);
 assert.equal(reviewHoldFor(primary,message,new Date('2027-03-01')).until,hold.until);
 assert.equal(env.sent,0);
 sql.close();
});

test('recent already-processed receipts get the hold without restarting relationships after a substantive reply',async()=>{
 const {sql,env}=fixture();
 sql.prepare("UPDATE messages SET metadata_json=json_set(metadata_json,'$.classification.category','vendor_review_pending')").run();
 sql.prepare("UPDATE prospects SET status='Awaiting Vendor Review'").run();
 await settleVendorReviewReceipts(env);
 assert.equal(sql.prepare("SELECT next_action_at FROM prospects WHERE id='p'").get().next_action_at,'2027-01-08T22:07:55.000Z');
 const snapshot=sql.prepare("SELECT metadata_json FROM prospects WHERE id='p'").get().metadata_json;
 await settleVendorReviewReceipts(env);
 assert.equal(sql.prepare("SELECT metadata_json FROM prospects WHERE id='p'").get().metadata_json,snapshot);
 sql.prepare("UPDATE prospects SET status='Replied',campaign_active=0,next_action_at=NULL,metadata_json='{}'").run();
 sql.prepare("INSERT INTO messages(id,contact_id,direction,channel,status,received_at,metadata_json) VALUES('real-reply','p','inbound','email','processed','2026-11-10T00:00:00Z',?)").run(JSON.stringify({classification:{category:'request_materials',mustEscalate:false}}));
 await settleVendorReviewReceipts(env);
 assert.equal(sql.prepare("SELECT next_action_at FROM prospects WHERE id='p'").get().next_action_at,null);
 assert.equal(env.sent,0);
 sql.close();
});

test('holds preserve opt-outs and business decisions',async()=>{
 const {sql,env}=fixture();
 sql.prepare("INSERT INTO escalations(id,contact_id,message_id,category,summary,status) VALUES('offer','p','m4','offer_or_hold','Real booking offer','open')").run();
 const m=sql.prepare("SELECT * FROM messages WHERE id='m1'").get();
 await applyVendorReviewHold(env,m,new Date('2026-11-09T23:00:00Z'));
 assert.equal(sql.prepare("SELECT status,campaign_active FROM prospects WHERE id='p'").get().status,'Replied');
 assert.equal(sql.prepare("SELECT campaign_active FROM prospects WHERE id='p'").get().campaign_active,0);
 sql.prepare("UPDATE prospects SET status='Do not contact',suppressed=1,metadata_json='{}'").run();
 await applyVendorReviewHold(env,m,new Date('2026-11-09T23:00:00Z'));
 assert.equal(sql.prepare("SELECT metadata_json FROM prospects WHERE id='p'").get().metadata_json,'{}');
 assert.equal(sql.prepare("SELECT status FROM escalations WHERE id='offer'").get().status,'open');
 sql.close();
});
