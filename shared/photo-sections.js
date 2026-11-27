(function(root){
  const isPuck = p => String(p.category || '').trim().toLowerCase() === 'puck';
  const includes = (p, cats) => isPuck(p) === !!cats;
  const api = {isPuck, includes};
  if(typeof module === 'object' && module.exports) module.exports=api;
  else root.PhotoSections=api;
})(typeof globalThis === 'undefined' ? this : globalThis);
