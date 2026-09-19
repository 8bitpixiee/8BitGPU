export function portrait(avatarJson) {
 let a;try{a=JSON.parse(avatarJson);}catch{return null;}if(!a||typeof a!=='object')return null;
 let head;
 if(a.species==='Pixie') {const v={Nutmeg:1,Peachy:2,Creme:3}[a.skinTone]||1;const prefix=a.build==='Masc'?'head_masc':a.build==='Chunky Masc'?'head_chunky_masc':'head_fem';head=`avatar/${prefix}_v${v}.png`;}
 else if(a.species==='Deerbra')head=`avatar/head_fem_deerbra_v${{Wood:1,Copper:2,Pedal:3}[a.skinTone]||1}.png`;
 else if(a.species==='Bovadill')head='avatar/bovidil_head_fem_v1.png';
 else if(a.species==='Thixie')head=`avatar/thixie_head_v${{Nutmeg:1,Creme:2,Peachy:3}[a.skinTone]||1}.png`;
 else return null;
 const result={head};for(const key of ['ears','eyes','hair']){const value=a.layers?.[key];if(typeof value==='string'&&/^avatar\/[a-zA-Z0-9_ .-]+\.png$/.test(value)&&!value.includes('..'))result[key]=value;}return result;
}

export function roomAvatar(json) {
 let a;try{a=JSON.parse(json);}catch{a=null;}
 if(!a||!portrait(json))a={species:'Pixie',skinTone:'Nutmeg',build:'Fae',layers:{ears:'avatar/ears_fem_v1.png',eyes:'avatar/eyes_fem_v1.png',hair:'avatar/volume_hair_fem_idle_front_v1.png',fit:'avatar/fit_fem_v1.png',extra:'avatar/wings_v1.png'}};
 const face=portrait(JSON.stringify(a));
 let body=face.head.replace('head','body');
 if(a.species==='Bovadill')body=`avatar/bovidil_body_fem_v${{Cocoa:1,Peachy:2,Milky:3}[a.skinTone]||1}.${{Highland:1,Holstein:2,Dexter:3}[a.build]||1}.png`;
 const layers={body,...face};
 for(const key of ['extra','fit']){const value=a.layers?.[key];if(typeof value==='string'&&/^avatar\/[a-zA-Z0-9_ .-]+\.png$/.test(value)&&!value.includes('..'))layers[key]=value;}
 const adjustments={};for(const key of ['ears','eyes','hair','fit','extra']){const v=a.adjustments?.[key]||{};adjustments[key]={x:Math.max(-20,Math.min(20,Number(v.x)||0)),y:Math.max(-20,Math.min(20,Number(v.y)||0)),scale:Math.max(.7,Math.min(1.3,Number(v.scale)||1))};}
 return {layers,adjustments};
}

