Calisthenics Progress — media folder
====================================

Put photos and videos for your log here, e.g.:

  ./content/media/first-muscle-up.jpg
  ./content/media/front-lever.mp4

Then reference them from ./content/entry.js:

  { "t": "photo", "pid": "slot_s1", "src": "./content/media/first-muscle-up.jpg" }
  { "t": "video", "url": "./content/media/front-lever.mp4" }

Notes
-----
- "src" (photos) / "url" (videos) may also be remote links (Pexels, YouTube,
  Vimeo, a direct .mp4, etc.).
- Photos dropped onto a slot in the app, and files uploaded via "+ video",
  are stored in your browser for preview. To make them permanent, save the
  file into this folder and point entry.js at it (or use "export entry.js").
