// Shared calendar playback. No wall-clock catch-up: callers feed visible-frame time.
export function validDate(value){
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
export function yearDates(year, today){
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !validDate(today) || year > Number(today.slice(0, 4))) throw new Error('Choose a completed or current calendar year');
  const end = year === Number(today.slice(0, 4)) ? today : `${year}-12-31`, dates = [];
  for (let time = Date.UTC(year, 0, 1); time <= Date.parse(end + 'T12:00:00Z'); time += 86400000) dates.push(new Date(time).toISOString().slice(0, 10));
  return dates;
}
export class Timeline {
  constructor(length, { duration = 60, speed = 1 } = {}){
    if (!Number.isInteger(length) || length < 1 || !Number.isFinite(duration) || duration <= 0) throw new Error('Invalid playback length');
    this.length = length; this.duration = duration; this.position = 0; this.playing = false; this.setSpeed(speed);
  }
  get index(){ return Math.min(this.length - 1, Math.floor(this.position)); }
  seek(index){
    if (!Number.isFinite(index)) return;
    this.position = Math.max(0, Math.min(this.length - 1, Math.floor(index)));
  }
  play(){ if (this.index === this.length - 1) this.seek(0); this.playing = this.length > 1; }
  pause(){ this.playing = false; }
  setSpeed(speed){ if (!Number.isFinite(speed) || speed < .25 || speed > 4) throw new Error('Invalid playback speed'); this.speed = speed; }
  advance(seconds){
    const previous = this.index;
    if (this.playing && Number.isFinite(seconds) && seconds > 0){
      this.position = Math.min(this.length, this.position + seconds * this.length / this.duration * this.speed);
      if (this.position >= this.length){ this.position = this.length - 1; this.pause(); }
    }
    return this.index !== previous;
  }
}
