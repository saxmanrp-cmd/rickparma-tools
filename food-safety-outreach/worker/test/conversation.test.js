import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { recordReply } from '../src/workflow.js';
import { renderPage } from '../src/ui.js';
import { sendConversationReplies } from '../src/conversations.js';
import { pollInbox } from '../src/graph.js';
import { SOURCE_URL } from '../src/snhd.js';

function sampleDatabase({mode='test',paused='1',conversationMode='off',postalAddress='123 Test Street, Las Vegas, NV 89101'}={}){
  const raw=new DatabaseSync(':memory:');
  raw.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const db={
    prepare(sql){
      const statement=raw.prepare(sql);
      const bound=(args=[])=>({
        bind:(...values)=>bound(values),
        first:async()=>statement.get(...args)||null,
        all:async()=>({results:statement.all(...args)}),
        run:async()=>({meta:{changes:statement.run(...args).changes}})
      });
      return bound();
    },
    batch:async statements=>Promise.all(statements.map(statement=>statement.run()))
  };
  const put=raw.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for(const [key,value] of Object.entries({
    mode,paused,conversation_mode:conversationMode,
    conversation_focus:'food safety inspections and staff training',
    conversation_call_offer:'I can offer a short introductory call.',
    profile_offer:'I can offer a short introductory call.',
    profile_style:'Warm and direct',
    profile_postal_address:postalAddress
  }))put.run(key,value);
  raw.prepare("INSERT INTO businesses(business_key,name,grade,inspection_date,eligible,contact_email,source_run_id) VALUES('sample','Sample Kitchen','B','2026-10-20',1,'owner@example.com',1)").run();
  raw.prepare("INSERT INTO messages(business_key,kind,recipient,subject,body,status,grade_at_draft,date_at_draft,created_at,sent_at) VALUES('sample','first','owner@example.com','Food safety support','Hello','sent','B','2026-10-20','2026-10-21T10:00:00.000Z','2026-10-21T10:01:00.000Z')").run();
  return {raw,db};
}

function inbound(id,body){
  return {id:'graph-'+id,internetMessageId:'<'+id+'@example.com>',conversationId:'thread-1',
    receivedDateTime:'2026-10-28T18:00:00.000Z',from:{emailAddress:{address:'owner@example.com'}},
    subject:'Re: Food safety support',bodyPreview:body,replyTo:[]};
}

test('a reply is drafted for review while outreach is off',async()=>{
  const {db,raw}=sampleDatabase();
  assert.equal(await recordReply(db,inbound('one','What services do you offer?')),true);
  assert.equal(raw.prepare('SELECT status FROM conversation_messages').get().status,'draft');
  assert.equal(raw.prepare('SELECT needs_handoff FROM replies').get().needs_handoff,1);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM audit WHERE event=?').get('conversation_reply_drafted').n,1);
});

test('automatic reply is queued only after complete details and explicit live settings',async()=>{
  const enabled=sampleDatabase({mode:'live',paused:'0',conversationMode:'auto'});
  await recordReply(enabled.db,inbound('two','What does it cost?'));
  const row=enabled.raw.prepare('SELECT status,body FROM conversation_messages').get();
  assert.equal(row.status,'auto_approved');
  assert.match(row.body,/Pricing depends on the work involved/);
  assert.match(row.body,/123 Test Street/);
  const incomplete=sampleDatabase({mode:'live',paused:'0',conversationMode:'auto',postalAddress:''});
  await recordReply(incomplete.db,inbound('three','What does it cost?'));
  assert.equal(incomplete.raw.prepare('SELECT COUNT(*) AS n FROM conversation_messages').get().n,0);
  assert.equal(incomplete.raw.prepare('SELECT needs_handoff FROM replies').get().needs_handoff,1);
});

test('an opt-out stops the conversation and suppresses future contact',async()=>{
  const {db,raw}=sampleDatabase({mode:'live',paused:'0',conversationMode:'auto'});
  await recordReply(db,inbound('four','Please unsubscribe'));
  assert.equal(raw.prepare('SELECT status FROM conversation_states').get().status,'human');
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM conversation_messages').get().n,0);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM suppressions WHERE kind='email' AND value='owner@example.com'").get().n,1);
});

test('the private panel shows reply drafts and simple conversation controls',async()=>{
  const {db}=sampleDatabase();
  await recordReply(db,inbound('five','What services do you offer?'));
  const replies=await renderPage('/replies',{DB:db});
  const settings=await renderPage('/settings',{DB:db});
  assert.match(replies,/Approve this reply/);
  assert.match(replies,/Gazelle will take over/);
  assert.match(settings,/Back-and-forth emails/);
  assert.match(settings,/Off — show drafts only/);
});

test('Test, Pause, and the separate conversation Off switch prevent reply sending',async()=>{
  for(const options of [
    {mode:'test',paused:'0',conversationMode:'auto'},
    {mode:'live',paused:'1',conversationMode:'auto'},
    {mode:'live',paused:'0',conversationMode:'off'}
  ]){
    const {db}=sampleDatabase(options);
    assert.equal(await sendConversationReplies({DB:db},1,async()=>true),0);
  }
});

test('an approved automatic answer uses the existing Microsoft thread once',async()=>{
  const {db,raw}=sampleDatabase({mode:'live',paused:'0',conversationMode:'auto'});
  raw.prepare('INSERT INTO source_runs(id,source,url,sha256,checked_at,rows_seen,qualified,held) VALUES(1,?,?,?,?,1000,1,0)')
    .run('Southern Nevada Health District',SOURCE_URL,'sample',new Date().toISOString());
  await recordReply(db,inbound('six','What does it cost?'));
  const calls=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url,options={})=>{
    calls.push({url:String(url),method:options.method||'GET'});
    if(String(url).startsWith('https://login.microsoftonline.com/'))
      return new Response(JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600}),{status:200});
    if(String(url).includes('/me?$select=mail,userPrincipalName'))
      return new Response(JSON.stringify({mail:'support@foodsafetywithgazelle.com'}),{status:200});
    if(String(url).includes('/SentItems/messages?'))
      return new Response(JSON.stringify({value:[]}),{status:200});
    if(String(url).endsWith('/reply'))return new Response(null,{status:202});
    throw Error('Unexpected Microsoft request');
  };
  try{
    const env={DB:db,GAZELLE_MS_CLIENT_ID:'client',GAZELLE_MS_TENANT:'tenant',
      GAZELLE_TOKEN_KEY:Buffer.alloc(32,7).toString('base64'),GAZELLE_INITIAL_REFRESH_TOKEN:'test-refresh'};
    assert.equal(await sendConversationReplies(env,1,async()=>true),1);
    assert.equal(raw.prepare('SELECT status FROM conversation_messages').get().status,'sent');
    assert.equal(raw.prepare('SELECT needs_handoff FROM replies').get().needs_handoff,0);
    assert.equal(calls.filter(x=>x.url.endsWith('/reply')&&x.method==='POST').length,1);
    assert.equal(await sendConversationReplies(env,1,async()=>true),0);
  }finally{globalThis.fetch=originalFetch;}
});

test('mailbox scan recovers an expired cursor and skips a message moved during the scan',async()=>{
  const {db,raw}=sampleDatabase();
  raw.prepare("INSERT INTO settings(key,value) VALUES('graph_inbox_baseline_done','1')").run();
  raw.prepare("INSERT INTO settings(key,value) VALUES('graph_inbox_delta_url','https://graph.microsoft.com/v1.0/expired')").run();
  const calls=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const path=String(url);calls.push(path);
    if(path.startsWith('https://login.microsoftonline.com/'))return new Response(JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600}),{status:200});
    if(path.includes('/me?$select=mail,userPrincipalName'))return new Response(JSON.stringify({mail:'support@foodsafetywithgazelle.com'}),{status:200});
    if(path.endsWith('/expired'))return new Response(null,{status:410});
    if(path.includes('/Inbox/messages/delta?'))return Response.json({value:[{id:'moved'},{id:'new'}],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/inbox-next'});
    if(path.includes('/JunkEmail/messages/delta?'))return Response.json({value:[],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/junk-next'});
    if(path.includes('/DeletedItems/messages/delta?'))return Response.json({value:[],'@odata.deltaLink':'https://graph.microsoft.com/v1.0/deleted-next'});
    if(path.includes('/me/messages/moved?'))return new Response(null,{status:410});
    if(path.includes('/me/messages/new?'))return Response.json({id:'new'});
    throw Error('Unexpected Microsoft request: '+path);
  };
  try{
    const env={DB:db,GAZELLE_MS_CLIENT_ID:'client',GAZELLE_MS_TENANT:'tenant',
      GAZELLE_TOKEN_KEY:Buffer.alloc(32,7).toString('base64'),GAZELLE_INITIAL_REFRESH_TOKEN:'test-refresh'};
    const seen=[];
    assert.equal(await pollInbox(env,async message=>{seen.push(message.id);return true;}),1);
    assert.deepEqual(seen,['new']);
    assert.equal(raw.prepare("SELECT value FROM settings WHERE key='graph_inbox_delta_url'").get().value,'https://graph.microsoft.com/v1.0/inbox-next');
    assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM audit WHERE event='mail_sync_reset'").get().n,1);
    assert.equal(calls.filter(path=>path.endsWith('/expired')).length,1);
  }finally{globalThis.fetch=originalFetch;}
});
