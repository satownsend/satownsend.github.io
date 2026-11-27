(function(root){
  function catNames(value){
    const seen = new Set();
    return String(value || '').split(',').map(name=>name.trim().replace(/\s+/g,' ')).filter(name=>{
      const key=name.toLowerCase();if(!key || seen.has(key)) return false;seen.add(key);return true;
    });
  }
  const isPuck = p => catNames(p.category).some(name=>name.toLowerCase()==='puck');
  // Storage paths keep a cat photo in Cats when its category/name changes.
  // Legacy Puck files retain their existing photography/puck paths.
  const isCat = p => /^(?:photography\/(?:cats|puck)\/)/i.test(String(p.key || '')) || isPuck(p);
  const includes = (p, cats) => isCat(p) === !!cats;
  const api = {isPuck, isCat, includes, catNames};
  if(typeof module === 'object' && module.exports) module.exports=api;
  else root.PhotoSections=api;
})(typeof globalThis === 'undefined' ? this : globalThis);
