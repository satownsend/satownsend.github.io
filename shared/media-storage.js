/* Owner-authenticated media storage. Public photo URLs remain unchanged. */
(function(){
  const ENDPOINT = 'https://satownsend-chatbot.satownsend.workers.dev/media/';
  const PREFIXES = ['photos/', 'beer-photos/', 'instrument-photos/', 'wildlife-photos/', 'photography/'];
  // Clear legacy credentials on every device that loads the new client. Never read
  // the old Google vault; its contents and the old R2 token must be retired separately.
  for(const section of ['yard','beer','instrument','wildlife','photography']){
    try { localStorage.removeItem(section+'Dashboard.r2creds'); } catch(e){}
  }
  async function call(path, options={}){
    const token = window.GAuth.token();
    if(!token) throw new Error('Sign in with Google to manage photos.');
    const response = await fetch(ENDPOINT+path, {...options,redirect:'error',cache:'no-store',headers:{...options.headers,Authorization:'Bearer '+token}});
    if(!response.ok){
      const data = await response.json().catch(()=>null);
      throw new Error(response.status===401 ? 'Photo access denied. Sign out and sign in with the owner account.' : data?.error || 'Photo storage is unavailable. Try again.');
    }
    return response;
  }
  async function request({method,key,body,contentType}){
    if(method === 'PUT'){
      const size = body?.byteLength ?? body?.size ?? 0;
      const limit = contentType?.startsWith('video/') ? 90 : 20;
      if(!size || size > limit*1024*1024) throw new Error(`Choose a non-empty file no larger than ${limit} MiB.`);
    }
    return call('object?key='+encodeURIComponent(key),{method,body,headers:contentType?{'Content-Type':contentType}:{}});
  }
  async function list(prefix, cursor){
    // Backfill formerly listed the entire bucket. Restrict it to the five media
    // namespaces and carry both the prefix index and R2 cursor between pages.
    let index=0, next=cursor||'';
    if(!prefix && cursor){
      const parsed=JSON.parse(cursor); index=parsed.index; next=parsed.cursor;
      if(!Number.isInteger(index)||index<0||index>=PREFIXES.length) throw new Error('Invalid photo cursor.');
    }
    const active=prefix||PREFIXES[index];
    const result=await (await call('list?'+new URLSearchParams({prefix:active,...(next?{cursor:next}:{})}))).json();
    if(prefix) return result;
    const truncated=result.truncated||index<PREFIXES.length-1;
    return {keys:result.keys,truncated,next:truncated?JSON.stringify(result.truncated?{index,cursor:result.next}:{index:index+1,cursor:''}):''};
  }
  async function check(){return (await call('status')).json();}
  window.MediaStorage={request,list,check};
})();
