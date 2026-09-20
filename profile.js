const byId = (id) => document.getElementById(id);
const layers = ["extra", "body", "ears", "head", "eyes", "hair", "fit"];
let profile = null;
let isOwnProfile = false;
let uploadBusy = false;

let statusTimer; function setStatus(message) { clearTimeout(statusTimer); byId("pageStatus").textContent = message; if (/saved\.$/.test(message)) statusTimer=setTimeout(()=>byId("pageStatus").textContent="",4000); }
function setLayer(name, source) {
    const image = byId(name + "Layer");
    image.src = source || "";
    image.hidden = !source;
    image.onerror = () => { image.hidden = true; };
}
function baseLayers(avatar) {
    const tone = avatar?.skinTone;
    const species = avatar?.species;
    const build = avatar?.build;
    if (species === "Pixie") {
        const number = { Nutmeg: 1, Peachy: 2, Creme: 3 }[tone] || 1;
        const type = build === "Masc" ? "masc" : build === "Chunky Masc" ? "chunky_masc" : "fem";
        return { body: `avatar/body_${type}_v${number}.png`, head: `avatar/head_${type}_v${number}.png` };
    }
    if (species === "Deerbra") { const number = { Wood: 1, Copper: 2, Pedal: 3 }[tone] || 1; return { body: `avatar/body_fem_deerbra_v${number}.png`, head: `avatar/head_fem_deerbra_v${number}.png` }; }
    if (species === "Bovadill") { const toneNumber = { Cocoa: 1, Peachy: 2, Milky: 3 }[tone] || 1; const breedNumber = { Highland: 1, Holstein: 2, Dexter: 3 }[build] || 1; return { body: `avatar/bovidil_body_fem_v${toneNumber}.${breedNumber}.png`, head: "avatar/bovidil_head_fem_v1.png" }; }
    if (species === "Thixie") { const number = { Nutmeg: 1, Creme: 2, Peachy: 3 }[tone] || 1; return { body: `avatar/thixie_body_v${number}.png`, head: `avatar/thixie_head_v${number}.png` }; }
    return { body: "avatar/body_fem_v1.png", head: "avatar/head_fem_v1.png" };
}
function renderAvatar(avatar) {
    const base = baseLayers(avatar);
    const saved = avatar?.layers || {};
    layers.forEach((name) => setLayer(name, base[name] || saved[name] || ""));
}
function setTheme(theme) { document.body.dataset.theme = theme || "violet"; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function hexToHsl(hex) {
    const value = String(hex || "").replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return { h: 280, s: 45, l: 80 };
    const red = parseInt(value.slice(0, 2), 16) / 255;
    const green = parseInt(value.slice(2, 4), 16) / 255;
    const blue = parseInt(value.slice(4, 6), 16) / 255;
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue), light = (max + min) / 2;
    const delta = max - min;
    let hue = 0;
    if (delta) {
        if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
        else if (max === green) hue = ((blue - red) / delta + 2) * 60;
        else hue = ((red - green) / delta + 4) * 60;
    }
    return { h: Math.round(hue), s: Math.round((delta ? delta / (1 - Math.abs(2 * light - 1)) : 0) * 100), l: Math.round(light * 100) };
}
function hslToHex(hue, saturation, lightness) {
    const s = saturation / 100, l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const segment = hue / 60, x = chroma * (1 - Math.abs(segment % 2 - 1));
    let rgb = [0, 0, 0];
    if (segment < 1) rgb = [chroma, x, 0]; else if (segment < 2) rgb = [x, chroma, 0]; else if (segment < 3) rgb = [0, chroma, x]; else if (segment < 4) rgb = [0, x, chroma]; else if (segment < 5) rgb = [x, 0, chroma]; else rgb = [chroma, 0, x];
    const match = l - chroma / 2;
    return `#${rgb.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}
const colorNames = {background:'Wall',paper:'Page',panel:'Panels',edge:'Window titles',accent:'Accents',ink:'Text'};
const colorDefaults = {background:'#b99ad2',paper:'#fffdf8',panel:'#f0e7f4',edge:'#724a91',accent:'#b95fd4',ink:'#321c48'};
let draftColors = {};
function paletteFromSliders() { return {...draftColors}; }
function buildColorControls() {
    byId('colorControls').replaceChildren();
    for (const [key,label] of Object.entries(colorNames)) {
        const group = document.createElement('fieldset');
        group.className = 'color-part';
        group.innerHTML = '<legend>'+label+'</legend><div class="color-heading"><input type="color" id="'+key+'Color" aria-label="'+label+' full spectrum color"><output id="'+key+'Hex"></output></div>' + [['Hue',360],['Saturation',100],['Lightness',100]].map(([part,max])=>'<label for="'+key+part+'">'+part+'<output id="'+key+part+'Value"></output></label><input id="'+key+part+'" type="range" min="0" max="'+max+'" class="'+part.toLowerCase()+'-slider">').join('');
        byId('colorControls').append(group);
        byId(key+'Color').addEventListener('input', event=>{draftColors[key]=event.target.value;syncColorControls(key);previewPalette();});
        for (const part of ['Hue','Saturation','Lightness']) byId(key+part).addEventListener('input',()=>{
            draftColors[key]=hslToHex(Number(byId(key+'Hue').value)%360,Number(byId(key+'Saturation').value),Number(byId(key+'Lightness').value));
            byId(key+'Color').value=draftColors[key];byId(key+'Hex').textContent=draftColors[key];updateColorLabels(key);previewPalette();
        });
    }
}
function updateColorLabels(key) {
    for(const part of ['Hue','Saturation','Lightness']) byId(key+part+'Value').textContent=byId(key+part).value+(part==='Hue'?'°':'%');
    const hue=byId(key+'Hue').value,saturation=byId(key+'Saturation').value;
    byId(key+'Saturation').style.background=`linear-gradient(90deg,#888,hsl(${hue} 100% 50%))`;
    byId(key+'Lightness').style.background=`linear-gradient(90deg,#000,hsl(${hue} ${saturation}% 50%),#fff)`;
}
function syncColorControls(key) {
    const value=draftColors[key], hsl=hexToHsl(value);
    byId(key+'Color').value=value;byId(key+'Hex').textContent=value;
    byId(key+'Hue').value=hsl.h;byId(key+'Saturation').value=hsl.s;byId(key+'Lightness').value=hsl.l;
    updateColorLabels(key);
}
function renderImages() {
    for(const slot of [1,2,3]) { const source=profile.images?.[slot];byId('photo'+slot).hidden=!source;byId('photoEmpty'+slot).hidden=Boolean(source);if(source)byId('photo'+slot).src=source;else byId('photo'+slot).removeAttribute('src'); }
}
async function prepareImage(file) {
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)) throw Error('Choose a PNG, JPEG, or WebP file.');
    if(file.size>15*1024*1024) throw Error('Choose an image smaller than 15 MB.');
    const bitmap=await createImageBitmap(file);
    try {
        const scale=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        for(const quality of [.86,.7,.5,.3]) { const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(blob&&blob.size<=512*1024)return blob; }
        throw Error('This image is too detailed. Try a smaller image.');
    } finally { bitmap.close(); }
}
function buildImageControls() {
    for(const [slot,label] of [['wall','Page wallpaper'],['1','Picture 1'],['2','Picture 2'],['3','Picture 3']]) {
        const row=document.createElement('div');row.className='image-control';
        row.innerHTML='<label for="image'+slot+'">'+label+'</label><input id="image'+slot+'" type="file" accept="image/png,image/jpeg,image/webp"><button type="button" id="removeImage'+slot+'">Remove '+label.toLowerCase()+'</button>';
        byId('imageControls').append(row);
        const input=byId('image'+slot),remove=byId('removeImage'+slot);
        async function change(file) {
            if(uploadBusy)return;
            uploadBusy=true;
            document.querySelectorAll('#imageControls input,#imageControls button').forEach(control=>control.disabled=true);
            byId('closeEditor').disabled=true;byId('saveProfile').disabled=true;
            byId('uploadStatus').textContent=file?'Uploading '+label+'…':'Removing '+label+'…';
            try {
                const blob=file?await prepareImage(file):null;
                const result=await getJson('/api/profile/images/'+slot,{method:file?'PUT':'DELETE',...(blob?{body:blob,headers:{'content-type':blob.type}}:{})});
                profile.images ||= {};if(file)profile.images[slot]=result.url;else delete profile.images[slot];
                if(slot==='wall') profile.style.wallpaperUrl='';
                renderImages();previewPalette();byId('uploadStatus').textContent=label+(file?' uploaded and saved.':' removed.');
            } catch(error) {byId('uploadStatus').textContent=error.message;}
            finally {uploadBusy=false;document.querySelectorAll('#imageControls input,#imageControls button').forEach(control=>control.disabled=false);byId('closeEditor').disabled=false;byId('saveProfile').disabled=false;input.value='';}
        }
        input.addEventListener('change',()=>{if(input.files[0])change(input.files[0]);});remove.addEventListener('click',()=>change(null));
    }
}
function applyStyle(style) {
    const colors = style || {};
    const defaults = { background: "#b99ad2", paper: "#fffdf8", panel: "#f0e7f4", edge: "#724a91", accent: "#b95fd4", ink: "#321c48" };
    document.body.style.setProperty("--wall", colors.background || defaults.background);
    document.body.style.setProperty("--paper", colors.paper || defaults.paper);
    document.body.style.setProperty("--panel", colors.panel || defaults.panel);
    document.body.style.setProperty("--edge", colors.edge || defaults.edge);
    document.body.style.setProperty("--accent", colors.accent || defaults.accent);
    document.body.style.setProperty("--ink", colors.ink || defaults.ink);
    window.applyWindowTheme?.(colors);
    const page = byId("profile");
    const url = profile?.images?.wall || colors.wallpaperUrl || "";
    page.classList.toggle("has-wallpaper", Boolean(url));
    page.style.setProperty("--wallpaper-image", url ? `url(\"${url.replace(/[\\\"]/g, "\\\\$&")}\")` : "none");
}
function previewPalette() { applyStyle({...draftColors,wallpaperUrl:profile.style?.wallpaperUrl||''}); }
function render(nextProfile) {
    profile = nextProfile;
    setTheme(profile.theme);
    applyStyle(profile.style);
    const path = `8bitgpu.net/~${profile.username}`;
    byId("profileAddress").textContent = path;
    byId("profileUrl").textContent = path;
    byId("profileName").textContent = profile.username;
    byId("cardName").textContent = profile.username;
    byId("moodText").textContent = profile.mood || "Currently decorating this page.";
    byId("aboutText").textContent = profile.about || "This page is still being decorated.";
    byId("favoritesText").textContent = profile.favorites || "Add some favorite things to make this page yours.";
    byId('streamFavorites').textContent = profile.favorites || 'A few of my favorite things…';
    byId('streamMood').textContent = profile.mood || 'Currently decorating my corner of the internet.';
    renderAvatar(profile.avatar);
    renderImages();
    byId("profile").hidden = false;
    byId("editButton").hidden = !isOwnProfile;
}
async function getJson(path, options) {
    const response = await fetch(path, { cache: "no-store", ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "MyPixel could not load that page.");
    return data;
}
async function loadProfile() {
    const requested = new URLSearchParams(location.search).get("u");
    try {
        const me = await getJson("/api/auth/me");
        if (!requested && !me.user) { setStatus("Sign in through Account.exe to create your MyPixel page."); return; }
        isOwnProfile = Boolean(me.user && (!requested || requested.toLowerCase() === me.user.username.toLowerCase()));
        const data = isOwnProfile ? await getJson("/api/profile/me") : await getJson(`/api/profile/${encodeURIComponent(requested)}`);
        render(data.profile);
        setStatus("");
    } catch (error) { setStatus(error.message); }
}
function openEditor() {
    byId("moodInput").value = profile.mood;
    byId("aboutInput").value = profile.about;
    byId("favoritesInput").value = profile.favorites;
    draftColors={...colorDefaults,...Object.fromEntries(Object.keys(colorNames).map(key=>[key,profile.style?.[key]||colorDefaults[key]]))};
    Object.keys(colorNames).forEach(syncColorControls);
    byId('uploadStatus').textContent='';
    byId("editor").hidden = false;
    byId("moodInput").focus();
}
function closeEditor() { byId("editor").hidden = true; applyStyle(profile.style);byId("editButton").focus(); }
function openLounge() { window.parent?.postMessage({ type: "8bitgpu-open-app", app: "arcade" }, location.origin); }

byId("editButton").addEventListener("click", openEditor);
byId("closeEditor").addEventListener("click", closeEditor);
byId("visitLounge").addEventListener("click", openLounge);
byId("openLounge").addEventListener("click", openLounge);
byId("backButton").addEventListener("click", () => history.back());
byId("forwardButton").addEventListener("click", () => history.forward());
buildColorControls();
buildImageControls();
byId("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("saveProfile");
    button.disabled = true;
    try {
        const data = await getJson("/api/profile/me", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mood: byId("moodInput").value, about: byId("aboutInput").value, favorites: byId("favoritesInput").value, theme: "violet", style: { ...paletteFromSliders(), wallpaperUrl: profile.style?.wallpaperUrl || "" } }) });
        render(data.profile);
        closeEditor();
        parent.postMessage({type:"8bitgpu-theme-saved",colors:data.profile.style},location.origin);
        setStatus("Your MyPixel page is saved.");
    } catch (error) { setStatus(error.message); }
    finally { button.disabled = false; }
});

loadProfile();

