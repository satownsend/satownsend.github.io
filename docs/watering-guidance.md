# Watering guidance and weather-model decisions

Issue #122 replaces automatic “water due” / “skip watering” directions with soil-check reminders. These are inspection prompts, not irrigation schedules or measurements.

## Evidence used

- Previous three complete calendar days at the forecast location: one nonnegative estimate per date is required for a total. Missing, duplicate, null or stale data makes the total unavailable; three explicit zeros give zero.
- Today and tomorrow: precipitation amount and probability are shown separately. Daily totals are not remaining-rain predictions; today's total can include elapsed hours.
- Low-rain context requires all three past dates and both forecast days, with less than 0.1 inch (2.54 mm) per forecast day, probabilities below 40%, and less than 0.1 inch across the past three days. This is a UI heuristic, not a drought definition.
- The rain-recheck note requires both at least 0.25 inch (6.35 mm) and at least 60% probability on a forecast day. It never tells the user to withhold water from dry soil.
- Rainfall freshness is six hours; forecast freshness is one hour. Location and units must match the current settings.
- Only past `watered` entries for the exact plant count; date/time sorting chooses the latest regardless of spreadsheet order. Future or invalid dates are ignored. Rain never resets watering history.
- Container flags, explicit planted dates, recorded indoor/sheltered locations, and explicit moisture-loving/drought-tolerant tags explain each match. Purchase dates do not prove establishment age. Dead and wishlist plants are excluded. Unrecorded traits remain unknown.

Outdoor pots prompt inspection after two days, first-year plantings after three, and other eligible plants after four. Indoor plants and plants outside the configured frost-date growing window use seven days. These intervals reduce reminder noise; they do not specify when or how much to water. Unknown watering history is labeled, not treated as proof of dryness. Established beds are only generally prompted during a complete low-rain estimate; no broad watering order is issued. Frost dates are approximate seasonal context, not proof of dormancy or frozen soil.

## Optional weather fields: researched, not used for irrigation

[Open-Meteo forecast documentation](https://open-meteo.com/en/docs) offers air humidity, modeled soil temperature/moisture by depth, and reference evapotranspiration. ET₀ represents a reference surface rather than this garden's species, substrate or irrigation. Humidity can contextualize drying, but alone cannot establish a watering requirement. Soil models cannot resolve individual pots, amendments, shade, shelter or root balls. Adding these fields without local calibration would add precision to the display without establishing a trustworthy irrigation amount. No extra weather requests or paid service are introduced.

[Open-Meteo's NOAA model documentation](https://open-meteo.com/en/docs/gfs-api) lists HRRR at 3 km with an 18-hour forecast (48 hours for selected runs), while GFS supplies longer coverage. Soil depths and available variables differ across models. A regional-only switch would sacrifice the seven-day window. Retain `best_match` for now. A future regional comparison should retain the default fallback, name each model, compare matching lead times, check null fields and depth definitions, and validate against local observations before changing decisions. Greater spatial resolution alone does not demonstrate better watering advice.

## Care sources and future observations

[UMN Extension: new trees and shrubs](https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/watering-newly-planted-trees-and-shrubs) cautions against assuming rainfall satisfies new plantings. [Maryland Extension: watering trees and shrubs](https://extension.umd.edu/resource/watering-trees-and-shrubs) emphasizes checking soil and accounting for establishment and site conditions. The UI directs users to check the potting mix/root ball before adding water.

A future rain gauge or soil sensor belongs under issue #111. Observations must retain their own source, time and sensor location and must not be silently mixed with model estimates. No station or service-account setup is included here.

Validation: syntax and whitespace checks plus a local browser review. No automated tests were added or run, per the user's instruction.
