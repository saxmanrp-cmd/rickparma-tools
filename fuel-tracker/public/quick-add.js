(function(){
'use strict';
const KEY='fuel-quick-add-v1';
const DEFAULTS=[
  {name:'🥩 Ribeye 8 oz',cal:656,p:56,c:0,f:48},
  {name:'🍳 Eggs x3',cal:216,p:19,c:1,f:14},
  {name:'🥓 Bacon x3',cal:129,p:9,c:0,f:10},
  {name:'🍤 Shrimp 6 oz',cal:168,p:40,c:1,f:2},
  {name:'🍗 Chicken 8 oz',cal:416,p:64,c:0,f:16},
  {name:'🧀 Cheese 1 oz',cal:115,p:7,c:1,f:10},
  {name:'🥔 Potato',cal:130,p:3,c:30,f:0},
  {name:'🍚 Rice 1/2 cup',cal:103,p:2,c:23,f:0}
];
let busy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function getFavs(){try{const raw=localStorage.getItem(KEY);if(raw){const a=JSON.parse(raw);if(Array.isArray(a))return a}localStorage.setItem(KEY,JSON.stringify(DEFAULTS));return DEFAULTS.slice()}catch{return DEFAULTS.slice()}}
function setFavs(a){try{localStorage.setItem(KEY,JSON.stringify(a));return true}catch{return false}}
function todayKey(){const d=new Date();return 'fuel-meals-'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function meals(){try{return JSON.parse(localStorage.getItem(todayKey())||'[]')}catch{return []}}
function setMeals(a){try{localStorage.setItem(todayKey(),JSON.stringify(a));return true}catch{return false}}
function toast(msg){let t=document.getElementById('qaToast');if(!t){t=document.createElement('div');t.id='qaToast';t.style.cssText='position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:80;background:#192844;color:#fff;border:1px solid #3a4d70;border-radius:14px;padding:11px 14px;font-weight:700;box-shadow:0 8px 30px #0008;max-width:90%;text-align:center';document.body.appendChild(t)}t.textContent=msg;t.style.display='block';clearTimeout(t._tm);t._tm=setTimeout(()=>t.style.display='none',1800)}
function addFavoriteToLog(f){const a=meals();a.push({id:Date.now()+Math.floor(Math.random()*1000),time:new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}),name:f.name,cal:+f.cal||0,p:+f.p||0,c:+f.c||0,f:+f.f||0,source:'quick add'});if(setMeals(a))location.reload();else toast('Could not save this food.')}
function renderQuick(){const q=document.getElementById('quick');if(!q||busy)return;busy=true;const favs=getFavs();q.innerHTML=favs.length?favs.map((f,i)=>`<button type="button" class="qaUse" data-qa="${i}" style="background:#0c1628;color:white;border:1px solid #2a3b5d;text-align:left"><b>${esc(f.name)}</b><small>${Math.round(+f.cal||0)} cal · ${Math.round(+f.p||0)}P · ${Math.round(+f.c||0)}C · ${Math.round(+f.f||0)}F</small></button>`).join(''):'<div class="muted">No Quick Add foods yet. Add one from Today\'s food.</div>';
q.querySelectorAll('.qaUse').forEach(b=>b.addEventListener('click',()=>{const f=getFavs()[+b.dataset.qa];if(f)addFavoriteToLog(f)}));
const title=q.closest('.card')?.querySelector('.sectiontitle');if(title&&!document.getElementById('qaManageBtn')){const old=title.querySelector('.pill');if(old)old.remove();const m=document.createElement('button');m.id='qaManageBtn';m.className='secondary';m.style.cssText='padding:7px 10px;font-size:12px';m.textContent='Edit Quick Add';m.addEventListener('click',openManager);title.appendChild(m)}
busy=false}
function addMealButtons(){const container=document.getElementById('meals');if(!container)return;container.querySelectorAll('.meal').forEach(row=>{if(row.querySelector('.qaSaveMeal'))return;const edit=row.querySelector('.editMeal');if(!edit)return;const b=document.createElement('button');b.type='button';b.className='secondary qaSaveMeal';b.dataset.id=edit.dataset.id;b.style.cssText='padding:3px 7px;font-size:11px;margin-left:3px';b.textContent='☆ quick';b.addEventListener('click',()=>saveLoggedMeal(b.dataset.id));edit.parentNode.insertBefore(b,edit)});
}
function saveLoggedMeal(id){const m=meals().find(x=>String(x.id)===String(id));if(!m)return toast('I could not find that logged food.');const favs=getFavs();const candidate={name:m.name,cal:+m.cal||0,p:+m.p||0,c:+m.c||0,f:+m.f||0};const duplicate=favs.findIndex(x=>x.name.trim().toLowerCase()===candidate.name.trim().toLowerCase());if(duplicate>=0){favs[duplicate]=candidate;setFavs(favs);renderQuick();toast('Quick Add updated.')}else{favs.push(candidate);setFavs(favs);renderQuick();toast('Added to Quick Add.')}}
function ensureModal(){let modal=document.getElementById('qaModal');if(modal)return modal;modal=document.createElement('div');modal.id='qaModal';modal.style.cssText='display:none;position:fixed;inset:0;background:#000d;z-index:70;overflow:auto;padding:20px 12px';modal.innerHTML=`<div style="max-width:700px;margin:auto;background:#121c31;border:1px solid #2a3b5d;border-radius:22px;padding:16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px"><h2 style="margin:0;font-size:19px">Edit Quick Add</h2><button id="qaClose" class="secondary">Close</button></div><div id="qaList"></div></div>`;document.body.appendChild(modal);modal.querySelector('#qaClose').addEventListener('click',()=>modal.style.display='none');modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none'});return modal}
function openManager(){const modal=ensureModal(),list=modal.querySelector('#qaList'),favs=getFavs();list.innerHTML=favs.length?favs.map((f,i)=>`<div data-qrow="${i}" style="border-top:1px solid #2a3b5d;padding:12px 0"><input class="qn" value="${esc(f.name)}" placeholder="Food name"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:7px"><input class="qcal" type="number" value="${+f.cal||0}" placeholder="Cal"><input class="qp" type="number" value="${+f.p||0}" placeholder="Protein"><input class="qc" type="number" value="${+f.c||0}" placeholder="Carbs"><input class="qf" type="number" value="${+f.f||0}" placeholder="Fat"></div><div style="display:flex;gap:8px;margin-top:8px"><button class="secondary qaSave" data-i="${i}" style="flex:1">Save changes</button><button class="danger qaDelete" data-i="${i}" style="flex:1;padding:10px;font-size:14px">Delete</button></div></div>`).join(''):'<div class="muted">No Quick Add foods yet.</div>';
list.querySelectorAll('.qaSave').forEach(b=>b.addEventListener('click',()=>saveFavoriteEdit(+b.dataset.i,b.closest('[data-qrow]'))));list.querySelectorAll('.qaDelete').forEach(b=>b.addEventListener('click',()=>deleteFavorite(+b.dataset.i)));modal.style.display='block'}
function saveFavoriteEdit(i,row){const favs=getFavs();if(!favs[i]||!row)return;favs[i]={name:row.querySelector('.qn').value.trim()||'Food',cal:+row.querySelector('.qcal').value||0,p:+row.querySelector('.qp').value||0,c:+row.querySelector('.qc').value||0,f:+row.querySelector('.qf').value||0};setFavs(favs);renderQuick();toast('Quick Add saved.');openManager()}
function deleteFavorite(i){const favs=getFavs();if(!favs[i])return;if(!confirm(`Delete “${favs[i].name}” from Quick Add?`))return;favs.splice(i,1);setFavs(favs);renderQuick();openManager();toast('Removed from Quick Add.')}
function enhance(){renderQuick();addMealButtons()}
const observer=new MutationObserver(()=>{if(busy)return;requestAnimationFrame(enhance)});observer.observe(document.body,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
})();
