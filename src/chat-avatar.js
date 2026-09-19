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
