/* Shared, presentation-only cover for dashboard record views. */
window.RecordCover = {
  render(root, { photos = [], preferredKey, url, name, facts = [] }) {
    const media = root.querySelector('.record-cover-media');
    const candidates = photos.filter(photo => photo.key && !/\.(mp4|mov|webm)(?:\?|$)/i.test(photo.key))
      .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const photo = candidates.find(photo => photo.key === preferredKey) || candidates[0];
    media.replaceChildren();
    media.hidden = !photo;
    if (photo) {
      const img = document.createElement('img');
      img.alt = name ? `Photo of ${name}` : 'Record photo';
      img.decoding = 'async';
      img.onerror = () => { if (media.contains(img)) media.hidden = true; };
      img.src = url(photo.key);
      media.append(img);
      if (photo.date) {
        const caption = document.createElement('span');
        caption.className = 'record-cover-date';
        caption.textContent = photo.date;
        media.append(caption);
      }
    }
    const list = root.querySelector('.record-cover-facts');
    list.replaceChildren();
    for (const [label, value] of facts) {
      if (value == null || String(value).trim() === '' || value === '—') continue;
      const group = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = String(value);
      group.append(term, detail);
      list.append(group);
    }
    list.hidden = !list.children.length;
  }
};
