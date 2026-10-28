import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV } from '../src/snhd.js';
import { renderLetter, classifyReply } from '../src/workflow.js';
import { profileMissing } from '../src/store.js';

const profile={
  business_name:'Food Safety with Gazelle',services:'food safety consulting',offer:'I can help your team prepare a practical food safety plan.',
  style:'Warm and direct',sender_name:'Gazelle Jacobs',title:'Food Safety Consultant & Trainer',
  sender_email:'support@foodsafetywithgazelle.com',postal_address:'123 Test Street, Las Vegas, NV 89101',
  contact_details:'562.533.3230',instagram:'Food_Safety_With_Gazelle'
};
const place={name:'Sample Restaurant',grade:'B',inspection_date:'2026-10-21',eligible:1};

test('official semicolon CSV handles quoted delimiters and line breaks',()=>{
  const rows=[];
  const count=parseCSV('permit_number;restaurant_name\r\n1;"Sample; Kitchen"\r\n2;"Two\nLines"\r\n',['permit_number','restaurant_name'],row=>rows.push(row));
  assert.equal(count,2);
  assert.equal(rows[0].restaurant_name,'Sample; Kitchen');
  assert.equal(rows[1].restaurant_name,'Two\nLines');
});

test('a grade is optional in the letter and its date and independence are explicit when used',()=>{
  const plain=renderLetter(profile,place,'first',false);
  assert.doesNotMatch(plain.body,/\bB grade\b/);
  assert.match(plain.body,/Advertisement from Food Safety with Gazelle/);
  assert.match(plain.body,/unsubscribe/);
  assert.match(plain.body,/89101/);
  const verified=renderLetter(profile,place,'first',true);
  assert.match(verified.body,/October 21, 2026 inspection lists a B grade/);
  assert.match(verified.body,/not affiliated with the district/);
  assert.doesNotMatch(renderLetter(profile,{...place,eligible:0},'first',true).body,/B grade/);
});

test('postal address, offer, and style remain required before drafting',()=>{
  assert.deepEqual(profileMissing(profile),[]);
  assert.ok(profileMissing({...profile,postal_address:'support@foodsafetywithgazelle.com'}).includes('postal_address'));
  assert.ok(profileMissing({...profile,offer:''}).includes('offer'));
  assert.ok(profileMissing({...profile,style:''}).includes('style'));
});

test('replies flag opt-outs, bounces, pricing, and interest for review',()=>{
  assert.equal(classifyReply('Re: Hello','Please unsubscribe','owner@example.com'),'opt_out');
  assert.equal(classifyReply('Undeliverable','', 'mailer-daemon@example.com'),'bounce');
  assert.equal(classifyReply('Re: Hello','What does it cost?','owner@example.com'),'pricing');
  assert.equal(classifyReply('Re: Hello',"I'm interested",'owner@example.com'),'interested');
  assert.equal(classifyReply('Re: Hello','Thanks','owner@example.com'),'needs_review');
});
