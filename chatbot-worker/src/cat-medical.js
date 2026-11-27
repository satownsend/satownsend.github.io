const MAX_DOCUMENT = 5 * 1024 * 1024;
const MAX_REQUEST = MAX_DOCUMENT + 32 * 1024;
const CATS = ['Puck', 'Clovis', 'Tadpole'];
const TYPES = ['Vet visit', 'Vaccination', 'Medication', 'Vet document', 'Allergy', 'Prescription diet', 'Feeding restriction'];
const FEEDING = TYPES.slice(4);
const EXTENSIONS = {'application/pdf':'pdf', 'image/jpeg':'jpg', 'image/png':'png'};
const RECORD_PREFIX = 'record:';
const FILE_PREFIX = 'file:';

function json(value, status = 200){
  return Response.json(value, {status});
}

function failure(message, status){
  return json({error:message},status);
}

export async function medicalResponse(request, env, headers){
  let response;
  try {
    response = env.CAT_MEDICAL
      ? await env.CAT_MEDICAL.get(env.CAT_MEDICAL.idFromName('cats')).fetch(request)
      : failure('Medical storage is unavailable.', 503);
  } catch {
    response = failure('Medical storage is unavailable.', 503);
  }
  const result = new Response(response.body, response);
  for(const [key,value] of Object.entries(headers)) result.headers.set(key,value);
  result.headers.set('X-Content-Type-Options','nosniff');
  result.headers.set('Access-Control-Expose-Headers','Content-Disposition');
  return result;
}

async function boundedForm(request){
  if(!/^multipart\/form-data;/i.test(request.headers.get('Content-Type') || '') || !request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while(true){
    const {value,done} = await reader.read();
    if(done) break;
    size += value.byteLength;
    if(size > MAX_REQUEST){
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new Response(new Blob(chunks), {headers:{'Content-Type':request.headers.get('Content-Type')}}).formData();
}

function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}

async function parseRecord(request){
  const form = await boundedForm(request).catch(() => null);
  if(!form) return null;
  const text = name => typeof form.get(name) === 'string' ? form.get(name).trim() : '';
  const cat = text('cat'), type = text('type'), date = text('date'), title = text('title'), notes = text('notes');
  if(!CATS.includes(cat) || !TYPES.includes(type) || !validDate(date) || !title || title.length > 120 || notes.length > 4000) return null;
  const file = form.get('document');
  const hasDocument = file instanceof Blob && file.size > 0;
  if(hasDocument && (!Object.hasOwn(EXTENSIONS,file.type) || file.size > MAX_DOCUMENT)) return null;
  return {
    record: {cat,type,date,title,notes,feedingReminder:FEEDING.includes(type) && text('feedingReminder') === 'on'},
    expected: text('version'),
    removeDocument: text('removeDocument') === 'on',
    document: hasDocument ? {bytes:await file.arrayBuffer(), extension:EXTENSIONS[file.type]} : null,
  };
}

// This object has no public hostname and is reachable only through the Worker binding.
export class CatMedicalStore {
  constructor(context){
    this.storage = context.storage;
  }

  async fetch(request){
    const path = new URL(request.url).pathname;
    if(path === '/cat-medical/records' && request.method === 'GET'){
      const records = [...(await this.storage.list({prefix:RECORD_PREFIX})).values()];
      records.sort((a,b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
      return json({records});
    }

    const route = /^\/cat-medical\/records\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(\/document)?$/.exec(path);
    if(!route) return failure('Resource not found.',404);
    const [,id,documentPath] = route;
    const recordKey = RECORD_PREFIX + id, fileKey = FILE_PREFIX + id;

    if(documentPath && request.method === 'GET'){
      const stored = await this.storage.get(fileKey);
      if(!stored) return failure('Document not found.',404);
      return new Response(stored.bytes, {headers:{
        'Content-Type':'application/octet-stream',
        'Content-Disposition':'attachment; filename="vet-document.' + stored.extension + '"',
      }});
    }
    if(documentPath || !['PUT','DELETE'].includes(request.method)) return failure('Method not allowed.',405);

    if(request.method === 'DELETE'){
      return this.storage.transaction(async tx => {
        const current = await tx.get(recordKey);
        if(!current) return failure('Record not found.',404);
        if(new URL(request.url).searchParams.get('version') !== current.version) return failure('Record changed. Reload and try again.',409);
        await tx.delete([recordKey,fileKey]);
        return json({deleted:true});
      });
    }

    const input = await parseRecord(request);
    if(!input) return failure('Check the record fields and choose a PDF, JPG, or PNG up to 5 MiB.',400);
    return this.storage.transaction(async tx => {
      const current = await tx.get(recordKey);
      if(input.expected !== (current?.version || '')) return failure('Record changed. Reload and try again.',409);
      if(input.document) await tx.put(fileKey,input.document);
      else if(input.removeDocument) await tx.delete(fileKey);
      const record = {...input.record,id,version:crypto.randomUUID(),
        hasDocument:!!input.document || (!input.removeDocument && !!current?.hasDocument)};
      await tx.put(recordKey,record);
      return json({record},current ? 200 : 201);
    });
  }
}
