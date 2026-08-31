(()=>{
'use strict';
function installStyle(){if(document.getElementById('fuelUiCleanupStyle'))return;const style=document.createElement('style');style.id='fuelUiCleanupStyle';style.textContent=`
.logAction small,#reviewNote,#scannerWrap p.note,#settings .card>p.note,#progress .card>p.note,#healthNote,#fuelCoachHistoryCard>p.note,.fcVoiceNote,#bsChange .note{display:none!important}
.logAction{min-height:64px!important;display:flex;align-items:center}
.metric small,.meal small,.resultBtn small,.receiptItem small{font-size:13px!important}
#reviewTotals,#scanList,.status{font-size:14px!important}
`;document.head.appendChild(style)}
function removeNoise(){document.querySelectorAll('.sectiontitle .pill').forEach(el=>{const t=el.textContent.trim().toLowerCase();if(['1 tap','optional','choose a tool','baseline'].includes(t))el.remove()})}
function run(){installStyle();removeNoise()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
setTimeout(run,500);setTimeout(run,1200);
window.addEventListener('fuel-health-synced',run);
})();
