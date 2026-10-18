/* Yard viewpoint tags: storage, filtering, and backwards-compatible photo rows. */
(function(root){
  function normalize(values){
    const seen=new Set(),out=[];
    for(const value of values){
      if(typeof value!=='string')continue;
      const label=value.trim().replace(/\s+/g,' '),key=label.toLowerCase();
      if(label&&!seen.has(key)){seen.add(key);out.push(label);}
    }
    return out;
  }
  function read(value){return normalize(Array.isArray(value)?value:typeof value==='string'?value.split('|'):[]);}
  function parseInput(value,photos=[]){
    const known=new Map();for(const photo of photos)for(const tag of read(photo.viewTags))if(!known.has(tag.toLowerCase()))known.set(tag.toLowerCase(),tag);
    return normalize(String(value||'').split(/[,|]/)).map(tag=>known.get(tag.toLowerCase())||tag);
  }
  function choices(photos){
    const entries=new Map();
    for(const photo of photos)for(const tag of read(photo.viewTags)){
      const key=tag.toLowerCase();if(!entries.has(key))entries.set(key,{value:'view:'+key,label:tag,count:0});entries.get(key).count++;
    }
    return [...entries.values()].sort((a,b)=>a.label.localeCompare(b.label));
  }
  function filter(photos,value='all'){
    if(value==='untagged')return photos.filter(photo=>read(photo.viewTags).length===0);
    if(value.startsWith('view:')){const tag=value.slice(5);return photos.filter(photo=>read(photo.viewTags).some(label=>label.toLowerCase()===tag));}
    return photos.slice();
  }
  function fromSheetPhoto(row){
    const tags=read(row.viewTags),also=(row.alsoIn||'').split('|').filter(Boolean);
    return {key:row.key||'',date:row.date||'',caption:row.caption||'',
      ...(row.hideFromGallery==='TRUE'?{hideFromGallery:true}:{}),
      ...(also.length?{alsoIn:also}:{}),...(tags.length?{viewTags:tags}:{})};
  }
  function toSheetRows(plants){
    const rows=[['plant_id','key','date','caption','hideFromGallery','alsoIn','viewTags']];
    for(const plant of plants)for(const photo of plant.photos||[])rows.push([
      plant.id,photo.key||'',photo.date||'',photo.caption||'',photo.hideFromGallery?'TRUE':'FALSE',
      (photo.alsoIn||[]).join('|'),read(photo.viewTags).join('|')]);
    return rows;
  }
  const api={normalize,read,parseInput,choices,filter,fromSheetPhoto,toSheetRows};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.YardPhotoViews=api;
})(typeof window==='undefined'?globalThis:window);
