// Calisthenics Progress — tiny zero-dependency server.
//
//   node server.js          (then open http://localhost:3000)
//
// It serves the notebook and persists edits:
//   GET  /api/entries  -> the array from content/entry.js
//   POST /api/entries  -> overwrites content/entry.js with the posted array
//   POST /api/media    -> saves an uploaded file into content/media/ and
//                         returns { url: "./content/media/<name>" }
//
// No npm install needed — only Node's built-in http/fs/path.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const MEDIA_DIR = path.join(ROOT, 'content', 'media');
const ENTRY_FILE = path.join(ROOT, 'content', 'entry.js');
const INDEX_FILE = 'Workout Log Notebook.dc.html';
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime', '.ico': 'image/x-icon', '.txt': 'text/plain',
  '.woff': 'font/woff', '.woff2': 'font/woff2'
};

// --- Auto-sync ./content to git ---------------------------------------------
// After any change under ./content, commit and push. Saves are debounced and
// serialized so a burst (e.g. a media upload + an entries save) coalesces into
// one push and concurrent git invocations never collide.
const GIT_DEBOUNCE_MS = 2000;
let gitTimer = null;
let gitRunning = false;
let gitPending = false;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: ROOT }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stdout, stderr })) : resolve(stdout));
  });
}

async function syncContent() {
  if (gitRunning) { gitPending = true; return; }
  gitRunning = true;
  try {
    await run('git', ['add', 'content']);
    // Nothing staged? Skip the commit/push entirely.
    try {
      await run('git', ['diff', '--cached', '--quiet', '--', 'content']);
      return; // exit code 0 => no staged changes
    } catch (_) { /* non-zero => there are staged changes, continue */ }

    const stamp = new Date().toISOString();
    await run('git', ['commit', '-m', 'Update content (' + stamp + ')']);
    await run('git', ['push']);
    console.log('content synced → git (' + stamp + ')');
  } catch (e) {
    console.error('git sync failed:', (e.stderr || e.message || e).toString().trim());
  } finally {
    gitRunning = false;
    if (gitPending) { gitPending = false; scheduleSync(); }
  }
}

function scheduleSync() {
  clearTimeout(gitTimer);
  gitTimer = setTimeout(syncContent, GIT_DEBOUNCE_MS);
}

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function readEntries() {
  try {
    const t = fs.readFileSync(ENTRY_FILE, 'utf8');
    // Start AFTER the assignment so brackets in the comment header are ignored.
    const m = t.indexOf('CP_ENTRIES');
    const from = m >= 0 ? t.indexOf('=', m) + 1 : 0;
    const i = t.indexOf('[', from), j = t.lastIndexOf(']');
    if (i >= 0 && j > i) return JSON.parse(t.slice(i, j + 1));
  } catch (e) { console.error('readEntries failed:', e.message); }
  return [];
}

function writeEntries(arr) {
  const header = '// Calisthenics Progress — entry content (managed by server.js).\n'
    + '// Edit by hand or through the app; media files live in ./content/media/.\n'
    + 'window.CP_ENTRIES = ';
  fs.writeFileSync(ENTRY_FILE, header + JSON.stringify(arr, null, 2) + ';\n');
}

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-filename'
    });
    return res.end();
  }

  if (u === '/api/entries' && req.method === 'GET') {
    return send(res, 200, JSON.stringify(readEntries()), 'application/json');
  }

  if (u === '/api/entries' && req.method === 'POST') {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 5e7) req.destroy(); });
    req.on('end', () => {
      try { const arr = JSON.parse(b); writeEntries(arr); console.log('saved ' + arr.length + ' entries → content/entry.js'); scheduleSync(); send(res, 200, '{"ok":true}', 'application/json'); }
      catch (e) { console.error('save failed:', e.message); send(res, 400, '{"ok":false}', 'application/json'); }
    });
    return;
  }

  if (u === '/api/media' && req.method === 'POST') {
    const raw = (req.headers['x-filename'] || ('upload-' + Date.now()));
    const name = String(raw).replace(/[^a-zA-Z0-9._-]/g, '_') || ('upload-' + Date.now());
    const chunks = [];
    req.on('data', c => { chunks.push(c); });
    req.on('end', () => {
      try {
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
        fs.writeFileSync(path.join(MEDIA_DIR, name), Buffer.concat(chunks));
        console.log('saved upload → content/media/' + name);
        scheduleSync();
        send(res, 200, JSON.stringify({ url: './content/media/' + name }), 'application/json');
      } catch (e) { send(res, 500, '{"ok":false}', 'application/json'); }
    });
    return;
  }

  // static files
  let rel = (u === '/' || u === '') ? '/' + INDEX_FILE : u;
  const fp = path.normalize(path.join(ROOT, rel));
  if (fp.indexOf(ROOT) !== 0) return send(res, 403, 'forbidden');
  fs.readFile(fp, (err, data) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, data, MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
  });
});

server.listen(PORT, () => console.log('Calisthenics log → http://localhost:' + PORT));
