(function(){
  const cats = ['Puck', 'Clovis', 'Tadpole'];
  const tab = 'cat_profiles';
  const fields = {
    nicknames: 'Nicknames',
    markings: 'Identifying markings',
    clue: 'How to tell them apart',
    habits: 'Signature habits',
  };
  const lifeDates = {born: 'Born', adopted: 'Adoption date', died: 'Died'};
  // Keep the original columns in place for profiles saved before life dates.
  const columns = ['cat', 'portrait', 'intro', ...Object.keys(fields), ...Object.keys(lifeDates)];
  const dateFormat = new Intl.DateTimeFormat('en-US', {dateStyle: 'medium', timeZone: 'UTC'});
  const profiles = new Map();
  const form = $('#cat-guide-form');
  const first = $('#cat-guide-first');
  const second = $('#cat-guide-second');
  const edit = $('#cat-guide-edit');
  const status = $('#cat-guide-status');
  let ready = false;

  function photosFor(cat){
    return state.photos.filter(photo => !photo.hideFromGallery && !isVideo(photo.key) &&
      PhotoSections.catNames(photo.category).some(name => name.toLowerCase() === cat.toLowerCase()))
      .sort((a,b) => PhotoSections.catNames(a.category).length - PhotoSections.catNames(b.category).length ||
        (b.date || '').localeCompare(a.date || ''));
  }

  function element(tag, text, className){
    const node = document.createElement(tag);
    if(text) node.textContent = text;
    if(className) node.className = className;
    return node;
  }

  function card(cat){
    const profile = profiles.get(cat) || {};
    const photos = photosFor(cat);
    const portrait = photos.find(photo => photo.key === profile.portrait) || photos[0];
    const article = element('article', '', 'cat-guide-card');
    if(portrait){
      const img = element('img', '', 'cat-guide-portrait');
      img.alt = 'Portrait of ' + cat;
      img.src = r2PublicUrl(portrait.key.split('/').map(encodeURIComponent).join('/'));
      img.loading = 'lazy';
      article.append(img);
    }
    const copy = element('div', '', 'cat-guide-copy');
    copy.append(element('h3', cat));
    if(profile.intro) copy.append(element('p', profile.intro));
    const details = element('dl');
    for(const [key, label] of Object.entries(lifeDates)){
      const value = profile[key];
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) continue;
      const date = new Date(value + 'T00:00:00Z');
      if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) continue;
      const time = element('time', dateFormat.format(date));
      time.dateTime = value;
      const definition = element('dd');
      definition.append(time);
      details.append(element('dt', label), definition);
    }
    for(const [key, label] of Object.entries(fields)){
      if(profile[key]) details.append(element('dt', label), element('dd', profile[key]));
    }
    if(!profile.intro && !details.childElementCount){
      copy.append(element('p', 'Profile details coming soon.', 'cat-guide-empty'));
    }
    copy.append(details);
    article.append(copy);
    return article;
  }

  function renderComparison(){
    for(const option of second.options) option.disabled = option.value === first.value;
    if(first.value === second.value) second.value = cats.find(cat => cat !== first.value);
    $('#cat-guide-comparison').replaceChildren(card(first.value), card(second.value));
  }

  function render(){
    $('#cat-guide-profiles').replaceChildren(...cats.map(card));
    renderComparison();
    edit.hidden = !isGsAuthed();
    edit.disabled = !ready;
  }

  function fillForm(){
    const cat = form.elements.cat.value;
    const profile = profiles.get(cat) || {};
    const portrait = form.elements.portrait;
    portrait.replaceChildren(new Option('Use most recent solo photo', ''));
    for(const photo of photosFor(cat)){
      portrait.add(new Option([photo.date, photo.title || photo.caption || photo.key.split('/').pop()].filter(Boolean).join(' · '), photo.key));
    }
    portrait.value = [...portrait.options].some(option => option.value === profile.portrait) ? profile.portrait : '';
    for(const key of columns.slice(2)) form.elements[key].value = profile[key] || '';
  }

  async function sheetExists(){
    const metadata = await sheetsApi(SHEET_BASE() + '?fields=sheets.properties.title');
    return metadata.sheets.some(sheet => sheet.properties.title === tab);
  }

  async function saveProfile(cat, profile){
    const base = SHEET_BASE();
    const json = {'Content-Type':'application/json'};
    if(!await sheetExists()){
      try {
        await sheetsApi(base + ':batchUpdate', {
          method:'POST', headers:json,
          body:JSON.stringify({requests:[{addSheet:{properties:{title:tab}}}]}),
        });
      } catch(error){
        if(!await sheetExists()) throw error;
      }
    }
    const row = cats.indexOf(cat) + 2;
    await sheetsApi(base + '/values:batchUpdate', {
      method:'POST', headers:json,
      body:JSON.stringify({valueInputOption:'RAW', data:[
        {range:tab+'!A1:J1', values:[columns]},
        {range:tab+'!A'+row+':J'+row, values:[[cat, ...columns.slice(1).map(key => profile[key])]]},
      ]}),
    });
  }

  for(const select of [first, second, form.elements.cat]){
    for(const cat of cats) select.add(new Option(cat,cat));
  }
  first.value = 'Clovis';
  second.value = 'Tadpole';
  first.addEventListener('change', renderComparison);
  second.addEventListener('change', renderComparison);
  form.elements.cat.addEventListener('change', fillForm);
  edit.addEventListener('click', () => {
    fillForm();
    form.hidden = false;
    status.textContent = '';
    form.elements.cat.focus();
  });
  $('#cat-guide-cancel').addEventListener('click', () => {
    form.hidden = true;
    edit.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if(!isGsAuthed() || !ready) return;
    const cat = form.elements.cat.value;
    const profile = Object.fromEntries(columns.slice(1).map(key => [key,form.elements[key].value.trim()]));
    for(const input of form.elements) input.disabled = true;
    edit.disabled = true;
    status.textContent = 'Saving profile…';
    try {
      await saveProfile(cat, profile);
      profiles.set(cat, profile);
      form.hidden = true;
      render();
      edit.focus();
      status.textContent = cat + '’s profile saved.';
    } catch(error){
      console.error(error);
      status.textContent = 'Could not save the profile. Check your sign-in and try again.';
    } finally {
      for(const input of form.elements) input.disabled = false;
      edit.disabled = false;
    }
  });

  async function loadProfiles(){
    try {
      if(isGsAuthed()){
        if(await sheetExists()){
          const result = await sheetsApi(SHEET_BASE() + '/values/' + tab);
          for(const profile of csvToObjects(result.values || [])) if(cats.includes(profile.cat)) profiles.set(profile.cat,profile);
        }
      } else {
        for(const profile of await fetchTab(tab)) if(cats.includes(profile.cat)) profiles.set(profile.cat,profile);
      }
      ready = true;
    } catch(error){
      console.warn('Could not load cat profiles', error);
      if(isGsAuthed()) status.textContent = 'Could not load saved profiles. Reload before editing.';
    }
    render();
  }

  document.addEventListener('photo-gallery-loaded', render);
  render();
  loadProfiles();
})();
