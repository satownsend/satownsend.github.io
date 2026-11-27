(function(root){
  const isPuck = p => String(p.category || '').trim().toLowerCase() === 'puck';
  // Storage paths keep a cat photo in Cats when its category/name changes.
  // Legacy Puck files retain their existing photography/puck paths.
  const isCat = p => /^(?:photography\/(?:cats|puck)\/)/i.test(String(p.key || '')) || isPuck(p);
  const includes = (p, cats) => isCat(p) === !!cats;
  const api = {isPuck, isCat, includes};
  if(typeof module === 'object' && module.exports) module.exports=api;
  else root.PhotoSections=api;
})(typeof globalThis === 'undefined' ? this : globalThis);
