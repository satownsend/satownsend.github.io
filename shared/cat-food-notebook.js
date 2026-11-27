(function(){
  const tab = 'cat_food_notebook';
  const columns = ['kind','food_id','brand','flavor','type','texture','cat','date','reaction'];
  const types = ['Wet','Dry','Treat'];
  const cats = ['Clovis','Tadpole','Puck'];
  const reactions = ['Loved it','Ate some','Passed'];
  const list = $('#cat-food-list');
  const status = $('#cat-food-status');
  const saveStatus = $('#cat-food-save-status');
  const addForm = $('#cat-food-add');
  const logForm = $('#cat-food-log');
  const filters = [$('#cat-food-type'), $('#cat-food-match')];
  let rows = [];

  function element(tag, value, className){
    const node = document.createElement(tag);
    if(value) node.textContent = value;
    if(className) node.className = className;
    return node;
  }

  function foodId(food){
    return JSON.stringify([food.brand,food.flavor,food.type,food.texture]
      .map(value => value.trim().toLowerCase().replace(/\s+/g, ' ')));
  }

  function readNotebook(){
    const foods = new Map();
    const tastings = new Map();
    for(const row of rows){
      if(row.kind === 'food' && row.food_id && row.brand && row.flavor && types.includes(row.type)){
        foods.set(row.food_id,row);
      }
      if(row.kind === 'reaction' && cats.includes(row.cat) && reactions.includes(row.reaction) &&
          /^\d{4}-\d{2}-\d{2}$/.test(row.date)){
        if(!tastings.has(row.food_id)) tastings.set(row.food_id,[]);
        tastings.get(row.food_id).push(row);
      }
    }
    return [...foods.values()].map(food => ({
      ...food,
      // Later entries break ties when a cat tries the same food twice in one day.
      history: (tastings.get(food.food_id) || []).slice().reverse().sort((a,b) => b.date.localeCompare(a.date)),
    })).sort((a,b) => foodLabel(a).localeCompare(foodLabel(b)));
  }

  function foodLabel(food){
    return food.brand + ' · ' + food.flavor;
  }

  function latest(food, cat){
    return food.history.find(entry => entry.cat === cat);
  }

  function matches(food){
    const [type, filter] = filters.map(select => select.value);
    if(type && food.type !== type) return false;
    if(!filter) return true;
    const [clovis,tadpole] = cats.slice(0,2).map(cat => latest(food,cat)?.reaction);
    if(!clovis || !tadpole) return false;
    return filter === 'both' ? clovis !== 'Passed' && tadpole !== 'Passed' : clovis !== tadpole;
  }

  function card(food){
    const node = element('article','','cat-food-card');
    node.append(element('h3',foodLabel(food)),element('p',[food.type,food.texture].filter(Boolean).join(' · ')));
    const comparison = element('dl','','cat-food-comparison');
    for(const cat of cats.slice(0,2)){
      const entry = latest(food,cat);
      const cell = element('div');
      cell.append(element('dt',cat),element('dd',entry ? entry.reaction + ' · ' + entry.date : 'Untried'));
      comparison.append(cell);
    }
    node.append(comparison);
    if(food.history.length){
      const details = element('details');
      const history = element('ul');
      for(const entry of food.history){
        history.append(element('li',entry.date + ' · ' + entry.cat + ' · ' + entry.reaction));
      }
      details.append(element('summary','Tasting history (' + food.history.length + ')'),history);
      node.append(details);
    }
    return node;
  }

  function render(){
    const foods = readNotebook();
    list.replaceChildren(...foods.filter(matches).map(card));
    status.textContent = list.childElementCount ? '' : foods.length ? 'No foods match these filters.' : 'No foods have been added yet.';
    const select = logForm.elements.food;
    const selected = select.value;
    select.replaceChildren(new Option('Choose a food',''));
    for(const food of foods) select.add(new Option([foodLabel(food),food.type,food.texture].filter(Boolean).join(' · '),food.food_id));
    select.value = foods.some(food => food.food_id === selected) ? selected : '';
    logForm.querySelector('button').disabled = !foods.length;
  }

  async function sheetExists(){
    const metadata = await sheetsApi(SHEET_BASE() + '?fields=sheets.properties.title');
    return metadata.sheets.some(sheet => sheet.properties.title === tab);
  }

  async function ensureSheet(){
    if(await sheetExists()) return;
    try {
      await sheetsApi(SHEET_BASE() + ':batchUpdate', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({requests:[{addSheet:{properties:{title:tab}}}]}),
      });
    } catch(error){
      if(!await sheetExists()) throw error;
    }
  }

  async function append(row){
    await ensureSheet();
    const headers = {'Content-Type':'application/json'};
    const base = SHEET_BASE() + '/values/' + tab;
    await sheetsApi(base + '!A1:I1?valueInputOption=RAW', {
      method:'PUT', headers, body:JSON.stringify({values:[columns]}),
    });
    await sheetsApi(base + '!A:I:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', {
      method:'POST', headers, body:JSON.stringify({values:[columns.map(column => row[column] || '')]}),
    });
    rows.push(row);
  }

  let saving = false;
  function handleSave(form, makeRow, confirmation){
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if(saving || !isGsAuthed()) return;
      saving = true;
      const data = Object.fromEntries([...new FormData(form)].map(([key,value]) => [key,value.trim()]));
      const controls = [...addForm.elements,...logForm.elements];
      for(const control of controls) control.disabled = true;
      saveStatus.textContent = 'Saving…';
      try {
        const row = makeRow(data);
        if(row) await append(row);
        form.reset();
        if(form === logForm) logForm.elements.date.value = ymdLocal(new Date());
        render();
        if(form === addForm) logForm.elements.food.value = foodId(data);
        saveStatus.textContent = row ? confirmation : 'That food is already in the notebook.';
      } catch(error){
        console.error(error);
        saveStatus.textContent = 'Could not save. Check your sign-in and reload before retrying.';
      } finally {
        saving = false;
        for(const control of controls) control.disabled = false;
        logForm.querySelector('button').disabled = !readNotebook().length;
      }
    });
  }

  filters.forEach(select => select.addEventListener('change', render));
  handleSave(addForm, data => {
    if(!data.brand || !data.flavor || !types.includes(data.type)) throw new Error('Food details are required');
    const id = foodId(data);
    return readNotebook().some(food => food.food_id === id) ? null : {...data,kind:'food',food_id:id};
  }, 'Food saved. You can log a reaction for it now.');
  handleSave(logForm, data => ({
    kind:'reaction',food_id:data.food,cat:data.cat,date:data.date,reaction:data.reaction,
  }), 'Reaction saved.');

  async function load(){
    try {
      if(isGsAuthed()){
        if(await sheetExists()){
          const data = await sheetsApi(SHEET_BASE() + '/values/' + tab + '!A:I');
          rows = csvToObjects(data.values || []);
        }
        const today = ymdLocal(new Date());
        logForm.elements.date.defaultValue = today;
        logForm.elements.date.max = today;
        $('#cat-food-editor').hidden = false;
      } else {
        rows = await fetchTab(tab);
      }
      render();
    } catch(error){
      // The public tab is created on the first signed-in save.
      status.textContent = isGsAuthed() ? 'Could not load the notebook. Reload to try again.' : 'No foods are available yet.';
      console.warn('Could not load the food notebook',error);
    }
  }

  load();
})();
