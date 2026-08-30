(function(){
'use strict';
const $=id=>document.getElementById(id);
const healthKey='fuel-apple-health-latest';
const fmt=(v,d=1)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toFixed(d).replace(/\.0$/,'');
function findCard(title){return [...document.querySelectorAll('#progress .card')].find(c=>c.querySelector('h2')?.textContent.trim()===title)}
function install(){
  const progress=$('progress');if(!progress||progress.dataset.healthPrimary)return;
  progress.dataset.healthPrimary='1';
  const manual=findCard('Add / update scan');
  if(manual){
    manual.style.display='none';manual.dataset.manualBackup='1';
    const history=findCard('Scan history');
    if(history){
      const h=history.querySelector('h2');if(h)h.textContent='Manual backup history';
      const toggle=document.createElement('button');toggle.className='secondary';toggle.style.cssText='width:100%;margin-top:10px';toggle.textContent='Add measurement manually';
      toggle.onclick=()=>{manual.style.display=manual.style.display==='none'?'block':'none';toggle.textContent=manual.style.display==='none'?'Add measurement manually':'Hide manual entry'};
      history.appendChild(toggle);
    }
  }
  apply(readHealth());
  window.addEventListener('fuel-health-synced',e=>apply(e.detail));
}
function readHealth(){try{return JSON.parse(localStorage.getItem(healthKey)||'null')}catch{return null}}
function apply(d){
  if(!d)return;
  const card=findCard('Body composition');if(!card)return;
  const grid=card.querySelector('#bsLatestGrid'),date=card.querySelector('#bsLatestDate'),more=card.querySelector('#bsLatestMore'),change=card.querySelector('#bsChange');
  if(!grid)return;
  const hasComp=[d.weightLb,d.bodyFatPercent,d.leanBodyMassLb,d.bmi,d.waistInches].some(v=>Number.isFinite(Number(v)));
  if(!hasComp)return;
  if(date)date.textContent='Apple Health · latest';
  grid.innerHTML=`<div class="metric"><b>${fmt(d.weightLb)}</b><small>weight lb</small></div>
    <div class="metric"><b>${fmt(d.bodyFatPercent)}${Number.isFinite(Number(d.bodyFatPercent))?'%':''}</b><small>body fat</small></div>
    <div class="metric"><b>${fmt(d.leanBodyMassLb)}</b><small>lean body mass lb</small></div>
    <div class="metric"><b>${fmt(d.bmi)}</b><small>BMI</small></div>`;
  const bits=[];
  if(Number.isFinite(Number(d.fatMassLb)))bits.push(`Fat mass ${fmt(d.fatMassLb)} lb`);
  if(Number.isFinite(Number(d.fatFreeMassLb)))bits.push(`Fat-free mass ${fmt(d.fatFreeMassLb)} lb`);
  if(Number.isFinite(Number(d.waistInches)))bits.push(`Waist ${fmt(d.waistInches)} in`);
  if(more)more.textContent=bits.length?bits.join(' · '):'Body composition is synced from Apple Health when a connected app or device writes it.';
  if(change)change.innerHTML='<span class="note">Apple Health is now the primary body-composition source. Manual InBody entry is kept only as a backup.</span>';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,50));else setTimeout(install,50);
})();
