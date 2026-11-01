# Wildlife planetarium (#200)

The tenth Yard in 3D scene lives at `/yard-3d/#planetarium`. Species occupy deterministic patches of an artistic dome; each valid dated sighting adds one star. Connections follow date order. Single-sighting species remain single stars, with no invented observations. Gold rings identify the first recorded date for that species in the selected year, including ties, rather than its actual arrival.

Year, category, species and date controls share a timeline with optional playback and a Next sighting button. The current year ends today in America/New_York. An HTML record browser offers the same sightings with dates, locations, notes, permitted photos and `/wildlife/?sighting=…` source links. Those links open and focus the matching original log entry. Keyboard navigation does not require interacting with WebGL.

Reduced-motion users start paused, have no halo pulses, and can use discrete one-day playback or jump between sightings. All scenes start paused. Animation and GPU objects are released through the existing stage lifecycle; the HTML companion and halo texture are removed on scene change.

Data comes from the existing public wildlife loaders. Hidden gallery media and video files are excluded from the shared still-photo loader. Empty successful responses remain valid; exhausted HTTP failures now propagate so unavailable sightings are not reported as an empty sky and photo failures get a visible notice. Existing callers that intentionally tolerate missing optional data retain their `.catch()` handling.

Run `node tests/planetarium.cjs` for calendar boundaries, per-year first sightings, category filtering, deterministic positions, hidden media, empty datasets and failed sources. Browser verification should cover the actual sky, filtering, playback, source links, scene switching and mobile layout.
