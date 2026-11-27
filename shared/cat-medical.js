(function(){
  const endpoint = 'https://satownsend-chatbot.satownsend.workers.dev/cat-medical/records';
  const feedingTypes = ['Allergy','Prescription diet','Feeding restriction'];
  const owner = $('#cat-medical-owner');
  const signIn = $('#cat-medical-sign-in');
  const filter = $('#cat-medical-filter');
  const status = $('#cat-medical-status');
  const list = $('#cat-medical-list');
  const reminders = $('#cat-feeding-reminders');
  const form = $('#cat-medical-form');
  let records = [];
  let editing = null;
  let busy = false;

  function clearPrivateView(){
    records = [];
    editing = null;
    form.reset();
    form.hidden = true;
    owner.hidden = true;
    reminders.hidden = true;
    reminders.replaceChildren();
    list.replaceChildren();
    status.textContent = '';
  }

  async function request(path = '', options = {}){
    const token = GAuth.token();
    if(!token){
      clearPrivateView();
      signIn.hidden = false;
      throw new Error('Sign in to continue.');
    }
    const response = await fetch(endpoint + path, {
      ...options, redirect:'error', cache:'no-store', headers:{Authorization:'Bearer ' + token},
    });
    if(response.status === 401 || response.status === 403){
      clearPrivateView();
      signIn.hidden = false;
      throw new Error('Sign in with the site owner’s Google account.');
    }
    if(!response.ok){
      const json = await response.json().catch(() => null);
      throw new Error(json?.error || 'Medical records are unavailable. Try again.');
    }
    return response;
  }

  function element(tag, text, className){
    const node = document.createElement(tag);
    if(text) node.textContent = text;
    if(className) node.className = className;
    return node;
  }

  function action(label, run){
    const button = element('button',label,'ghost tiny');
    button.type = 'button';
    button.addEventListener('click',run);
    return button;
  }

  function render(){
    list.replaceChildren();
    const visible = records.filter(record => record.cat === filter.value);
    for(const record of visible){
      const card = element('article','','cat-medical-panel');
      card.append(element('h3',record.title),element('p',record.date + ' · ' + record.type));
      if(record.notes) card.append(element('p',record.notes));
      const controls = element('div','','cat-medical-controls');
      controls.append(action('Edit',() => openForm(record)));
      if(record.hasDocument) controls.append(action('Download document',() => download(record)));
      controls.append(action('Delete',() => remove(record)));
      card.append(controls);
      list.append(card);
    }
    if(!visible.length) list.append(element('p','No medical records for ' + filter.value + ' yet.'));
    const feeding = records.filter(record => record.feedingReminder && feedingTypes.includes(record.type));
    reminders.replaceChildren();
    reminders.hidden = !feeding.length;
    if(feeding.length){
      const items = element('ul');
      for(const record of feeding){
        items.append(element('li',record.cat + ' · ' + record.type + ' · ' + record.title + (record.notes ? ' — ' + record.notes : '')));
      }
      reminders.append(element('h3','Private feeding reminders'),items);
    }
  }

  function toggleReminder(){
    $('#cat-medical-reminder-option').hidden = !feedingTypes.includes(form.elements.type.value);
  }

  function openForm(record = null){
    if(busy) return;
    editing = record;
    form.reset();
    form.elements.cat.value = record?.cat || filter.value;
    form.elements.type.value = record?.type || 'Vet visit';
    form.elements.date.value = record?.date || ymdLocal(new Date());
    form.elements.title.value = record?.title || '';
    form.elements.notes.value = record?.notes || '';
    form.elements.feedingReminder.checked = !!record?.feedingReminder;
    $('#cat-medical-remove-document').hidden = !record?.hasDocument;
    $('#cat-medical-form-title').textContent = record ? 'Edit record' : 'Add record';
    toggleReminder();
    form.hidden = false;
    form.elements.title.focus();
    status.textContent = '';
  }

  async function download(record){
    if(busy) return;
    try {
      const response = await request('/' + record.id + '/document');
      const filename = /filename="(vet-document\.(?:pdf|jpg|png))"/.exec(response.headers.get('Content-Disposition') || '')?.[1];
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'vet-document';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    } catch(error){
      status.textContent = error.message;
    }
  }

  function setBusy(value){
    busy = value;
    for(const control of form.elements) control.disabled = value;
    $('#cat-medical-add').disabled = value;
  }

  async function remove(record){
    if(busy || !window.confirm('Delete this medical record and its document?')) return;
    setBusy(true);
    try {
      await request('/' + record.id + '?version=' + encodeURIComponent(record.version),{method:'DELETE'});
      records = records.filter(row => row.id !== record.id);
      if(editing?.id === record.id){
        form.reset();
        form.hidden = true;
        editing = null;
      }
      render();
      status.textContent = 'Record deleted.';
    } catch(error){
      status.textContent = error.message;
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if(busy) return;
    const data = new FormData(form);
    const previous = editing;
    data.set('version',previous?.version || '');
    setBusy(true);
    try {
      const response = await request('/' + (previous?.id || crypto.randomUUID()),{method:'PUT',body:data});
      const {record} = await response.json();
      records = [...records.filter(row => row.id !== record.id),record].sort((a,b) => b.date.localeCompare(a.date));
      form.reset();
      form.hidden = true;
      editing = null;
      filter.value = record.cat;
      render();
      status.textContent = 'Record saved.';
    } catch(error){
      status.textContent = error.message;
    } finally {
      setBusy(false);
    }
  });

  signIn.addEventListener('click',() => GAuth.signIn());
  filter.addEventListener('change',render);
  form.elements.type.addEventListener('change',toggleReminder);
  $('#cat-medical-add').addEventListener('click',() => openForm());
  $('#cat-medical-cancel').addEventListener('click',() => {
    form.reset();
    form.hidden = true;
    editing = null;
    $('#cat-medical-add').focus();
  });
  window.addEventListener('pagehide',clearPrivateView);
  window.addEventListener('pageshow',event => { if(event.persisted) load(); });

  async function load(){
    if(!GAuth.token()){
      signIn.hidden = false;
      return;
    }
    try {
      const response = await request();
      ({records} = await response.json());
      signIn.hidden = true;
      owner.hidden = false;
      render();
    } catch(error){
      status.textContent = error.message;
    }
  }
  load();
})();
