/* Shared avatar tinting. Original saves remain valid; new colors use #RRGGBB. */
(() => {
  const validHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const clamp = (value,min,max,fallback) => Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback;
  const references = new Map();
  const revisions = new WeakMap();
  const matrices = new Map();
  const luminance = rgb => .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  const rgbHex = rgb => '#'+rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  const hexRgb = hex => hex.slice(1).match(/../g).map(v=>parseInt(v,16));
  function legacy(color,white=false) {
    const h=clamp(color?.hue,-180,180,0),s=clamp(color?.saturation,0,200,100),l=clamp(color?.lightness,60,140,100);
    if(white) return h===0&&s===100&&l===100 ? 'none' : `sepia(100%) saturate(${Math.max(100,s*4)}%) hue-rotate(${h-28}deg) brightness(${l}%)`;
    return `hue-rotate(${h}deg) saturate(${s}%) brightness(${l}%)`;
  }
  function reference(source) {
    if(!source)return Promise.resolve([200,180,210]);
    const url=new URL(source,location.href).href;
    if(!references.has(url)) references.set(url,(async()=>{
      const image=new Image();image.src=url;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      const {data}=ctx.getImageData(0,0,canvas.width,canvas.height),counts=new Map();
      let best=0,winner=[200,180,210];
      for(let i=0;i<data.length;i+=4){
        if(data[i+3]<220||luminance([data[i],data[i+1],data[i+2]])<30)continue;
        const key=(data[i]<<16)|(data[i+1]<<8)|data[i+2],count=(counts.get(key)||0)+1;counts.set(key,count);
        if(count>best){best=count;winner=[data[i],data[i+1],data[i+2]];}
      }
      return winner;
    })().catch(()=>[200,180,210]));
    return references.get(url);
  }
  function matrix(hex,base) {
    const level=Math.max(1,luminance(base)),key=hex.toLowerCase()+':'+level.toFixed(3);
    if(matrices.has(key))return matrices.get(key);
    let svg=document.getElementById('avatarColorFilters');
    const ns='http://www.w3.org/2000/svg';
    if(!svg){svg=document.createElementNS(ns,'svg');svg.id='avatarColorFilters';svg.setAttribute('aria-hidden','true');svg.style.cssText='position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';document.body.append(svg);}
    const id='avatarTint'+matrices.size,filter=document.createElementNS(ns,'filter'),colorMatrix=document.createElementNS(ns,'feColorMatrix');
    filter.id=id;filter.setAttribute('color-interpolation-filters','sRGB');filter.setAttribute('x','0%');filter.setAttribute('y','0%');filter.setAttribute('width','100%');filter.setAttribute('height','100%');
    const values=hexRgb(hex).flatMap(channel=>[channel/level*.2126,channel/level*.7152,channel/level*.0722,0,0]);
    values.push(0,0,0,1,0);colorMatrix.setAttribute('type','matrix');colorMatrix.setAttribute('values',values.join(' '));filter.append(colorMatrix);svg.append(filter);
    const result=`url("#${id}")`;matrices.set(key,result);return result;
  }
  async function resolve(avatar,key,bodyImage) {
    const skin=['body','head','chest'].includes(key);
    const color=skin ? avatar?.skinColor : avatar?.itemColors?.[avatar?.selection?.[key]];
    const white=Boolean(avatar?.bodyAsset&&skin);
    if(validHex(color?.hex))return {hex:color.hex};
    if(key==='chest'){
      const source=bodyImage?.getAttribute('src')||bodyImage?.dataset.avatarSource||avatar?.layers?.body;
      if(source){
        const rgb=await reference(source),canvas=document.createElement('canvas');canvas.width=canvas.height=1;
        const ctx=canvas.getContext('2d');ctx.filter=legacy(color,white);ctx.fillStyle=rgbHex(rgb);ctx.fillRect(0,0,1,1);
        return {hex:rgbHex([...ctx.getImageData(0,0,1,1).data].slice(0,3))};
      }
    }
    return {filter:legacy(color,white)};
  }
  async function applyLayer(image,avatar,key,bodyImage) {
    if(!image)return;
    const revision=(revisions.get(image)||0)+1;revisions.set(image,revision);
    const source=image.getAttribute('src');
    image.dataset.avatarColorLayer=key;
    if(!source){image.style.filter='none';return;}
    const result=await resolve(avatar,key,bodyImage);
    const base=result.hex ? await reference(source) : null;
    if(revisions.get(image)!==revision||image.getAttribute('src')!==source)return;
    image.style.filter=result.hex ? matrix(result.hex,base) : result.filter;
  }
  async function snapshotLayer(image,avatar,key,bodyImage) {
    await image.decode?.();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const result=await resolve(avatar,key,bodyImage);
    ctx.filter=result.hex ? 'none' : result.filter;ctx.drawImage(image,0,0);
    if(result.hex){
      const level=Math.max(1,luminance(await reference(image.src||image.dataset.avatarSource))),rgb=hexRgb(result.hex),pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
      for(let i=0;i<pixels.data.length;i+=4){if(!pixels.data[i+3])continue;const factor=luminance([pixels.data[i],pixels.data[i+1],pixels.data[i+2]])/level;for(let j=0;j<3;j++)pixels.data[i+j]=Math.min(255,Math.round(rgb[j]*factor));}
      ctx.putImageData(pixels,0,0);
    }
    return canvas;
  }
  window.AvatarColors={validHex,legacy,reference,applyLayer,snapshotLayer};
})();
