(() => {
 let layout={},saving=Promise.resolve(),ready=false,z=1;
 const nodes=[['being','.identity-card','.identity-title'],['about','.about-panel','h2'],['favorites','.favorites-panel','h2'],['collection','#collection','h2'],['connections','#connections','h2'],['photo1','.photo-window:nth-child(1)','figcaption'],['photo2','.photo-window:nth-child(2)','figcaption'],['photo3','.photo-window:nth-child(3)','figcaption']];
 async function request(method='GET',body){const r=await fetch('/api/social/layout',{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});if(!r.ok)throw Error('Sign in to save arrangements, or try again when connected.');return r.json();}
 function save(){const copy=JSON.parse(JSON.stringify(layout));saving=saving.catch(()=>{}).then(()=>request('PUT',{layout:copy})).then(()=>setStatus('Window arrangement saved.'),e=>setStatus(e.message));}
 function position(){const canvas=document.getElementById('windowCanvas');if(!canvas)return;let height=0;for(const [key] of nodes){const node=canvas.querySelector('[data-window="'+key+'"]'),p=layout[key];if(!node||!p)continue;const x=Math.round(p.x*Math.max(0,canvas.clientWidth-node.offsetWidth));node.style.left=x+'px';node.style.top=p.y+'px';height=Math.max(height,p.y+node.offsetHeight+20);}canvas.style.height=height+'px';}
 function defaults(){const canvas=document.getElementById('windowCanvas');const columns=canvas.clientWidth>=760?3:canvas.clientWidth>=510?2:1,heights=Array(columns).fill(0);for(const [i,[key]] of nodes.entries()){const n=canvas.querySelector('[data-window="'+key+'"]');const col=i%columns;layout[key]={x:columns===1?0:col/(columns-1),y:heights[col]};heights[col]+=n.offsetHeight+18;}position();}
 async function start(){if(ready||document.getElementById('profile').hidden)return;ready=true;const page=document.getElementById('profile'),canvas=document.createElement('div');canvas.id='windowCanvas';page.append(canvas);
 const elements=nodes.map(([key,selector,handleSelector])=>[key,document.querySelector(selector),handleSelector]);
 for(const [key,node,handleSelector] of elements){node.dataset.window=key;canvas.append(node);const handle=node.querySelector(handleSelector);handle.classList.add('drag-handle');handle.tabIndex=0;handle.setAttribute('aria-label',handle.textContent+' — drag or use arrow keys to move');let drag=null;
 handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;const p=layout[key];drag={x:e.clientX,y:e.clientY,left:node.offsetLeft,top:p.y};node.style.zIndex=++z;handle.setPointerCapture(e.pointerId);e.preventDefault();});
 handle.addEventListener('pointermove',e=>{if(!drag)return;const width=Math.max(0,canvas.clientWidth-node.offsetWidth);layout[key]={x:width?Math.min(1,Math.max(0,(drag.left+e.clientX-drag.x)/width)):0,y:Math.min(10000,Math.max(0,drag.top+e.clientY-drag.y))};position();});
 handle.addEventListener('lostpointercapture',()=>{if(drag){drag=null;save();}});
 handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const p=layout[key];if(e.key==='ArrowLeft')p.x=Math.max(0,p.x-.05);if(e.key==='ArrowRight')p.x=Math.min(1,p.x+.05);if(e.key==='ArrowUp')p.y=Math.max(0,p.y-10);if(e.key==='ArrowDown')p.y=Math.min(10000,p.y+10);position();save();});
 }
 document.querySelector('.profile-grid').remove();document.querySelector('.photo-gallery').remove();defaults();
 const reset=document.createElement('button');reset.textContent='Reset my arrangement';reset.type='button';reset.onclick=()=>{defaults();save();};page.insertBefore(reset,canvas);
 try{const d=await request();layout={...layout,...d.layout};position();}catch(e){setStatus(e.message);}
 new ResizeObserver(position).observe(canvas);window.addEventListener('resize',position);
 }
 new MutationObserver(start).observe(document.getElementById('profile'),{attributes:true,attributeFilter:['hidden']});start();
})();

