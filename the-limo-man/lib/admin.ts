import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { json } from './subscribers';
export async function isOwner() {
  const user=await getChatGPTUser(); if(!user) return false;
  if(import.meta.env.DEV && user.email==='seedy@sites.test') return true;
  return !!env.OWNER_EMAIL && user.email.toLowerCase()===env.OWNER_EMAIL.trim().toLowerCase();
}
export async function ownerGuard() { return await isOwner() ? null : json({error:'Owner sign-in required.'},403); }
