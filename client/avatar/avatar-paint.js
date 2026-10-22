// Load after avatar-studio.js. Keeps the existing save and adjustment logic.
(() => {
  const lab = document.querySelector('.lab-window');
  if (!lab || lab.classList.contains('paint-lab')) return;
  lab.classList.add('paint-lab');
  const content = lab.querySelector('.lab-content');
  const creator = lab.querySelector('.creator-panel');
  const tabs = lab.querySelector('.step-tabs');
  const actions = lab.querySelector('.creator-actions');
  const status = document.getElementById('saveStatus');
  const tools = lab.querySelector('.sprite-adjuster');
  const categories = lab.querySelector('.picker-categories');
  const oldGrid = document.getElementById('speciesGrid');
  const names = {hair:'Hair',eyes:'Eyes',ears:'Ears',chest:'Chest',fit:'Clothes',extra:'Extras'};
  const groups = {body:[],skin:[],hair:['hair'],style:['eyes','ears','chest','fit'],extras:['extra']};
  let currentTab = 'body';

  lab.querySelector('.studio-toolbar').after(tabs);
  lab.append(actions, status);
  status.classList.add('paint-status');
  tools.classList.add('paint-tools');
  content.prepend(tools);
  const targetLabel = document.createElement('label');
  targetLabel.htmlFor = 'paintTarget';
  targetLabel.textContent = 'Move / resize';
  const target = document.createElement('select');
  target.id = 'paintTarget';
  target.setAttribute('aria-label','Asset to move or resize');
  Object.entries(names).forEach(([key,name]) => target.add(new Option(name,key)));
  tools.prepend(targetLabel,target);
  tools.querySelector('.adjuster-label').textContent = 'POSITION';
  const pad = tools.querySelector('.adjuster-buttons');
  const center = document.createElement('button');
  center.type = 'button';
  center.className = 'pad-center';
  center.textContent = '●';
  center.title = 'Reset position only';
  center.setAttribute('aria-label','Restore selected asset position');
  center.onclick = () => {
    const defaults = defaultAdjustments()[activePickerCategory];
    const adjustment = activeAdjustments()[activePickerCategory];
    adjustment.x = defaults.x;
    adjustment.y = defaults.y;
    applyLayerAdjustment(activePickerCategory);
    renderAdjuster();
  };
  pad.append(center);
  pad.querySelector('[data-adjust="reset"]').textContent = 'Reset all';
  const note = document.createElement('p');
  note.className = 'paint-tool-note';
  tools.append(note);

  function syncTools() {
    target.value = activePickerCategory;
    const editable = groups[currentTab].includes(activePickerCategory) && Boolean(selectedOption(activePickerCategory)?.src);
    pad.querySelectorAll('button').forEach(button => button.disabled = !editable);
    note.textContent = !groups[currentTab].length
      ? 'Choose Hair, Style or Extras to position an asset.'
      : editable ? 'Arrows move. − / + change size. ● restores position.' : 'Choose an item first.';
  }
  function showTab(key, layer) {
    currentTab = key;
    lab.dataset.paintTab = key;
    if (groups[key].length) activePickerCategory = layer || (groups[key].includes(activePickerCategory) ? activePickerCategory : groups[key][0]);
    setStep(key === 'body' ? 'species' : key === 'skin' ? 'skinTone' : 'style');
    tabs.querySelectorAll('button').forEach(button => {
      const active = button.dataset.paintTab === key;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    categories.querySelectorAll('button').forEach(button => button.hidden = !groups[key].includes(button.dataset.pickerCategory));
    syncTools();
  }
  tabs.replaceChildren();
  tabs.setAttribute('aria-label','Avatar categories');
  for (const [key,label] of Object.entries({body:'Body',skin:'Skin',hair:'Hair',style:'Style',extras:'Extras'})) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'step-tab';
    button.dataset.paintTab = key;
    button.textContent = label;
    button.onclick = () => showTab(key);
    tabs.append(button);
  }
  target.onchange = () => {
    const layer = target.value;
    showTab(layer === 'hair' ? 'hair' : layer === 'extra' ? 'extras' : 'style',layer);
  };
  creator.addEventListener('click',() => syncTools());
  new MutationObserver(syncTools).observe(document.getElementById('adjusterReadout'),{childList:true});

  // Grey body previews never change the saved skin color.
  document.getElementById('bodyBrowser')?.remove();
  const browser = document.createElement('section');
  browser.id = 'bodyBrowser';
  browser.innerHTML = `<div class="body-browser-row"><button type="button" id="previousBody" aria-label="Previous body">◀</button><div id="browsedBodyPreview" class="body-base-preview" aria-hidden="true"></div><button type="button" id="nextBody" aria-label="Next body">▶</button></div><p id="bodyBrowserName" aria-live="polite"></p><button type="button" id="useBrowsedBody">Use this body</button><details><summary>Browse all bodies…</summary><div class="body-browser-gallery"></div></details>`;
  oldGrid.before(browser);
  const legacy = {
    'Pixie:Fae':['body_fem_v1.png','head_fem_v1.png'],
    'Pixie:Masc':['body_masc_v1.png','head_masc_v1.png'],
    'Pixie:Chunky Masc':['body_chunky_masc_v1.png','head_chunky_masc_v1.png'],
    'Deerbra:Fae':['body_fem_deerbra_v1.png','head_fem_deerbra_v1.png'],
    'Bovadill:Highland':['bovidil_body_fem_v1.1.png','bovidil_head_fem_v1.png'],
    'Thixie:Fae':['thixie_body_v1.png','thixie_head_v1.png']
  };
  function preview(choice) {
    const box = document.createElement('div');
    box.className = 'body-base-preview';
    box.setAttribute('aria-hidden','true');
    const files = choice.bodyAsset ? [choice.bodyAsset] : legacy[choice.species+':'+choice.build] || [];
    files.forEach(file => {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.src = asset(file);
      box.append(image);
    });
    return box;
  }
  let browseIndex = 0;
  const gallery = browser.querySelector('.body-browser-gallery');
  beingChoices.forEach((choice,index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.append(preview(choice),choice.name);
    button.onclick = () => {browseIndex=index;renderBrowser();};
    gallery.append(button);
  });
  function renderBrowser() {
    const choice = beingChoices[browseIndex];
    const selected = settings.species === choice.species && settings.build === choice.build;
    document.getElementById('browsedBodyPreview').replaceChildren(...preview(choice).children);
    document.getElementById('bodyBrowserName').textContent = `${choice.name} · ${browseIndex+1} of ${beingChoices.length}`;
    const use = document.getElementById('useBrowsedBody');
    use.textContent = selected ? 'Selected ✓' : 'Use this body';
    use.disabled = selected;
    gallery.querySelectorAll('button').forEach((button,index) => button.setAttribute('aria-pressed',String(index === browseIndex)));
  }
  document.getElementById('previousBody').onclick = () => {browseIndex=(browseIndex-1+beingChoices.length)%beingChoices.length;renderBrowser();};
  document.getElementById('nextBody').onclick = () => {browseIndex=(browseIndex+1)%beingChoices.length;renderBrowser();};
  document.getElementById('useBrowsedBody').onclick = () => oldGrid.querySelectorAll('button[data-species]')[browseIndex]?.click();
  function syncBody() {
    browseIndex=Math.max(0,beingChoices.findIndex(choice => choice.species===settings.species && choice.build===settings.build));
    renderBrowser();
  }
  new MutationObserver(syncBody).observe(oldGrid,{childList:true});
  syncBody();
  showTab('body');
})();
