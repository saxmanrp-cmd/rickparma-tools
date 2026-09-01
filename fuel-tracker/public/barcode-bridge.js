(()=>{
'use strict';
const $=id=>document.getElementById(id);
const isNativeFuel=new URLSearchParams(location.search).get('native')==='1';
let webScanner=null,locked=false,barcodeLookupPending=false,barcodePanelWasOpen=false;

function status(id,msg){
  const el=$(id);
  if(!el)return;
  el.style.display=msg?'block':'none';
  el.textContent=msg||'';
}

function clearScanState({keepStatus=false}={}){
  locked=false;
  barcodeLookupPending=false;
  const input=$('barcodeCode');
  if(input)input.value='';
  if(!keepStatus)status('barcodeStatus','');
  status('scannerMsg','');
}

function normalize(code){
  const d=String(code||'').replace(/\D/g,'');
  return d.length===13&&d.startsWith('0')?d.slice(1):d;
}

function formats(){
  const F=window.Html5QrcodeSupportedFormats;
  if(!F)return undefined;
  return [F.UPC_A,F.UPC_E,F.EAN_13,F.EAN_8,F.CODE_128,F.CODE_39];
}

async function stopWeb(hide=true){
  try{
    if(webScanner){
      try{await webScanner.stop()}catch{}
      try{await webScanner.clear()}catch{}
    }
  }finally{
    webScanner=null;
    if(hide)$('scannerWrap')?.classList.remove('open');
  }
}

async function finish(code){
  if(locked)return;
  const clean=normalize(code);
  if(!clean)return;

  locked=true;
  await stopWeb();

  const input=$('barcodeCode');
  if(input)input.value=clean;

  const lookup=$('barcodeLookup');
  if(lookup){
    barcodeLookupPending=true;
    lookup.click();
    // lookupBarcode() reads the value synchronously. Clear it immediately
    // afterward so a previous product can never contaminate the next scan.
    if(input)input.value='';
  }

  locked=false;
}

function nativeBridge(){
  return window.webkit?.messageHandlers?.fuelBarcode;
}

async function scanNative(){
  const bridge=nativeBridge();
  if(!bridge)return false;

  try{
    status('barcodeStatus','Point the camera at a barcode…');
    const result=await bridge.postMessage({action:'scan'});

    if(result?.ok&&result.code){
      await finish(result.code);
      return true;
    }

    if(result?.cancelled){
      status('barcodeStatus','');
      return true;
    }

    status('barcodeStatus',result?.error||'Could not scan that barcode.');
    return true;
  }catch(error){
    status('barcodeStatus','The native barcode scanner could not start.');
    return true;
  }
}

async function improveTrack(){
  try{
    const video=document.querySelector('#reader video');
    const track=video?.srcObject?.getVideoTracks?.()[0];
    if(!track)return;
    const caps=track.getCapabilities?.()||{};
    const advanced=[];
    if(Array.isArray(caps.focusMode)&&caps.focusMode.includes('continuous')){
      advanced.push({focusMode:'continuous'});
    }
    if(caps.zoom&&Number.isFinite(caps.zoom.max)&&caps.zoom.max>1){
      advanced.push({zoom:Math.min(1.25,caps.zoom.max)});
    }
    if(advanced.length)await track.applyConstraints({advanced});
  }catch{}
}

async function startWeb(){
  const wrap=$('scannerWrap'),reader=$('reader');
  if(!wrap||!reader)return;

  wrap.classList.add('open');
  locked=false;
  status('scannerMsg','Center the whole barcode in the box and hold still.');

  if(!window.Html5Qrcode){
    status('scannerMsg','Barcode scanner did not load. Type the number instead.');
    return;
  }

  await stopWeb(false);
  reader.innerHTML='';

  try{
    webScanner=new Html5Qrcode('reader',{formatsToSupport:formats(),verbose:false});
    await webScanner.start(
      {facingMode:'environment'},
      {
        fps:15,
        qrbox:(w,h)=>({
          width:Math.min(Math.floor(w*.9),420),
          height:Math.min(Math.floor(h*.4),180)
        }),
        aspectRatio:1.5,
        disableFlip:true
      },
      finish,
      ()=>{}
    );

    const video=reader.querySelector('video');
    if(video){
      video.setAttribute('playsinline','true');
      video.setAttribute('webkit-playsinline','true');
      video.playsInline=true;
      video.controls=false;
      video.muted=true;
      video.style.objectFit='cover';
      video.style.width='100%';
      video.style.height='100%';
    }

    await improveTrack();
  }catch(error){
    status('scannerMsg','Live scan is having trouble. Type the barcode number below.');
  }
}

async function startSmartScan(){
  await stopWeb();
  clearScanState();

  if(await scanNative())return;

  // Fuel on iPhone must use the real native scanner. Never fall back to
  // an HTML <video> inside WKWebView because iOS can promote it to a
  // full-screen media player and barcode recognition becomes unreliable.
  if(isNativeFuel){
    status('barcodeStatus','Fuel needs the latest iPhone build to use the native barcode scanner.');
    return;
  }

  await startWeb();
}

document.addEventListener('click',e=>{
  const scan=e.target.closest('#barcodeScan');
  if(scan){
    e.preventDefault();
    e.stopImmediatePropagation();
    startSmartScan();
    return;
  }

  const stop=e.target.closest('#stopScanner');
  if(stop){
    stopWeb();
    clearScanState({keepStatus:true});
    return;
  }

  const lookup=e.target.closest('#barcodeLookup');
  if(lookup){
    barcodeLookupPending=true;
  }
},true);

const observer=new MutationObserver(()=>{
  const tool=$('barcodeTool');
  const panelOpen=!!tool?.classList.contains('open');

  if(panelOpen&&!barcodePanelWasOpen){
    stopWeb();
    clearScanState();
  }
  barcodePanelWasOpen=panelOpen;

  const review=$('review');
  if(barcodeLookupPending&&review?.classList.contains('open')){
    const input=$('barcodeCode');
    if(input)input.value='';
    barcodeLookupPending=false;
  }
});

observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});
window.addEventListener('pagehide',()=>stopWeb(false));
})();
