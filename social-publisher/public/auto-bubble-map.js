// Automatically detects the large light speech bubble in uploaded background images.
// It only intercepts background-image PUT uploads and replaces the default bubble coordinates.
(() => {
  if (window.__socialPublisherAutoBubbleMapInstalled) return;
  window.__socialPublisherAutoBubbleMapInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  const fallback = {x:0.08,y:0.055,width:0.84,height:0.27};
  const clamp = (n,min,max) => Math.max(min,Math.min(max,n));

  async function loadBitmap(blob) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(blob); } catch {}
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise((resolve,reject) => { image.onload=resolve; image.onerror=reject; image.src=url; });
      return image;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url),0);
    }
  }

  function componentCandidates(data,width,height,threshold) {
    const size = width*height;
    const mask = new Uint8Array(size);
    const visited = new Uint8Array(size);
    for (let i=0,p=0; i<data.length; i+=4,p++) {
      const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
      const max=Math.max(r,g,b), min=Math.min(r,g,b);
      if (a > 180 && min >= threshold && max-min <= 38) mask[p]=1;
    }

    const candidates=[];
    const queue = new Int32Array(size);
    for (let start=0; start<size; start++) {
      if (!mask[start] || visited[start]) continue;
      let head=0, tail=0;
      queue[tail++]=start;
      visited[start]=1;
      let count=0, minX=width, maxX=0, minY=height, maxY=0;

      while (head<tail) {
        const p=queue[head++];
        const x=p%width, y=(p/width)|0;
        count++;
        if (x<minX) minX=x; if (x>maxX) maxX=x;
        if (y<minY) minY=y; if (y>maxY) maxY=y;
        const left=p-1, right=p+1, up=p-width, down=p+width;
        if (x>0 && mask[left] && !visited[left]) { visited[left]=1; queue[tail++]=left; }
        if (x<width-1 && mask[right] && !visited[right]) { visited[right]=1; queue[tail++]=right; }
        if (y>0 && mask[up] && !visited[up]) { visited[up]=1; queue[tail++]=up; }
        if (y<height-1 && mask[down] && !visited[down]) { visited[down]=1; queue[tail++]=down; }
      }

      const bw=maxX-minX+1, bh=maxY-minY+1;
      const nx=minX/width, ny=minY/height, nw=bw/width, nh=bh/height;
      const rectArea=bw*bh;
      const fill=count/Math.max(1,rectArea);
      const area=count/size;
      if (area < .012 || area > .34) continue;
      if (nw < .18 || nw > .94 || nh < .055 || nh > .40) continue;
      if (ny > .58 || fill < .30) continue;

      const centerY=ny+nh/2;
      const upperBonus=1.7-clamp(centerY,0,1);
      const shapeBonus=0.7+Math.min(0.7,fill);
      const widthBonus=0.8+Math.min(0.5,nw);
      candidates.push({minX,maxX,minY,maxY,bw,bh,count,fill,score:count*upperBonus*shapeBonus*widthBonus});
    }
    return candidates.sort((a,b)=>b.score-a.score);
  }

  async function detectBubble(blob) {
    let bitmap;
    try {
      bitmap=await loadBitmap(blob);
      const sourceWidth=bitmap.width || bitmap.naturalWidth;
      const sourceHeight=bitmap.height || bitmap.naturalHeight;
      if (!sourceWidth || !sourceHeight) return fallback;

      const analysisWidth=Math.min(190,sourceWidth);
      const analysisHeight=Math.max(1,Math.round(sourceHeight*(analysisWidth/sourceWidth)));
      const canvas=document.createElement('canvas');
      canvas.width=analysisWidth;
      canvas.height=analysisHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(bitmap,0,0,analysisWidth,analysisHeight);
      const pixels=ctx.getImageData(0,0,analysisWidth,analysisHeight).data;

      let candidates=componentCandidates(pixels,analysisWidth,analysisHeight,222);
      if (!candidates.length) candidates=componentCandidates(pixels,analysisWidth,analysisHeight,205);
      const best=candidates[0];
      if (!best) return fallback;

      // Use the white region to find the bubble, then inset it so text stays away from the black outline and tail.
      const x=best.minX/analysisWidth;
      const y=best.minY/analysisHeight;
      const w=best.bw/analysisWidth;
      const h=best.bh/analysisHeight;
      const insetX=w*.085;
      const insetTop=h*.12;
      const insetBottom=h*.22;
      return {
        x:clamp(x+insetX,0,.92),
        y:clamp(y+insetTop,0,.92),
        width:clamp(w-(insetX*2),.10,1-(x+insetX)),
        height:clamp(h-insetTop-insetBottom,.08,1-(y+insetTop)),
      };
    } catch (error) {
      console.warn('Auto bubble mapping used the default area:',error);
      return fallback;
    } finally {
      try { bitmap?.close?.(); } catch {}
    }
  }

  function isBackgroundUpload(input,init) {
    const url=typeof input === 'string' ? input : input?.url || '';
    const method=String(init?.method || '').toUpperCase();
    const body=init?.body;
    return method === 'PUT' && /\/api\/comic-templates\//.test(url) && body instanceof Blob;
  }

  window.fetch = async function(input,init={}) {
    if (!isBackgroundUpload(input,init)) return nativeFetch(input,init);
    const bubble=await detectBubble(init.body);
    const headers=new Headers(init.headers || {});
    headers.set('x-bubble-x',bubble.x.toFixed(4));
    headers.set('x-bubble-y',bubble.y.toFixed(4));
    headers.set('x-bubble-width',bubble.width.toFixed(4));
    headers.set('x-bubble-height',bubble.height.toFixed(4));
    return nativeFetch(input,{...init,headers});
  };
})();