// Auth is enforced by index.js before this module can access the bucket.
export const MEDIA_PREFIXES = ['photos/', 'beer-photos/', 'instrument-photos/', 'wildlife-photos/', 'photography/'];
const TYPES = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', mp4:'video/mp4', mov:'video/quicktime', webm:'video/webm' };
const IMAGE_LIMIT = 20 * 1024 * 1024;
const VIDEO_LIMIT = 90 * 1024 * 1024;
function mediaType(key){
  if(typeof key !== 'string' || key.length > 512 || !MEDIA_PREFIXES.some(p => key.startsWith(p))) return null;
  // No traversal, escaped separators, control characters, or arbitrary bucket keys.
  if(!key.split('/').every(part => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part) && part !== '.' && part !== '..')) return null;
  const extension = key.split('.').pop().toLowerCase();
  const type = Object.hasOwn(TYPES,extension) ? TYPES[extension] : null;
  if(type?.startsWith('video/') && !/^(wildlife-photos|photography)\//.test(key)) return null;
  return type || null;
}
export async function mediaResponse(request, env, cors){
  const headers = { ...cors, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
  const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{...headers,'Content-Type':'application/json'}});
  // This pre-existing binding points to plant-photos; routes never expose archive keys.
  const bucket = env.WEATHER_ARCHIVE;
  if(!bucket) return json({error:'Photo storage is not configured.'},503);
  const url = new URL(request.url);
  try {
    if(url.pathname === '/media/status'){
      if(request.method !== 'GET') return json({error:'Method not allowed.'},405);
      await bucket.list({prefix:'photos/',limit:1});
      return json({ok:true,maxImageBytes:IMAGE_LIMIT,maxVideoBytes:VIDEO_LIMIT});
    }
    if(url.pathname === '/media/list'){
      if(request.method !== 'GET') return json({error:'Method not allowed.'},405);
      const prefix = url.searchParams.get('prefix');
      const cursor = url.searchParams.get('cursor') || undefined;
      if(!MEDIA_PREFIXES.includes(prefix) || (cursor && cursor.length > 2048)) return json({error:'Invalid photo listing.'},400);
      const result = await bucket.list({prefix,limit:500,...(cursor ? {cursor} : {})});
      return json({keys:result.objects.map(o=>o.key).filter(key=>mediaType(key)),truncated:result.truncated,next:result.truncated?result.cursor:''});
    }
    if(url.pathname !== '/media/object') return json({error:'Not found.'},404);
    const key = url.searchParams.get('key'), type = mediaType(key);
    if(!type) return json({error:'Invalid media path or file type.'},400);
    if(request.method === 'PUT'){
      if(request.headers.get('Content-Type')?.toLowerCase() !== type) return json({error:'Content type does not match the file extension.'},415);
      const rawLength = request.headers.get('Content-Length');
      if(!rawLength || !/^\d+$/.test(rawLength)) return json({error:'A content length is required.'},411);
      const size = Number(rawLength), limit = type.startsWith('video/') ? VIDEO_LIMIT : IMAGE_LIMIT;
      if(!Number.isSafeInteger(size) || size <= 0 || size > limit) return json({error:`File exceeds the ${limit / 1024 / 1024} MiB limit or is empty.`},413);
      if(!request.body) return json({error:'Missing upload body.'},400);
      // FixedLengthStream enforces actual bytes and supplies the known size R2 needs,
      // without buffering videos in the Worker's limited memory.
      const stream = new FixedLengthStream(size);
      const controller = new AbortController();
      const pump = request.body.pipeTo(stream.writable, {signal:controller.signal});
      try {
        await Promise.all([pump, bucket.put(key,stream.readable,{httpMetadata:{contentType:type,cacheControl:'public, max-age=3600'}})]);
      } finally { controller.abort(); }
      return json({ok:true});
    }
    if(request.method === 'DELETE'){
      // Remove the companion thumbnail too; no batch/arbitrary-key deletion API.
      const keys = type.startsWith('image/') && !key.endsWith('.thumb.jpg') ? [key,key+'.thumb.jpg'] : [key];
      await bucket.delete(keys);
      return json({ok:true});
    }
    if(request.method === 'GET' || request.method === 'HEAD'){
      const object = await bucket[request.method === 'HEAD' ? 'head' : 'get'](key);
      if(!object) return json({error:'Photo not found.'},404);
      return new Response(request.method === 'HEAD' ? null : object.body, {headers:{...headers,'Content-Type':type,'Content-Length':String(object.size),'Content-Disposition':'attachment'}});
    }
    return json({error:'Method not allowed.'},405);
  } catch(e){
    // Never return bucket/provider details or credentials to the caller.
    return json({error:'Photo storage request failed. Try again.'},502);
  }
}
