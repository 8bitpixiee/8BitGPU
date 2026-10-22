// Load after avatar-studio.js and avatar-paint.js.
(() => {
  const defaults={skin:'#c5a2c9',item:'#b998dd'};
  const neutral=()=>({hue:0,saturation:100,lightness:100});
  function hsl(hex){
    const [r,g,b]=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
    let h=0;if(d)h=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
    return {h:Math.round(h*60),s:Math.round(d?d/(1-Math.abs(2*l-1))*100:0),l:Math.round(l*100)};
  }
  function hex(h,s,l){
    s/=100;l/=100;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
    const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
    return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
  }
  const controls=[];
  function build(id,kind){
    const field=document.getElementById(id);field.classList.add('avatar-color-part');field.replaceChildren();
    const legend=document.createElement('legend');field.append(legend);
    const heading=document.createElement('div');heading.className='avatar-color-heading';
    const well=document.createElement('input');well.type='color';well.setAttribute('aria-label',kind==='skin'?'Skin full spectrum color':'Selected item full spectrum color');
    const text=document.createElement('input');text.type='text';text.maxLength=7;text.pattern='#[0-9A-Fa-f]{6}';text.setAttribute('aria-label','Hex color, for example #b998dd');text.spellcheck=false;
    heading.append(well,text);field.append(heading);
    const channels={};let draftHex=null,draftHsl=null;
    for(const [key,name,max] of [['h','Hue',360],['s','Saturation',100],['l','Lightness',100]]){
      const row=document.createElement('label'),output=document.createElement('output'),range=document.createElement('input');
      row.textContent=name+' ';row.append(output);range.type='range';range.min=0;range.max=max;range.step=1;range.setAttribute('aria-label',(kind==='skin'?'Skin ': 'Item ')+name);
      field.append(row,range);channels[key]={range,output};
      range.oninput=()=>{const values={h:+channels.h.range.value,s:+channels.s.range.value,l:+channels.l.range.value};commit(hex(values.h,values.s,values.l),values);};
    }
    const reset=document.createElement('button');reset.type='button';reset.textContent='Original palette';field.append(reset);
    const hint=document.createElement('p');hint.className='avatar-color-hint';field.append(hint);
    function linked(){return kind==='skin'||activePickerCategory==='chest';}
    function color(){return linked()?settings.skinColor:settings.itemColors[selectedOption(activePickerCategory).id];}
    function commit(value,values=null){
      if(!AvatarColors.validHex(value))return;
      const next={...neutral(),hex:value.toLowerCase()};
      draftHex=next.hex;draftHsl=values;
      if(linked())settings.skinColor=next;else settings.itemColors[selectedOption(activePickerCategory).id]=next;
      update();applySkinColor();
    }
    function update(){
      const value=color(),custom=AvatarColors.validHex(value?.hex),current=custom?value.hex:defaults[kind];
      const values=draftHex===current&&draftHsl?draftHsl:hsl(current),selected=kind==='item'?selectedOption(activePickerCategory):null;
      const enabled=kind==='skin'||Boolean(selected?.src);
      legend.textContent=kind==='skin'?'Skin color':activePickerCategory==='chest'?'Chest — linked to skin':'Color '+selected.name;
      well.value=current;text.value=custom?current:'';text.placeholder=current;
      Object.entries(channels).forEach(([key,{range,output}])=>{range.value=values[key];output.textContent=values[key]+(key==='h'?'°':'%');range.disabled=!enabled;});
      well.disabled=text.disabled=reset.disabled=!enabled;
      channels.h.range.style.background='linear-gradient(90deg,red,#ff0,#0f0,#0ff,#00f,#f0f,red)';
      channels.s.range.style.background=`linear-gradient(90deg,${hex(values.h,0,values.l)},${hex(values.h,100,values.l)})`;
      channels.l.range.style.background=`linear-gradient(90deg,#000,${hex(values.h,values.s,50)},#fff)`;
      hint.textContent=!enabled?'Choose an item first.':activePickerCategory==='chest'&&kind==='item'?'Changing this color also changes the body and head.':custom?'Full-spectrum tint. Black outlines and shading are preserved.':'Original palette active. Pick a color to start a full-spectrum tint.';
    }
    well.oninput=()=>commit(well.value);
    text.oninput=()=>{text.setCustomValidity(text.value&&!AvatarColors.validHex(text.value)?'Enter a color such as #b998dd.':'');if(AvatarColors.validHex(text.value))commit(text.value);};
    text.onchange=()=>{if(!AvatarColors.validHex(text.value))update();};
    reset.onclick=()=>{draftHex=draftHsl=null;if(linked())settings.skinColor=neutral();else delete settings.itemColors[selectedOption(activePickerCategory).id];update();applySkinColor();};
    controls.push(update);return update;
  }
  const skin=build('skinSliderControls','skin'),item=build('itemColorControls','item');
  renderSkinSliders=skin;
  renderItemSliders=item;
  controls.forEach(update=>update());
  applySkinColor();
})();
