// SNHD adapter. Other Nevada areas must use their own verified source rules.
export const SOURCE_URL = 'https://www.southernnevadahealthdistrict.org/restaurants/download/restaurants.zip';
export const SOURCE_PAGE = 'https://www.southernnevadahealthdistrict.org/permits-and-regulations/restaurant-inspections/developers/';
export const CITIES = new Set(['blue diamond','boulder city','cal-nev-ari','cottonwood cove','glendale','goodsprings','henderson','indian springs','jean','las vegas','laughlin','lee canyon','logandale','mesquite','moapa','north las vegas','overton','primm','sandy valley','searchlight','coyote springs','mt charleston','mountain springs','bunkerville','palm gardens']);
const clean = (s) => String(s || '').trim();
const day = (s) => /^\d{4}-\d{2}-\d{2}/.test(clean(s)) ? clean(s).slice(0,10) : '';

function findMember(bytes, wanted) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i=bytes.length-22; i>=Math.max(0,bytes.length-65557); i--) if (v.getUint32(i,true)===0x06054b50) { end=i; break; }
  if (end<0) throw Error('SNHD download is not a ZIP');
  const count=v.getUint16(end+10,true); let at=v.getUint32(end+16,true);
  for (let i=0;i<count;i++) {
    if (v.getUint32(at,true)!==0x02014b50) throw Error('Invalid ZIP directory');
    const method=v.getUint16(at+10,true), size=v.getUint32(at+20,true), raw=v.getUint32(at+24,true);
    const n=v.getUint16(at+28,true), extra=v.getUint16(at+30,true), comment=v.getUint16(at+32,true);
    const name=new TextDecoder().decode(bytes.subarray(at+46,at+46+n));
    if (name===wanted) {
      const local=v.getUint32(at+42,true);
      if (v.getUint32(local,true)!==0x04034b50) throw Error('Invalid ZIP member');
      const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
      if (start+size>bytes.length || raw>40_000_000) throw Error('Unexpected CSV size');
      return {method,data:bytes.subarray(start,start+size)};
    }
    at+=46+n+extra+comment;
  }
  throw Error(`Official ZIP is missing ${wanted}`);
}

async function memberText(bytes,name) {
  const m=findMember(bytes,name);
  if (m.method===0) return new TextDecoder().decode(m.data);
  if (m.method!==8) throw Error('Unsupported ZIP compression');
  return new Response(new Blob([m.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
}

export function parseCSV(text,required,onRow) {
  let headers=null, field='', row=[], quoted=false, count=0;
  const emit=()=>{
    row.push(field); field='';
    if (!headers) {
      headers=row.map(x=>x.replace(/^\ufeff/,'').trim());
      for (const key of required) if (!headers.includes(key)) throw Error(`Official CSV missing ${key}`);
    } else if (row.length===headers.length && row.some(x=>x.trim())) {
      onRow(Object.fromEntries(headers.map((key,i)=>[key,row[i]]))); count++;
    }
    row=[];
  };
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (c==='"') { if (quoted && text[i+1]==='"') {field+='"';i++;} else quoted=!quoted; }
    else if (!quoted && c===';') {row.push(field);field='';}
    else if (!quoted && (c==='\n'||c==='\r')) {if(c==='\r'&&text[i+1]==='\n')i++;emit();}
    else field+=c;
  }
  if (quoted) throw Error('Unclosed CSV quote');
  if (field||row.length) emit();
  return count;
}

export async function parseOfficialZip(blob,existingKeys=new Set()) {
  const bytes=blob instanceof Uint8Array?blob:new Uint8Array(blob);
  if(bytes.length>80_000_000)throw Error('Official ZIP is too large');
  const groups=new Map();
  const rowsSeen=parseCSV(await memberText(bytes,'restaurant_establishments.csv'),
    ['permit_number','facility_id','restaurant_name','location_name','address','city_name','zip_code','record_status','current_grade','date_current'],row=>{
      const permit=clean(row.permit_number), key=`snhd:${permit}`;
      if(!permit||!CITIES.has(clean(row.city_name).toLowerCase()))return;
      if(!['B','C'].includes(clean(row.current_grade).toUpperCase())&&!existingKeys.has(key))return;
      if(!groups.has(key))groups.set(key,[]); groups.get(key).push(row);
    });
  const latest=new Map();
  parseCSV(await memberText(bytes,'restaurant_inspections.csv'),['permit_number','inspection_date','inspection_grade_new'],row=>{
    const key=`snhd:${clean(row.permit_number)}`, date=day(row.inspection_date);
    if(!groups.has(key)||!date)return;
    const grade=clean(row.inspection_grade_new).toUpperCase(), old=latest.get(key);
    if(!old||date>old.date)latest.set(key,{date,grades:new Set([grade])});
    else if(date===old.date)old.grades.add(grade);
  });
  const records=[];
  for(const [key,rows] of groups){
    rows.sort((a,b)=>day(b.date_current).localeCompare(day(a.date_current)));
    const row=rows[0],statuses=new Set(rows.map(r=>clean(r.record_status))),grades=new Set(rows.map(r=>clean(r.current_grade).toUpperCase()));
    const grade=clean(row.current_grade).toUpperCase(),inspectionDate=day(row.date_current),ins=latest.get(key);
    let reason='';
    if(statuses.size!==1||!statuses.has('01'))reason='inactive, closed, or unclear status';
    else if(grades.size!==1)reason='permit has conflicting current grades';
    else if(!['B','C'].includes(grade))reason='current grade is not B or C';
    else if(!inspectionDate||!ins||ins.date!==inspectionDate||ins.grades.size!==1||!ins.grades.has(grade))reason='current grade and latest inspection disagree or are incomplete';
    records.push({business_key:key,permit_number:clean(row.permit_number),facility_id:clean(row.facility_id),name:clean(row.restaurant_name),location_name:clean(row.location_name),address:clean(row.address),city:clean(row.city_name),zip_code:clean(row.zip_code),record_status:clean(row.record_status),grade,inspection_date:inspectionDate,latest_grade:ins?.grades.size===1?[...ins.grades][0]:'',latest_date:ins?.date||'',eligible:reason?0:1,hold_reason:reason});
  }
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return {source:'Southern Nevada Health District',source_url:SOURCE_URL,sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''),checked_at:new Date().toISOString(),rows_seen:rowsSeen,records,qualified:records.filter(r=>r.eligible).length};
}

export async function fetchOfficialZip(){
  const response=await fetch(SOURCE_URL,{headers:{'Cache-Control':'no-cache'},cf:{cacheTtl:0}});
  if(!response.ok)throw Error(`SNHD download failed (${response.status})`);
  if(Number(response.headers.get('content-length')||0)>80_000_000)throw Error('Official ZIP is too large');
  return response.arrayBuffer();
}
