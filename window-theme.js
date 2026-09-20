(() => {
 const contrast=hex=>{const rgb=hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#16101c':'#ffffff';};
 function apply(colors){if(!colors)return;for(const key of ['edge','accent','panel','paper','ink'])if(/^#[a-f\d]{6}$/i.test(colors[key]))document.documentElement.style.setProperty('--'+key,colors[key]);
 if(/^#[a-f\d]{6}$/i.test(colors.panel)){document.documentElement.style.setProperty('--control-ink',contrast(colors.panel));const rgb=colors.panel.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)/255),max=Math.max(...rgb),min=Math.min(...rgb),d=max-min;let h=0;if(d)h=max===rgb[0]?((rgb[1]-rgb[2])/d+6)%6:max===rgb[1]?(rgb[2]-rgb[0])/d+2:(rgb[0]-rgb[1])/d+4;document.documentElement.style.setProperty('--frame-filter',`grayscale(1) sepia(1) hue-rotate(${h*60-45}deg) saturate(${d?1.4:0})`);}
 if(/^#[a-f\d]{6}$/i.test(colors.edge))document.documentElement.style.setProperty('--title-ink',contrast(colors.edge));
 }
 window.applyWindowTheme=apply;
 window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='8bitgpu-theme-saved'){apply(e.data.colors);document.querySelectorAll('iframe').forEach(f=>f.contentWindow?.postMessage(e.data,location.origin));}});
 if(!location.pathname.endsWith('profile.html'))fetch('/api/profile/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>apply(d?.profile?.style)).catch(()=>{});
})();
