const byId = id => document.getElementById(id);
let page=0, version=0, timer;
function message(text,error=false){ const el=byId('admin-message'); el.textContent=text;el.hidden=!text;el.className=error?'admin-error':'admin-notice'; }
async function load(){
  const current=++version;byId('refresh').disabled=true;
  try{
    const q=new URLSearchParams({search:byId('search').value,status:byId('filter').value,page:String(page)});
    const response=await fetch('/api/admin/subscribers?'+q,{cache:'no-store'});
    if(!response.ok)throw new Error('Could not load the list. Sign in as the site owner and try again.');
    const data=await response.json();if(current!==version)return;
    byId('active-count').textContent=(data.counts.active||0).toLocaleString();
    byId('reader-rows').replaceChildren();
    for(const row of data.subscribers){
      const tr=document.createElement('tr');
      const email=document.createElement('td'),strong=document.createElement('strong');strong.textContent=row.email;email.append(strong);
      const details=document.createElement('details'),summary=document.createElement('summary'),consent=document.createElement('p');summary.textContent='Consent';consent.textContent=row.consent_text;details.append(summary,consent);email.append(details);tr.append(email);
      const values=[new Date(row.subscribed_at).toLocaleString('en-US',{timeZone:'America/Los_Angeles',dateStyle:'medium',timeStyle:'short'}),row.status,row.source];
      for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}
      const manage=document.createElement('td');
      if(row.status==='subscribed'){
        const button=document.createElement('button');button.className='admin-link';button.textContent='Unsubscribe';
        button.addEventListener('click',async()=>{
          if(!confirm(`Mark ${row.email} as unsubscribed? Their record and consent history will stay saved.`))return;
          button.disabled=true;
          try{const r=await fetch('/api/admin/subscribers',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.id})});if(!r.ok)throw new Error();message('Subscriber marked as unsubscribed.');await load();}
          catch{message('Could not update this subscriber.',true);button.disabled=false;}
        });manage.append(button);
      }
      tr.append(manage);byId('reader-rows').append(tr);
    }
    byId('empty').hidden=data.subscribers.length>0;byId('empty').textContent='No matching readers yet.';
    byId('matching').textContent=data.total.toLocaleString()+' matching readers';byId('page').textContent='Page '+(page+1);
    byId('previous').disabled=page===0;byId('next').disabled=(page+1)*100>=data.total;
  }catch(error){message(error.message||'Could not load subscribers.',true);}
  finally{if(current===version)byId('refresh').disabled=false;}
}
byId('search').addEventListener('input',()=>{page=0;clearTimeout(timer);timer=setTimeout(load,250);});
byId('filter').addEventListener('change',()=>{page=0;load();});
byId('refresh').addEventListener('click',load);
byId('previous').addEventListener('click',()=>{page--;load();});
byId('next').addEventListener('click',()=>{page++;load();});
byId('import').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;event.target.disabled=true;
  try{const r=await fetch('/api/admin/subscribers/import',{method:'POST',headers:{'Content-Type':'text/csv'},body:await file.text()});const d=await r.json();if(!r.ok)throw new Error(d.error);message(`Imported ${d.inserted}; ${d.duplicates} already saved; ${d.skipped} skipped.`);await load();}
  catch(error){message(error.message||'Import failed.',true);}
  finally{event.target.disabled=false;event.target.value='';}
});
load();
