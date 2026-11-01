export function scanExtension(name){
  const extension = String(name).toLowerCase().split('.').pop();
  if (!['ply', 'splat', 'spz', 'ksplat', 'sog'].includes(extension)) throw new Error('Choose a PLY, SPLAT, SPZ, KSPLAT or bundled SOG scan');
  return extension;
}

export function frameBounds(min, max, aspect, fov){
  if (min.length !== 3 || max.length !== 3 || ![...min, ...max, aspect, fov].every(Number.isFinite) || aspect <= 0 || fov <= 0 || fov >= 180 || min.some((v, i) => v > max[i])) throw new Error('The scan has invalid bounds');
  const radius = Math.hypot(...max.map((v, i) => (v - min[i]) / 2));
  if (!Number.isFinite(radius) || radius < 1e-8) throw new Error('The scan has no usable 3D extent');
  const vertical = fov * Math.PI / 360, horizontal = Math.atan(Math.tan(vertical) * aspect);
  const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.15;
  return { center: min.map((v, i) => v / 2 + max[i] / 2), radius, distance, near: Math.max(radius / 10000, .00001), far: distance * 30 };
}
