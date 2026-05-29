const express = require('express');
const fetch = require('node-fetch');
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon');
const { getConfig, runWithConfig, decodeConfig } = require('./config');
const configurePage = require('./pages/configure');
const configurePageEN = require('./pages/configure-en');

const app = express();
app.use(express.json({ limit: '64kb' }));

// Logging di ogni richiesta — utile per capire se Stremio sta chiamando l'addon
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const ua = (req.headers['user-agent'] || '').slice(0, 40);
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms) UA: ${ua}`);
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function publicBase(req) {
  const c = getConfig();
  if (c.publicHost) return c.publicHost.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

// Path noti del SDK / app che NON sono config codificate.
const KNOWN_PATHS = new Set([
  'configure', 'configure-en', 'api', 'debug', 'play', 'hls', 'hls2', 'dl', 'resolve', 'extra', 'extra-en', 'donate', 'manifest.json', 'stream', 'meta', 'catalog', 'subtitles',
  'logo.png', 'logo.svg', 'background.png', 'background.svg', 'pezzottio-logo.png',
  'changelog',
]);

// Optional local cache plugin. File non presente nel repo: ramo no-op.
let _localCache = null;
try { _localCache = require('./cache.local'); } catch (_) {}
if (_localCache && typeof _localCache.setup === 'function') {
  try { _localCache.setup({ app, KNOWN_PATHS }); } catch (_) {}
}

// Middleware: se il primo segmento del path è una config base64,
// decodificala, ricava req.userConfig e riscrivi req.url.
// Altrimenti req.userConfig = {} e prosegue.
app.use((req, res, next) => {
  const match = req.url.match(/^\/([^/?]+)(\/.*)?$/);
  const seg = match ? match[1] : null;

  if (!seg || KNOWN_PATHS.has(seg)) {
    req.userConfig = {};
    return next();
  }

  const user = decodeConfig(seg);
  if (!user) {
    return res.status(404).send('Config non valida');
  }
  req.userConfig = user;
  req.url = match[2] || '/';
  next();
});

// /configure (sia "/configure" che "/:config/configure" arrivano qui:
// nel secondo caso req.userConfig è già popolato dal middleware sopra).
app.get('/configure', (req, res) => {
  res.type('html').send(
    configurePage.render({
      base: publicBase(req),
      rd: req.userConfig.rd || '',
      tb: req.userConfig.tb || '',
      order: req.userConfig.order || 'smart',
      aios: req.userConfig.aios === true || req.userConfig.aios === 'true',
      style: req.userConfig.style || null,
      onlyTorrent: req.userConfig.onlyTorrent === true || req.userConfig.onlyTorrent === 'true',
      filter: req.userConfig.filter || null,
      fullIta: req.userConfig.fullIta === true || req.userConfig.fullIta === 'true',
      prefetch: req.userConfig.prefetch === true || req.userConfig.prefetch === 'true',
      // Default ON. Diventa false solo se l'utente l'ha disattivato esplicitamente.
      httpAnime: !(req.userConfig.httpAnime === false || req.userConfig.httpAnime === 'false'),
    })
  );
});

// /configure-en: versione inglese. Stessa interfaccia (parametri identici),
// stesso /api/test backend. Il link config generato qui include lang='en'
// così l'addon attiva il branch EN (skip provider IT, Nyaa query EN-groups,
// Torrentio senza filter italiano, audio SC default ENG).
app.get('/configure-en', (req, res) => {
  res.type('html').send(
    configurePageEN.render({
      base: publicBase(req),
      rd: req.userConfig.rd || '',
      tb: req.userConfig.tb || '',
      order: req.userConfig.order || 'smart',
      aios: req.userConfig.aios === true || req.userConfig.aios === 'true',
      style: req.userConfig.style || null,
      onlyTorrent: req.userConfig.onlyTorrent === true || req.userConfig.onlyTorrent === 'true',
      filter: req.userConfig.filter || null,
      fullIta: req.userConfig.fullIta === true || req.userConfig.fullIta === 'true',
      prefetch: req.userConfig.prefetch === true || req.userConfig.prefetch === 'true',
      httpAnime: !(req.userConfig.httpAnime === false || req.userConfig.httpAnime === 'false'),
    })
  );
});

// --- Test live delle API key (no salvataggio server-side) ---
async function testRealDebrid(key) {
  if (!key) return { ok: false, message: '', empty: true };
  try {
    const r = await fetch('https://api.real-debrid.com/rest/1.0/user', {
      headers: { Authorization: `Bearer ${key}` },
      timeout: 8000,
    });
    if (r.status === 401) return { ok: false, message: 'Token non valido' };
    if (!r.ok) return { ok: false, message: `Errore RD (${r.status})` };
    const u = await r.json();
    const prem = u.premium > 0
      ? `premium fino al ${new Date(u.expiration).toLocaleDateString('it-IT')}`
      : 'account free';
    return { ok: true, message: `${u.username} · ${prem}` };
  } catch (e) {
    return { ok: false, message: 'Connessione fallita: ' + e.message };
  }
}

async function testTorbox(key) {
  if (!key) return { ok: false, message: '', empty: true };
  try {
    const r = await fetch('https://api.torbox.app/v1/api/user/me', {
      headers: { Authorization: `Bearer ${key}` },
      timeout: 8000,
    });
    if (r.status === 401 || r.status === 403) return { ok: false, message: 'Token non valido' };
    if (!r.ok) return { ok: false, message: `Errore Torbox (${r.status})` };
    const body = await r.json();
    const u = body?.data || {};
    const plan = u.plan ? `plan ${u.plan}` : 'account attivo';
    return { ok: true, message: `${u.email || 'utente'} · ${plan}` };
  } catch (e) {
    return { ok: false, message: 'Connessione fallita: ' + e.message };
  }
}

// === HLS PROXY (GuardaSerie + StreamingCommunity + AnimeUnity) ===
// Pezzottio fa da bridge tra Stremio e i CDN dei provider HLS:
// 1) Stremio chiede master.m3u8 al nostro endpoint
// 2) Noi fetciamo il CDN con header validi (CDN accetta)
// 3) Riscriviamo le URL interne del manifest per puntarle al nostro proxy
// 4) Per ogni segment, ricaviamo URL signed fresh (no TTL stop)
//
// Routing: /hls/{vx|sc|au}/:id/:season/:episode/...
//   - vx = GuardaSerie  (id = imdb number)
//   - sc = StreamingCommunity (id = tmdb)
//   - au = AnimeUnity (id = anime id upstream)
//
// Il router è montato su /hls e /hls2 (alias) per supportare cache-busting:
// se si vuole forzare CF a invalidare le response cached, basta cambiare il
// path emesso da addon.js da /hls a /hls2 (o viceversa) — entrambi gli alias
// servono lo stesso router con lo stesso behavior. Default è /hls perché è
// quello che CF Worker / regole esistenti già conoscono.
const vidxgo = require('./providers/vidxgo');
const streamingcommunity = require('./providers/streamingcommunity');
const animeunity = require('./providers/animeunity');

// Dominio upstream StreamingCommunity. Localizzato qui per non duplicare la
// stringa in ogni debug endpoint sotto.
const SC_UPSTREAM = process.env.SC_UPSTREAM || 'https://vixsrc.to';

const PROVIDERS = { vx: vidxgo, sc: streamingcommunity, au: animeunity };

// hlsBase deriva il prefix dal mount point del router (req.baseUrl = "/hls"
// o "/hls2"). In questo modo gli URL riscritti restano sullo stesso prefix
// del request entrante — niente cross-prefix che confonderebbe CF cache.
function hlsBase(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const prefix = req.baseUrl || '/hls2';
  return `${proto}://${host}${prefix}/${req.params.prov}/${req.params.id}/${req.params.season}/${req.params.episode}`;
}

function parseSE(req) {
  const isMovie = req.params.season === 'movie' || req.params.episode === 'movie';
  return {
    isMovie,
    season: isMovie ? null : Number(req.params.season),
    episode: isMovie ? null : Number(req.params.episode),
  };
}

// Master playlist: filtra a UNA sola qualità (1080p > 720p > 480p) per evitare
// che Stremio faccia ABR probing lento. Riscrive URL playlist e URI interni
// (EXT-X-MEDIA per audio/sub) verso il nostro proxy /hls/.../playlist/ENC.m3u8.
const QUALITY_PRIORITY = [
  { tag: 'RESOLUTION=1920x1080', label: '1080p' },
  { tag: 'RESOLUTION=1280x720', label: '720p' },
  { tag: 'RESOLUTION=854x480', label: '480p' },
];
const hlsRouter = express.Router();
hlsRouter.get('/:prov/:id/:season/:episode/master.m3u8', async (req, res) => {
  const prov = PROVIDERS[req.params.prov];
  if (!prov) return res.status(404).send('unknown provider');
  try {
    const { isMovie, season, episode } = parseSE(req);
    const master = await prov.getMasterUrlCached(req.params.id, season, episode, isMovie);
    const r = await prov.cdnFetch(master.url);
    if (!r.ok) return res.status(r.status).send('CDN error');
    const text = await r.text();
    const myBase = hlsBase(req);

    // Parse del master playlist: separo HEADER (tag globali + EXT-X-MEDIA),
    // STREAM-INF blocks (coppie #EXT-X-STREAM-INF: ... + URL playlist video).
    const rawLines = text.split(/\r?\n/);
    const headerLines = [];
    const streamBlocks = []; // [{ infLine, urlLine }]
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (!line) continue;
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        // Successiva riga non-comment è l'URL del playlist video
        let j = i + 1;
        while (j < rawLines.length && (rawLines[j].startsWith('#') || !rawLines[j].trim())) j++;
        const urlLine = rawLines[j] || '';
        streamBlocks.push({ infLine: line, urlLine });
        i = j;
      } else {
        headerLines.push(line);
      }
    }

    // Helper: riscrivi qualunque URL al nostro proxy
    function rewriteUrl(u) {
      const absUrl = u.startsWith('http') ? u : new URL(u, master.url).toString();
      const encoded = Buffer.from(absUrl).toString('base64url');
      return `${myBase}/playlist/${encoded}.m3u8`;
    }
    // Se lang='en', SC ha multi-audio (ITA default + ENG). Swappiamo i flag
    // DEFAULT/AUTOSELECT per far selezionare al player la traccia ENG di default.
    // Lang dalla config utente (default 'it' → comportamento attuale identico).
    const _userLang = getConfig().lang;
    const swapAudioToEN = _userLang === 'en';
    function rewriteHeaderLine(line) {
      let out = line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${rewriteUrl(u)}"`);
      if (swapAudioToEN && /^#EXT-X-MEDIA:[^]*TYPE=AUDIO/.test(out)) {
        if (/LANGUAGE="ita"/i.test(out)) {
          // Traccia ITA: non più default
          out = out.replace(/DEFAULT=YES/g, 'DEFAULT=NO').replace(/AUTOSELECT=YES/g, 'AUTOSELECT=NO');
        } else if (/LANGUAGE="eng"/i.test(out)) {
          // Traccia ENG: marca DEFAULT=YES + AUTOSELECT=YES (forza se mancanti)
          out = /DEFAULT=NO/.test(out) ? out.replace(/DEFAULT=NO/g, 'DEFAULT=YES') :
                /DEFAULT=YES/.test(out) ? out : out.replace(/^#EXT-X-MEDIA:/, '#EXT-X-MEDIA:DEFAULT=YES,');
          out = /AUTOSELECT=NO/.test(out) ? out.replace(/AUTOSELECT=NO/g, 'AUTOSELECT=YES') :
                /AUTOSELECT=YES/.test(out) ? out : out.replace(/^#EXT-X-MEDIA:/, '#EXT-X-MEDIA:AUTOSELECT=YES,');
        }
      }
      return out;
    }

    // Scelgo la qualità preferita: 1080p > 720p > 480p, fallback al primo trovato
    let chosenBlock = null;
    let chosenLabel = null;
    for (const q of QUALITY_PRIORITY) {
      const found = streamBlocks.find((b) => b.infLine.includes(q.tag));
      if (found) { chosenBlock = found; chosenLabel = q.label; break; }
    }
    if (!chosenBlock && streamBlocks.length) {
      chosenBlock = streamBlocks[0]; // fallback se nessuna risoluzione standard
      chosenLabel = 'fallback';
    }
    if (!chosenBlock) {
      // Nessun STREAM-INF nel master (es. master è già a singola qualità) →
      // riscrivo tutto come faceva la versione precedente
      const lines = rawLines.map((line) => {
        if (!line || line.startsWith('#')) return rewriteHeaderLine(line);
        return rewriteUrl(line);
      });
      res.setHeader('Cache-Control', 'public, max-age=30');
      return res.type('application/vnd.apple.mpegurl').send(lines.join('\n'));
    }

    // Costruisco master ridotto: solo HEADER (riscritti) + lo STREAM-INF scelto.
    // Rinforzo HLS per player mobile strict (AVPlayer iOS in particolare):
    //   1. EXT-X-INDEPENDENT-SEGMENTS se assente (AVPlayer lo vuole)
    //   2. Se nessun EXT-X-MEDIA TYPE=AUDIO presente (= audio muxato nel video,
    //      tipico file VidXgo single-variant), aggiungo una EXT-X-MEDIA fittizia
    //      con DEFAULT=YES,LANGUAGE="ita" + AUDIO="audio" sul EXT-X-STREAM-INF
    //      → segnala esplicitamente al player che esiste una traccia audio
    //      default ITA da riprodurre (senza questo, AVPlayer iOS a volte
    //      "dimentica" di abilitare l'audio del segment muxato).
    const out = [];
    const hasIndependentSegments = headerLines.some((h) => h.startsWith('#EXT-X-INDEPENDENT-SEGMENTS'));
    const hasAudioMedia = headerLines.some((h) => /^#EXT-X-MEDIA:[^]*TYPE=AUDIO/.test(h));
    let infLine = chosenBlock.infLine;
    if (!hasAudioMedia && !/AUDIO="[^"]+"/.test(infLine)) {
      // Audio muxato (no separate track): inietto group hint per il player mobile.
      // Inserisco la EXT-X-MEDIA DOPO #EXTM3U/EXT-X-VERSION (ordine HLS spec).
      infLine = infLine.replace(/(#EXT-X-STREAM-INF:[^,]*),/, '$1,AUDIO="audio",');
      // Fallback se la regex sopra non matcha (caso bizzarro)
      if (!/AUDIO="audio"/.test(infLine)) {
        infLine = infLine.replace(/#EXT-X-STREAM-INF:/, '#EXT-X-STREAM-INF:AUDIO="audio",');
      }
    }

    for (const h of headerLines) {
      if (h.startsWith('#')) out.push(rewriteHeaderLine(h));
      else out.push(h);
    }
    if (!hasIndependentSegments) {
      // Inserisco subito dopo #EXTM3U (prima riga di solito)
      const insertAt = out.findIndex((l) => l.startsWith('#EXTM3U'));
      if (insertAt >= 0) {
        out.splice(insertAt + 1, 0, '#EXT-X-INDEPENDENT-SEGMENTS');
      } else {
        out.unshift('#EXT-X-INDEPENDENT-SEGMENTS');
      }
    }
    if (!hasAudioMedia) {
      out.push('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Italian",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="ita"');
    }
    out.push(infLine);
    out.push(rewriteUrl(chosenBlock.urlLine));

    res.setHeader('X-Quality', chosenLabel);
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.type('application/vnd.apple.mpegurl').send(out.join('\n'));
  } catch (e) {
    console.error('[hls master]', req.params.prov, e.message);
    res.status(500).send('proxy error: ' + e.message);
  }
});

// Quality sub-playlist: rewrite segment URL → /hls/.../seg/SEGNAME?u=ENC
hlsRouter.get('/:prov/:id/:season/:episode/playlist/:encUrl.m3u8', async (req, res) => {
  const prov = PROVIDERS[req.params.prov];
  if (!prov) return res.status(404).send('unknown provider');
  try {
    const playlistUrl = Buffer.from(req.params.encUrl, 'base64url').toString('utf8');
    const r = await prov.cdnFetch(playlistUrl);
    if (!r.ok) return res.status(r.status).send('CDN playlist error');
    const text = await r.text();
    const myBase = hlsBase(req);
    const lines = text.split(/\r?\n/).map((line) => {
      if (!line) return line;
      if (line.startsWith('#')) {
        // EXT-X-KEY URI: riscrivi al nostro proxy /key/ per evitare problemi
        // CORS/IP-binding/3rd-party da alcuni client (es. libmpv Android su
        // vixcloud.co/storage/enc.key). La key è statica → cachiamo aggressivamente.
        return line.replace(/URI="([^"]+)"/g, (_, u) => {
          const absUrl = u.startsWith('http') ? u : new URL(u, playlistUrl).toString();
          const encoded = Buffer.from(absUrl).toString('base64url');
          return `URI="${myBase}/key/${encoded}"`;
        });
      }
      const absUrl = line.startsWith('http') ? line : new URL(line, playlistUrl).toString();
      const u = new URL(absUrl);
      const segName = u.pathname.split('/').pop() || 'seg';
      const encoded = Buffer.from(absUrl).toString('base64url');
      return `${myBase}/seg/${segName}?u=${encoded}`;
    });
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.type('application/vnd.apple.mpegurl').send(lines.join('\n'));
  } catch (e) {
    console.error('[hls playlist]', req.params.prov, e.message);
    res.status(500).send('proxy error: ' + e.message);
  }
});

// AES key proxy. URI EXT-X-KEY è riscritta a /hls/.../key/{enc} dal proxy
// sub-playlist. Key statica → cache aggressiva CDN.
hlsRouter.get('/:prov/:id/:season/:episode/key/:encUrl', async (req, res) => {
  const prov = PROVIDERS[req.params.prov];
  if (!prov) return res.status(404).send('unknown provider');
  try {
    const keyUrl = Buffer.from(req.params.encUrl, 'base64url').toString('utf8');
    const r = await prov.cdnFetch(keyUrl);
    if (!r.ok) {
      console.error('[hls key]', req.params.prov, keyUrl, '→', r.status);
      return res.status(r.status).end();
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    r.body.pipe(res);
  } catch (e) {
    console.error('[hls key]', req.params.prov, e.message);
    res.status(500).end();
  }
});

// Segment binary: fetch + stream. Se token scaduto, rinnova e ricerca segment.
hlsRouter.get('/:prov/:id/:season/:episode/seg/:segName', async (req, res) => {
  const prov = PROVIDERS[req.params.prov];
  if (!prov) return res.status(404).send('unknown provider');
  try {
    const { isMovie, season, episode } = parseSE(req);
    let segUrl = req.query.u ? Buffer.from(req.query.u, 'base64url').toString('utf8') : null;

    async function fetchSeg(url) {
      return prov.cdnFetch(url, { 'Range': req.headers.range || '' });
    }

    let r = segUrl ? await fetchSeg(segUrl) : null;
    if (!r || r.status === 403 || r.status === 410 || r.status === 404) {
      console.log('[hls seg]', req.params.prov, req.params.segName, 'token expired, refreshing');
      const fresh = await prov.resolveSegmentUrl(req.params.id, season, episode, isMovie, req.params.segName);
      if (fresh) {
        segUrl = fresh;
        r = await fetchSeg(segUrl);
      }
    }
    if (!r || !r.ok) return res.status(r ? r.status : 502).end();

    res.status(r.status);
    // NON inoltro il cache-control dell'origin (CDN imposta no-cache/private).
    // I segment HLS sono immutabili per URL (token incluso nel pathname/query):
    // forzo public+max-age lungo così Cloudflare li tiene in cache 1 mese e
    // risponde dall'edge senza colpire il nostro server.
    const passThrough = ['content-type', 'content-length', 'content-range', 'accept-ranges'];
    for (const h of passThrough) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    r.body.pipe(res);
  } catch (e) {
    console.error('[hls seg]', req.params.prov, e.message);
    res.status(500).send('proxy error: ' + e.message);
  }
});

// Monto il router su /hls2 (path attivo, emesso da addon.js) e su /hls
// (legacy, per sessioni in flight con URL già cached da Stremio). hlsBase()
// usa req.baseUrl quindi i sub-path emessi nei master/playlist restano sullo
// stesso prefix di entrata — niente cross-prefix che confonde CF cache.
app.use('/hls2', hlsRouter);
app.use('/hls', hlsRouter);

// === PROXY DEBRID DIRECT-STREAM ===
// Risolve il problema CDN RD: serve 'application/force-download' senza CORS.
// Stremio rifiuta. Proxiamo: fetciamo da RD, riscriviamo Content-Type a
// video/* corretto + CORS, piping del body. Funziona ovunque (Web/Desktop).
// Costo: tutto il traffico video passa da Render (~5-30GB per film 4K).
const MIME_BY_EXT = {
  mkv: 'video/x-matroska', mp4: 'video/mp4', avi: 'video/x-msvideo',
  mov: 'video/quicktime', webm: 'video/webm', ts: 'video/mp2t',
  m4v: 'video/x-m4v', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
};
app.get('/dl/:encUrl', async (req, res) => {
  try {
    const url = Buffer.from(req.params.encUrl, 'base64url').toString('utf8');
    const range = req.headers.range || '';
    const ext = (url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1]?.toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'video/mp4';
    const upstream = await fetch(url, {
      headers: range ? { Range: range } : {},
      redirect: 'follow',
    });
    res.status(upstream.status);
    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    for (const h of ['content-length', 'content-range', 'cache-control']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    upstream.body.pipe(res);
  } catch (e) {
    console.error('[dl] proxy err:', e.message);
    res.status(502).end();
  }
});

// Lazy resolve HTTP anime (AW/AS): Stremio chiama questo URL al click "play".
// Pattern stesso del /play debrid: /stream emette solo placeholder (zero attesa
// per la chain di fetch), la risoluzione avviene SOLO quando l'utente clicca.
// 302 redirect alla URL MP4/m3u8 diretta. Slug è base64url-encoded.
const ANIME_RESOLVERS = {
  aw: require('./providers/animeworld'),
  as: require('./providers/animesaturn'),
};
app.get('/resolve/:prov/:slugEnc/:episode', async (req, res) => {
  const prov = req.params.prov;
  const resolver = ANIME_RESOLVERS[prov];
  if (!resolver || !resolver.resolveBySlug) return res.status(404).send('unknown provider');
  try {
    const slug = Buffer.from(req.params.slugEnc, 'base64url').toString('utf8');
    const episode = Number(req.params.episode);
    const absoluteEpisode = req.query.abs ? Number(req.query.abs) : null;
    const t0 = Date.now();
    const r = await resolver.resolveBySlug(slug, episode, absoluteEpisode);
    if (!r || !r.url) {
      console.log(`[resolve] ${prov} ${slug} ep${episode} -> NOT FOUND (${Date.now() - t0}ms)`);
      return res.status(404).send('stream not found');
    }
    console.log(`[resolve] ${prov} ${slug} ep${episode} -> ${r.url.slice(0, 80)} (${Date.now() - t0}ms)`);
    // 302 secco senza body per evitare HTTP/2 framing errors via CF tunnel.
    return res.set('Location', r.url).status(302).end();
  } catch (e) {
    console.error('[resolve]', prov, e.message);
    return res.status(502).send('resolve failed');
  }
});

// Lazy resolve debrid: Stremio chiama questo URL al click "play".
// 1 click = 1 chiamata al provider scelto = ZERO rate limit (pattern Torrentio).
// Supporta ?s=N&e=M per selezionare il file giusto dentro un pack.
// Supporta ?p=tb|rd per scegliere il provider (default: TB se key presente, RD fallback).
app.get('/play/:hash', async (req, res) => {
  const start = Date.now();
  const hash = String(req.params.hash || '').toLowerCase();
  const season = req.query.s ? Number(req.query.s) : null;
  const episode = req.query.e ? Number(req.query.e) : null;
  const wantedProvider = (req.query.p || '').toLowerCase(); // 'tb' o 'rd'
  const seTag = season && episode ? ` S${season}E${episode}` : '';
  const ua = (req.headers['user-agent'] || '').slice(0, 60);

  const user = req.userConfig || {};
  // Provider selection:
  // - ?p=tb esplicito → TB (404 se no key TB)
  // - ?p=rd esplicito → RD (404 se no key RD)
  // - default (no ?p): TB se presente, altrimenti RD se presente
  let useTb = false, useRd = false;
  if (wantedProvider === 'tb') useTb = !!user.tb;
  else if (wantedProvider === 'rd') useRd = !!user.rd;
  else { useTb = !!user.tb; useRd = !useTb && !!user.rd; }

  if (!useRd && !useTb) {
    console.log(`[play] NO_KEY ${hash.slice(0, 8)} wantedP=${wantedProvider || 'none'}`);
    return res.status(404).send('Nessuna chiave debrid configurata');
  }
  const provName = useTb ? 'TB' : 'RD';
  console.log(`[play] start ${hash.slice(0, 8)}${seTag} via ${provName} UA=${ua}`);

  const { runWithConfig } = require('./config');
  await runWithConfig(user, async () => {
    try {
      let url;
      if (useRd) {
        const rd = require('./debrid/realdebrid');
        // FAST PATH: se /stream ha emesso ?fi= e ?rli= (file_index +
        // rd_link_index pre-mappati dall'API esterna), uso quelli direttamente.
        // Salta pickRdLink euristico, più affidabile per i pack di serie.
        const fi = req.query.fi !== undefined && req.query.fi !== '' ? req.query.fi : null;
        const rli = req.query.rli !== undefined && req.query.rli !== '' ? req.query.rli : null;
        if (fi !== null || rli !== null) {
          const TR = 'tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://tracker.openbittorrent.com:6969/announce&tr=udp://open.demonii.com:1337/announce';
          const magnet = `magnet:?xt=urn:btih:${hash}&${TR}`;
          url = await rd.getStreamUrlFast(hash, magnet, fi, rli);
        } else {
          // SLOW PATH (legacy / fallback per link generati prima del fast path):
          // se in mylist riusa torrent_id, altrimenti addMagnet+selectAll+pick.
          const mylist = await rd.getMyList();
          const existing = mylist.get(hash);
          if (existing) {
            url = await rd.getStreamUrlFromExisting(existing, season, episode);
          } else {
            const TR = 'tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://tracker.openbittorrent.com:6969/announce&tr=udp://open.demonii.com:1337/announce';
            const magnet = `magnet:?xt=urn:btih:${hash}&${TR}`;
            url = await rd.getStreamUrl(hash, magnet, season, episode);
          }
        }
      } else {
        // TB: createtorrent + redirect 302 (pattern Torrentio).
        const TR = 'tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://tracker.openbittorrent.com:6969/announce&tr=udp://open.demonii.com:1337/announce&tr=udp://tracker.torrent.eu.org:451/announce';
        const magnet = `magnet:?xt=urn:btih:${hash}&${TR}`;
        const tb = require('./debrid/torbox');
        url = await tb.getStreamUrl(hash, magnet, season, episode);
      }

      const ms = Date.now() - start;
      if (!url) {
        console.log(`[play] NOT_READY ${hash.slice(0, 8)}${seTag} via ${provName} (${ms}ms)`);
        // 503 → Stremio mostra "stream non disponibile" e passa al successivo.
        // Fallback magnet via redirect non funziona: libmpv (player) non
        // gestisce lo schema magnet://, ritorna loading failed.
        return res.status(503).send(`${provName} non ha questo torrent in cache. Prova un altro stream.`);
      }
      // RD/TB: redirect diretto al CDN. Lo stream ha notWebReady=true →
      // Stremio Web salta, Desktop/Mobile usano libmpv che gestisce
      // direttamente i Content-Type non standard di RD CDN.
      // /dl endpoint resta come fallback (non più usato di default).
      console.log(`[play] OK ${hash.slice(0, 8)}${seTag} via ${provName} (${ms}ms)`);
      // 302 "secco" senza body (Content-Length: 0). Express res.redirect()
      // emette HTML "Found. Redirecting to ..." con Content-Type: text/html;
      // su CF tunnel + HTTP/2 client questo provoca "Error in the HTTP2
      // framing layer" → Stremio mostra "loading failed". Mandando solo
      // Location + 302 + body vuoto il framing resta pulito.
      res.set('Location', url).status(302).end();

      // === FIRE-AND-FORGET dopo il redirect ===
      // Auto-prefetch del prossimo episodio in TB se serie + opt-in.
      try {
        // Prefetch prossimo episodio (solo serie, solo se opt-in)
        if (season && episode && useTb && user.prefetch === true) {
          const { prefetchNext } = require('./prefetch');
          // Risolutore semplice: chiama internamente /stream del prossimo ep e prende il pool
          const fetch = require('node-fetch');
          // Trovo imdbId dal contesto: per ora skip se non lo so banalmente.
          // Recupero imdbId dal referrer Stremio o dal pattern stesso non possibile
          // direttamente — il /play riceve solo hash. Per il prefetch ideale serve
          // l'imdb id, che possiamo passare come query opzionale dal addon.js.
          // Per ora skippiamo se non c'è ?i=tt.... in URL.
          const imdbId = req.query.i;
          if (imdbId && /^tt\d{6,}$/i.test(imdbId)) {
            prefetchNext({
              imdbId,
              season,
              episode,
              userCfg: user,
              resolveStreams: async ({ id }) => {
                // Auto-chiama nostro stesso /stream del next episode
                const cfgB64 = require('./config').encodeConfig(user);
                const base = `${req.protocol}://${req.get('host')}`;
                const r = await fetch(`${base}/${cfgB64}/stream/series/${id}.json`, { timeout: 6000 });
                if (!r.ok) return [];
                const j = await r.json().catch(() => ({}));
                return j.streams || [];
              },
            }).catch(() => {});
          }
        }
      } catch (_) { /* mai bloccare il /play */ }
    } catch (e) {
      const ms = Date.now() - start;
      console.error(`[play] ERR ${hash.slice(0, 8)} via ${provName} (${ms}ms):`, e.message);
      res.status(500).send('Errore: ' + e.message);
    }
  });
});

app.post('/api/test', async (req, res) => {
  const { rd, tb } = req.body || {};
  const [rdResult, tbResult] = await Promise.all([testRealDebrid(rd), testTorbox(tb)]);
  res.json({ rd: rdResult, tb: tbResult });
});

// === DONAZIONI (Payblis Checkout Mode) ===
const donations = require('./donations');

// Genera URL Payblis. Frontend POST → ritorna { redirect } da seguire client-side.
app.post('/api/donate', async (req, res) => {
  try {
    const { amount, email, name } = req.body || {};
    const err = donations.validateDonation({ amount, email, name });
    if (err) return res.status(400).json({ error: err });
    if (!process.env.PAYBLIS_MERCHANT_KEY) {
      return res.status(503).json({ error: 'Donazioni non configurate sul server' });
    }
    const userIP = req.headers['cf-connecting-ip']
      || req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || '';
    const publicHost = publicBase(req);
    const { url, refOrder } = donations.buildCheckoutUrl({ amount, email, name, userIP, publicHost });
    console.log(`[donate] new request: ${refOrder} amount=${amount}€ email=${email}`);
    res.json({ redirect: url, ref: refOrder });
  } catch (e) {
    console.error('[donate] err:', e.message);
    res.status(500).json({ error: 'errore interno' });
  }
});

// Pagina di ringraziamento dopo pagamento completato.
app.get('/donate/ok', (req, res) => {
  const ref = String(req.query.ref || '').slice(0, 60);
  res.type('html').send(donatePage({
    title: 'Grazie!',
    color: '#10b981',
    icon: '✓',
    heading: 'Donazione ricevuta. Grazie!',
    body: 'Il tuo supporto fa la differenza. Il server, la banda e tutto il resto continuano a girare grazie a chi sceglie di contribuire come hai fatto tu.',
    ref,
  }));
});

// Pagina di errore/cancel pagamento.
app.get('/donate/ko', (req, res) => {
  const ref = String(req.query.ref || '').slice(0, 60);
  res.type('html').send(donatePage({
    title: 'Pagamento annullato',
    color: '#f5a524',
    icon: '×',
    heading: 'Pagamento non completato',
    body: 'Nessun addebito è stato effettuato. Puoi riprovare quando vuoi.',
    ref,
  }));
});

// IPN callback server-to-server da Payblis. Logga in /tmp file per tracking.
// Verifica firma HMAC-SHA256 se Payblis manda il header (sicurezza extra).
app.post('/donate/ipn', (req, res) => {
  try {
    const sig = req.headers['x-payblis-signature'] || req.body?.signature || '';
    const valid = sig ? donations.verifyIpnSignature(req.body || {}, sig) : true;
    donations.logDonation({
      ref: req.body?.RefOrder || req.body?.ref || null,
      amount: req.body?.amount || null,
      status: req.body?.status || req.body?.payment_status || 'unknown',
      raw: req.body,
      sigValid: valid,
      ip: req.headers['cf-connecting-ip'] || req.socket?.remoteAddress,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[donate/ipn] err:', e.message);
    res.status(500).json({ ok: false });
  }
});

// Pagina HTML minimalista per ok/ko (no Tailwind, no JS — leggera)
function donatePage({ title, color, icon, heading, body, ref }) {
  const refLine = ref ? `<div class="ref">RIF: ${ref}</div>` : '';
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} · Pezzottio</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
           background: #08080c; color: #e4e4e7; margin: 0; min-height: 100vh;
           display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 480px; width: 100%; background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 40px 32px; text-align: center; }
    .icon { width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 20px;
            display: flex; align-items: center; justify-content: center;
            font-size: 32px; font-weight: bold; background: ${color}1f; color: ${color}; border: 2px solid ${color}66; }
    h1 { margin: 0 0 12px; font-size: 24px; font-weight: 700; }
    p { color: #a1a1aa; line-height: 1.6; margin: 0 0 24px; }
    .ref { font-family: 'SF Mono', Menlo, monospace; font-size: 11px; color: #52525b; margin-bottom: 24px; }
    a { display: inline-block; padding: 12px 24px; background: #e50914; color: white;
        text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;
        text-transform: uppercase; letter-spacing: 0.5px; transition: background 0.15s; }
    a:hover { background: #b81d24; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${heading}</h1>
    <p>${body}</p>
    ${refLine}
    <a href="/configure">Torna a Pezzottio</a>
  </div>
</body>
</html>`;
}

// === /api/status ===
// Stato live dei provider esterni — chiamato dalla pagina /configure per
// mostrare quali fonti rispondono. Cache 60s per evitare di martellare le API.
const STATUS_CACHE_TTL = 60 * 1000;
let _statusCache = null;
async function pingHost(name, url, timeoutMs = 3500) {
  const t0 = Date.now();
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const r = await fetch(url, { method: 'GET', signal: controller.signal, headers: { 'User-Agent': 'Pezzottio/status-probe' } });
    clearTimeout(id);
    // 301/302/307/308 = redirect (server up); 401/403/404/405 = server risponde
    // (è "online", non rifiuto dell'addon)
    const aliveStatuses = new Set([200, 301, 302, 307, 308, 401, 403, 404, 405]);
    return { name, ok: aliveStatuses.has(r.status) || r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { name, ok: false, status: 0, ms: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

app.get('/api/status', async (req, res) => {
  if (_statusCache && Date.now() - _statusCache.t < STATUS_CACHE_TTL) {
    return res.json(_statusCache.v);
  }
  // Env overrides per host scraper (mirror dei default in search.js).
  const SOLID_HOST = process.env.SOLID_HOST || 'solidtorrents.eu';
  const BITSEARCH_HOST = process.env.BITSEARCH_HOST || 'bitsearch.eu';
  const APIBAY_HOST = process.env.APIBAY_HOST || 'apibay.org';

  const probes = await Promise.all([
    // === Provider HTTP italiani (stream diretti) ===
    pingHost('AnimeWorld', 'https://www.animeworld.ac/'),
    pingHost('AnimeSaturn', 'https://www.animesaturn.cx/'),
    pingHost('AnimeUnity', 'https://www.animeunity.so/'),
    // GuardaSerie: la homepage v.vidxgo.co/ è sempre 403 (bloccata) ma
    // l'endpoint /t/{imdb_num} (signed playlist) risponde 200 dagli IP non-bloccati
    // SE VidXgo ha il file. Usiamo /t/1375666 (Inception, presente su VidXgo)
    // come canary del vero funzionamento.
    pingHost('GuardaSerie', 'https://v.vidxgo.co/t/1375666'),
    pingHost('StreamingCommunity', `${SC_UPSTREAM}/`),
    // === Aggregator esterni (cache check Torbox/RD) ===
    pingHost('Torrentio', 'https://torrentio.strem.fun/manifest.json'),
    pingHost('MediaFusion', 'https://mediafusionfortheweebs.midnightignite.me/'),
    pingHost('Comet', 'https://comet.feels.legal/'),
    pingHost('StremThru', 'https://stremthru.13377001.xyz/'),
    pingHost('Meteor', 'https://meteorfortheweebs.midnightignite.me/'),
    // === Scraper torrent diretti (search.js) ===
    pingHost('Knaben', 'https://api.knaben.org/v1'),
    pingHost('apibay', `https://${APIBAY_HOST}/q.php?q=test`),
    pingHost('Bitsearch', `https://${BITSEARCH_HOST}/`),
    pingHost('Solid', `https://${SOLID_HOST}/`),
    pingHost('Nyaa', 'https://nyaa.si/'),
    pingHost('TokyoTosho', 'https://www.tokyotosho.info/'),
    // Hostname caricato da env (no hardcoded nel repo). Se ICV_HOST non è
    // settato, mostra comunque la riga ma con stato "env mancante" rosso —
    // così l'admin del server vede subito che deve configurarlo.
    process.env.ICV_HOST
      ? pingHost('IlCorsaroViola', process.env.ICV_HOST)
      : Promise.resolve({ name: 'IlCorsaroViola', ok: false, status: 0, ms: 0, error: 'ICV_HOST env mancante' }),
  ]);
  // Override GuardaSerie: rispetta vidxgo.isDown() (cooldown post-403 in findStream).
  // Il check /t/603 sopra è il primary indicator del funzionamento reale.
  const gs = probes.find((p) => p.name === 'GuardaSerie');
  if (gs && vidxgo.isDown()) {
    gs.ok = false;
    gs.error = 'ip_range blocked upstream';
  }
  const result = {
    timestamp: Date.now(),
    providers: probes,
    summary: {
      total: probes.length,
      online: probes.filter((p) => p.ok).length,
    },
  };
  _statusCache = { v: result, t: Date.now() };
  res.json(result);
});

// Debug SC via cycletls (TLS fingerprint Chrome): testa bypass CF da datacenter
app.get('/debug/sccycle', async (req, res) => {
  const out = { steps: [] };
  try {
    const cycleTLS = require('cycletls').default;
    const ct = await cycleTLS();
    const ja3 = '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0';
    const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
    const baseOpts = { ja3, userAgent: UA, headers: { 'Referer': `${SC_UPSTREAM}/` } };

    const t0 = Date.now();
    const r1 = await ct(`${SC_UPSTREAM}/api/movie/603`, { ...baseOpts, headers: { ...baseOpts.headers, 'Accept': 'application/json,*/*' } }, 'GET');
    const t1 = typeof r1.text === 'function' ? await r1.text() : r1.text;
    out.steps.push({ step: 'api', status: r1.status, ms: Date.now() - t0, preview: String(t1).slice(0, 200) });

    if (r1.status === 200) {
      const { src } = JSON.parse(t1);
      const t2start = Date.now();
      const r2 = await ct(SC_UPSTREAM + src, baseOpts, 'GET');
      const t2 = typeof r2.text === 'function' ? await r2.text() : r2.text;
      out.steps.push({ step: 'embed', status: r2.status, ms: Date.now() - t2start, len: t2.length });

      if (r2.status === 200) {
        const tm = t2.match(/['"]token['"]\s*:\s*['"]([^'"]+)/);
        const xm = t2.match(/['"]expires['"]\s*:\s*['"]([^'"]+)/);
        if (tm && xm) {
          const masterUrl = `${SC_UPSTREAM}/playlist/214325?token=${tm[1]}&expires=${xm[1]}&h=1`;
          const t3start = Date.now();
          const r3 = await ct(masterUrl, baseOpts, 'GET');
          const t3 = typeof r3.text === 'function' ? await r3.text() : r3.text;
          out.steps.push({ step: 'master', status: r3.status, ms: Date.now() - t3start, len: t3.length });

          if (r3.status === 200) {
            const subUrl = t3.split('\n').find((l) => l.startsWith('https://') && l.includes('480p'));
            if (subUrl) {
              const t4start = Date.now();
              const r4 = await ct(subUrl, baseOpts, 'GET');
              const t4 = typeof r4.text === 'function' ? await r4.text() : r4.text;
              out.steps.push({ step: 'sub', status: r4.status, ms: Date.now() - t4start, len: t4.length });

              if (r4.status === 200) {
                const segUrl = t4.split('\n').find((l) => l.startsWith('https://'));
                if (segUrl) {
                  const t5start = Date.now();
                  const r5 = await ct(segUrl, baseOpts, 'GET');
                  out.steps.push({ step: 'SEGMENT', status: r5.status, ms: Date.now() - t5start, url: segUrl.slice(0, 100) + '...' });
                }
              }
            }
          }
        }
      }
    }
    await ct.exit();
  } catch (e) {
    out.error = e.message;
  }
  res.json(out);
});

// Debug CDN SC: testa raggiungibilità edge CDN dal server
app.get('/debug/sccdn', async (req, res) => {
  const fetch = require('node-fetch');
  const targets = [
    'https://sc-u16-01.vix-content.net/',
    'https://sc-u8-01.vix-content.net/',
    'https://vix-content.net/',
  ];
  const out = [];
  for (const url of targets) {
    try {
      const t0 = Date.now();
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
          'Referer': `${SC_UPSTREAM}/`,
        },
        timeout: 6000,
      });
      const body = await r.text();
      out.push({ url, status: r.status, ms: Date.now() - t0, len: body.length, preview: body.slice(0, 200) });
    } catch (e) {
      out.push({ url, error: e.message });
    }
  }
  res.json(out);
});

// Debug SC: testa raggiungibilità API + parse embed dal server.
// Es. /debug/sc?tmdb=603 (Matrix movie)
app.get('/debug/sc', async (req, res) => {
  const fetch = require('node-fetch');
  const tmdb = req.query.tmdb || '603';
  const isMovie = req.query.tv !== '1';
  const s = req.query.s || '1';
  const e = req.query.e || '1';
  const out = { tmdb, isMovie, steps: [] };
  try {
    const apiUrl = isMovie ? `${SC_UPSTREAM}/api/movie/${tmdb}` : `${SC_UPSTREAM}/api/tv/${tmdb}/${s}/${e}`;
    const t0 = Date.now();
    const r = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'Referer': `${SC_UPSTREAM}/`,
        'Accept': 'application/json,*/*',
      },
      timeout: 8000,
    });
    const body = await r.text();
    out.steps.push({ step: 'api', url: apiUrl, status: r.status, ms: Date.now() - t0, body: body.slice(0, 300) });
    if (r.ok) {
      try {
        const j = JSON.parse(body);
        if (j.src) {
          const embedUrl = j.src.startsWith('http') ? j.src : `${SC_UPSTREAM}${j.src}`;
          const t1 = Date.now();
          const r2 = await fetch(embedUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
              'Referer': `${SC_UPSTREAM}/`,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 8000,
          });
          const html = await r2.text();
          const tokenM = html.match(/['"]token['"]\s*:\s*['"]([^'"]+)['"]/);
          const expiresM = html.match(/['"]expires['"]\s*:\s*['"]([^'"]+)['"]/);
          const urlM = html.match(/window\.masterPlaylist\s*=[\s\S]*?url\s*:\s*['"]([^'"]+)['"]/);
          out.steps.push({
            step: 'embed', url: embedUrl, status: r2.status, ms: Date.now() - t1,
            htmlLen: html.length,
            tokenFound: !!tokenM, expiresFound: !!expiresM, urlFound: !!urlM,
            preview: html.slice(0, 400),
          });
        }
      } catch (parseErr) {
        out.steps.push({ step: 'api-parse', error: parseErr.message });
      }
    }
  } catch (e) {
    out.error = e.message;
  }
  res.json(out);
});

// Debug External addons: mostra cosa risponde ogni upstream per uno stream id.
// Es. https://pezzottio.onrender.com/debug/external?type=series&id=tt0903747:1:1
// Se passi ?rd=<KEY> testa con la chiave RD iniettata negli aggregator.
app.get('/debug/external', async (req, res) => {
  const type = req.query.type || 'series';
  const id = req.query.id || 'tt0903747:1:1';
  const rdKey = req.query.rd || null;
  const external = require('./providers/external');
  const fetch = require('node-fetch');
  const results = [];
  for (const addon of external.EXTERNAL_ADDONS) {
    if (!addon.enabled || !addon.baseUrl) {
      results.push({ key: addon.key, enabled: false, baseUrl: addon.baseUrl });
      continue;
    }
    const base = rdKey && external._buildBaseUrl ? await external._buildBaseUrl(addon, rdKey) : addon.baseUrl;
    const url = `${base}/stream/${type}/${id}.json`;
    const t0 = Date.now();
    try {
      const r = await fetch(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Pezzottio/0.1 (Stremio Addon)' },
      });
      const ms = Date.now() - t0;
      const body = r.ok ? await r.json() : null;
      const streams = body?.streams || [];
      const rdMatch = streams.filter((s) => /\[RD[^\s\]]*\]/i.test(s.name || '')).length;
      const err = streams.filter((s) => /❌/.test(s.name || '')).length;
      results.push({
        key: addon.key,
        label: addon.label,
        status: r.status,
        ms,
        streams: streams.length,
        rdCached: rdMatch,
        rdError: err,
        sample: streams[0] ? (streams[0].name || streams[0].title || '').slice(0, 100) : null,
        urlPrefix: base.slice(0, 80),
      });
    } catch (e) {
      results.push({ key: addon.key, label: addon.label, ms: Date.now() - t0, error: e.message });
    }
  }
  res.json({ type, id, stats: external.getStats(), results });
});

// Debug Scrapers: chiama ogni indexer dal lato server (IP cloud Render)
// e riporta http status + numero di risultati. Serve per capire se l'IP
// Render è bloccato (403) su apibay/solid/bitsearch/knaben.
// Logo + wordmark: serviti dai PNG in assets/.
const path = require('path');
app.get('/logo.png', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, '..', 'assets', 'p-logo.png'));
});
app.get('/pezzottio-logo.png', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, '..', 'assets', 'pezzottio-logo.png'));
});

// Background addon: SVG con il wordmark PEZZOTTIO embedded come <image>.
app.get(['/background.png', '/background.svg'], (req, res) => {
  res.type('image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  const base = publicBase(req);
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="80%">
      <stop offset="0%" stop-color="#1a0a0a"/>
      <stop offset="50%" stop-color="#0a0506"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="40%">
      <stop offset="0%" stop-color="#e50914" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#e50914" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <ellipse cx="960" cy="540" rx="900" ry="500" fill="url(#glow)"/>
  <image href="${base}/pezzottio-logo.png" x="460" y="420" width="1000" preserveAspectRatio="xMidYMid meet"/>
</svg>`);
});

// ─── Changelog (user-facing) ──────────────────────────────────────────
// Caricato da assets/changelog.json. Cache 5 min per evitare disk I/O ripetuto.
const fs = require('fs');
let _changelogCache = null;
let _changelogCacheAt = 0;
function loadChangelog() {
  if (_changelogCache && Date.now() - _changelogCacheAt < 5 * 60 * 1000) return _changelogCache;
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'assets', 'changelog.json'), 'utf8');
    _changelogCache = JSON.parse(raw);
    _changelogCacheAt = Date.now();
  } catch (_) { _changelogCache = []; }
  return _changelogCache;
}

app.get('/api/changelog', (req, res) => {
  res.json({ entries: loadChangelog() });
});

// Notice: ultima entry 'breaking' negli ultimi 7 giorni (banner in /configure).
// L'utente può dismissare e non riapparirà finché non c'è una nuova breaking.
app.get('/api/notice', (req, res) => {
  const log = loadChangelog();
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const group of log) {
    const groupTime = new Date(group.date).getTime();
    if (isNaN(groupTime) || groupTime < weekAgo) continue;
    const breakingItem = (group.items || []).find((it) => it.type === 'breaking');
    if (breakingItem) {
      return res.json({ notice: { date: group.date, msg: breakingItem.msg } });
    }
  }
  res.json({ notice: null });
});

const TYPE_META = {
  feat:     { icon: '✨', label: 'Nuovo',  color: '#22c55e' },
  fix:      { icon: '🛠️', label: 'Fix',    color: '#3b82f6' },
  config:   { icon: '⚙️', label: 'Setup',  color: '#a855f7' },
  perf:     { icon: '🚀', label: 'Perf',   color: '#f59e0b' },
  breaking: { icon: '🚨', label: 'Breaking', color: '#ef4444' },
};

app.get('/changelog', (req, res) => {
  const log = loadChangelog();
  const groups = log.map((g) => {
    const items = (g.items || []).map((it) => {
      const m = TYPE_META[it.type] || TYPE_META.feat;
      return `<li class="flex items-start gap-3 py-2.5">
        <span class="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide" style="background:${m.color}20;color:${m.color};border:1px solid ${m.color}40">
          ${m.icon} ${m.label}
        </span>
        <span class="text-sm text-zinc-200 leading-relaxed">${String(it.msg).replace(/</g,'&lt;')}</span>
      </li>`;
    }).join('');
    const date = new Date(g.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    return `<section class="mb-10">
      <h2 class="text-sm uppercase tracking-wider text-zinc-500 font-semibold mb-3">📅 ${date}</h2>
      <ul class="space-y-1 border-l border-white/10 pl-5">${items}</ul>
    </section>`;
  }).join('');

  res.type('html').send(`<!DOCTYPE html>
<html lang="it"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Changelog · Pezzottio</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{background:#000;color:#fff;font-family:-apple-system,system-ui,sans-serif}</style>
</head><body>
<div class="max-w-3xl mx-auto px-6 py-12">
  <a href="/configure" class="text-zinc-500 text-sm hover:text-white inline-flex items-center gap-1">← Torna a Pezzottio</a>
  <h1 class="text-4xl font-extrabold mt-6 mb-2" style="color:#e50914">Changelog</h1>
  <p class="text-zinc-400 text-sm mb-10">Cosa è cambiato di recente. Aggiornato a ogni nuovo deploy.</p>
  ${groups || '<p class="text-zinc-500">Nessuna entry ancora.</p>'}
</div>
</body></html>`);
});

app.get('/debug/scrapers', async (req, res) => {
  const query = req.query.q || 'inception 2010';
  const fetch = require('node-fetch');
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const probes = [
    {
      name: 'apibay.org',
      run: async () => {
        const r = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(query)}&cat=200`, {
          headers: { 'User-Agent': ua }, timeout: 8000,
        });
        const txt = r.ok ? await r.text() : null;
        let count = 0;
        try { count = txt ? JSON.parse(txt).length : 0; } catch (_) {}
        return { status: r.status, body_len: txt?.length || 0, count };
      },
    },
    {
      name: 'solidtorrents.eu',
      run: async () => {
        const r = await fetch(`https://solidtorrents.eu/api/v1/search?q=${encodeURIComponent(query)}&sort=seeders`, {
          headers: { 'User-Agent': ua }, timeout: 8000,
        });
        const txt = r.ok ? await r.text() : null;
        let count = 0;
        try { count = txt ? (JSON.parse(txt).results || []).length : 0; } catch (_) {}
        return { status: r.status, body_len: txt?.length || 0, count };
      },
    },
    {
      name: 'bitsearch.to',
      run: async () => {
        const r = await fetch(`https://bitsearch.to/search?q=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': ua }, timeout: 8000,
        });
        const txt = r.ok ? await r.text() : null;
        const count = txt ? (txt.match(/btih:[a-fA-F0-9]{40}/g) || []).length : 0;
        return { status: r.status, body_len: txt?.length || 0, count };
      },
    },
    {
      name: 'bitsearch.eu',
      run: async () => {
        const r = await fetch(`https://bitsearch.eu/search?q=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': ua }, timeout: 8000,
        });
        const txt = r.ok ? await r.text() : null;
        const count = txt ? (txt.match(/btih:[a-fA-F0-9]{40}/g) || []).length : 0;
        return { status: r.status, body_len: txt?.length || 0, count };
      },
    },
    {
      name: 'bitsearch.io',
      run: async () => {
        const r = await fetch(`https://bitsearch.io/search?q=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': ua }, timeout: 8000,
        });
        const txt = r.ok ? await r.text() : null;
        const count = txt ? (txt.match(/btih:[a-fA-F0-9]{40}/g) || []).length : 0;
        return { status: r.status, body_len: txt?.length || 0, count };
      },
    },
    {
      name: 'api.knaben.org',
      run: async () => {
        const r = await fetch('https://api.knaben.org/v1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
          body: JSON.stringify({
            search_type: 'score', search_field: 'title', query,
            order_by: 'seeders', order_direction: 'desc', size: 25,
          }),
          timeout: 8000,
        });
        const txt = r.ok ? await r.text() : null;
        let count = 0;
        try { count = txt ? (JSON.parse(txt).hits || []).length : 0; } catch (_) {}
        return { status: r.status, body_len: txt?.length || 0, count };
      },
    },
    {
      name: 'yts.am',
      run: async () => {
        // yts.mx DNS-fail intermittente, .am è il mirror storico funzionante
        const r = await fetch(`https://yts.am/api/v2/list_movies.json?query_term=${encodeURIComponent(query)}&limit=20`, {
          headers: { 'User-Agent': ua }, timeout: 8000, redirect: 'follow',
        });
        const txt = r.ok ? await r.text() : null;
        let count = 0;
        try { count = txt ? (JSON.parse(txt).data?.movies || []).length : 0; } catch (_) {}
        return { status: r.status, body_len: txt?.length || 0, count };
      },
    },
    // EZTV: l'API ha lo stesso contenuto su tutti i mirror; provo i principali
    // per vedere quale risponde dal IP cloud Render (alcuni vietano cloud IP).
    ...['eztvx.to', 'eztv.re', 'eztv.tf', 'eztv.wf', 'eztv.ag', 'eztv.ch'].map((h) => ({
      name: h,
      run: async () => {
        // imdb_id va passato con leading-zero a 7 cifre (0903747 = Breaking Bad)
        const r = await fetch(`https://${h}/api/get-torrents?imdb_id=0903747&limit=10`, {
          headers: { 'User-Agent': ua }, timeout: 6000,
        });
        const txt = r.ok ? await r.text() : null;
        let count = 0;
        try { count = txt ? (JSON.parse(txt).torrents || []).length : 0; } catch (_) {}
        return { status: r.status, body_len: txt?.length || 0, count };
      },
    })),
    {
      name: 'nyaa.si',
      run: async () => {
        const r = await fetch(`https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=1_2&f=0`, {
          headers: { 'User-Agent': ua }, timeout: 8000,
        });
        const txt = r.ok ? await r.text() : null;
        const count = txt ? (txt.match(/<item>/g) || []).length : 0;
        return { status: r.status, body_len: txt?.length || 0, count };
      },
    },
    {
      name: 'tokyotosho.info',
      run: async () => {
        const r = await fetch(`https://www.tokyotosho.info/search.php?terms=${encodeURIComponent(query)}&type=1`, {
          headers: { 'User-Agent': ua }, timeout: 8000,
        });
        const txt = r.ok ? await r.text() : null;
        const count = txt ? (txt.match(/btih:[A-Z2-7]{32}|btih:[a-fA-F0-9]{40}/g) || []).length : 0;
        return { status: r.status, body_len: txt?.length || 0, count };
      },
    },
  ];

  const results = [];
  for (const p of probes) {
    const t0 = Date.now();
    try {
      const r = await p.run();
      results.push({ name: p.name, ok: true, ms: Date.now() - t0, ...r });
    } catch (e) {
      results.push({ name: p.name, ok: false, ms: Date.now() - t0, error: e.message });
    }
  }
  res.json({ query, ip_hint: 'questa è una richiesta server-side, mostra cosa vede Render', results });
});

// Debug RD: prende l'IMDb id, fa la ricerca pool completa, chiama IA con la
// chiave dell'utente (presa dalla URL config base64), ritorna un riepilogo:
//   - quanti hash nel pool
//   - quanti taggati [RD+] dagli aggregator
//   - quanti confermati cached da IA
//   - tempi per ogni step
// Uso: apri nel browser:
//   https://pezz8io.dpdns.org/CONFIG_BASE64/debug/rd?id=tt0413573:21:1
// dove CONFIG_BASE64 è il segmento prima di /configure nella tua URL Stremio.
app.get('/debug/rd', async (req, res) => {
  const id = req.query.id || 'tt0413573:21:1';
  const type = req.query.type || (id.split(':').length > 1 ? 'series' : 'movie');
  const cfg = req.userConfig || {};
  const rdKey = cfg.rd;
  if (!rdKey) {
    return res.json({
      error: 'Apri questo URL usando la tua config completa: /CONFIG_BASE64/debug/rd?id=...',
      hint: 'Prendi il segmento base64 dalla tua URL Stremio (quello che inizia con eyJ...)',
    });
  }
  const fetch = require('node-fetch');
  const { runWithConfig } = require('./config');
  const result = await runWithConfig(cfg, async () => {
    const cinemeta = require('./cinemeta');
    const { searchTorrents } = require('./search');
    const external = require('./providers/external');
    const meta = await cinemeta.resolveTitle(type, id).catch(() => null);
    if (!meta) return { error: `Impossibile risolvere meta per ${id}` };
    const imdbId = id.startsWith('tt') ? id.split(':')[0] : null;
    const t0 = Date.now();
    const [torrents, ext] = await Promise.all([
      searchTorrents(meta, type, imdbId),
      external.searchExternal(type, id),
    ]);
    const tPool = Date.now() - t0;
    const seen = new Set();
    const pool = [];
    for (const list of [torrents, ext]) {
      for (const t of (list || [])) {
        if (!t.infoHash || seen.has(t.infoHash)) continue;
        seen.add(t.infoHash);
        pool.push(t);
      }
    }
    const rdTagged = pool.filter((t) => t.rdCached).length;
    const ita = pool.filter((t) => t.italian || t.italianSub).length;
    // Chiamata IA batch 40 sui primi 40 hash
    const hashes = pool.slice(0, 40).map((t) => t.infoHash.toLowerCase());
    const tIA = Date.now();
    let iaStatus = '?', iaErr = null, iaCached = [], iaRawSample = null;
    try {
      const r = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/instantAvailability/${hashes.join('/')}`, {
        headers: { Authorization: `Bearer ${rdKey}` },
        timeout: 12000,
      });
      iaStatus = r.status;
      const txt = await r.text();
      iaRawSample = txt.slice(0, 200);
      const json = JSON.parse(txt);
      if (json && !json.error) {
        for (const h of hashes) {
          const e = json[h];
          if (e && Array.isArray(e.rd) && e.rd.length > 0) iaCached.push(h);
        }
      } else {
        iaErr = json.error || 'parse failed';
      }
    } catch (e) {
      iaErr = e.message;
    }
    const tIAms = Date.now() - tIA;
    return {
      query: { id, type, title: meta.title, season: meta.season, episode: meta.episode },
      pool: {
        total: pool.length,
        searchTorrents: (torrents || []).length,
        external: (ext || []).length,
        rdTagged_from_aggregators: rdTagged,
        ita: ita,
        fetch_ms: tPool,
      },
      ia: {
        endpoint: '/torrents/instantAvailability',
        http_status: iaStatus,
        time_ms: tIAms,
        tested_hashes: hashes.length,
        cached_count: iaCached.length,
        cached_hashes_first5: iaCached.slice(0, 5),
        error: iaErr,
        raw_response_first_200: iaRawSample,
      },
      verdict: iaCached.length >= 5
        ? `OK: IA funziona, trovati ${iaCached.length}/${hashes.length} cached`
        : iaCached.length > 0
        ? `LIMITATO: IA funziona ma cattura pochi (${iaCached.length}/${hashes.length})`
        : iaErr
        ? `ERRORE IA: ${iaErr}`
        : `IA DEAD: ${hashes.length} hash testati, 0 cached. Probabile che IA sia deprecato per il tuo account.`,
    };
  });
  res.json(result);
});

// Debug Corsaro: mostra cosa risponde ogni mirror per una query data
app.get('/debug/corsaro', async (req, res) => {
  const query = req.query.q || 'inception';
  const hosts = ['ilcorsaronero.link', 'ilcorsaronero.fans', 'ilcorsaronero.casino'];
  const results = [];
  for (const host of hosts) {
    const start = Date.now();
    try {
      const url = `https://${host}/argomenti/0/?search=${encodeURIComponent(query)}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        timeout: 8000,
      });
      const body = await r.text();
      // Cerco pattern hash candidati nel HTML
      const hashMatches = [...body.matchAll(/[a-fA-F0-9]{40}/g)].slice(0, 5).map((m) => m[0]);
      const linkMatches = [...body.matchAll(/href="(\/(?:details|tdetail)[^"]+)"/g)].slice(0, 3).map((m) => m[1]);
      const titleMatches = [...body.matchAll(/<a[^>]*href="\/(?:details|tdetail)[^"]+"[^>]*>([^<]+)/g)].slice(0, 3).map((m) => m[1].trim());
      results.push({
        host,
        time_ms: Date.now() - start,
        status: r.status,
        body_len: body.length,
        body_preview: body.slice(0, 300).replace(/\s+/g, ' '),
        hash_samples: hashMatches,
        link_samples: linkMatches,
        title_samples: titleMatches,
      });
    } catch (e) {
      results.push({ host, time_ms: Date.now() - start, error: e.message });
    }
  }
  res.json({ query, results });
});

// Root → /configure
// Welcome page con scelta lingua. Senza accept-language hint o se l'utente
// arriva senza preferenze, mostriamo la pagina con 2 bandiere. Backward compat:
// chi navigava direttamente a /configure (link salvati, bookmark) non è toccato.
app.get('/', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pezzottio · Choose language / Scegli lingua</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='1.8'%3E%3Crect x='2.5' y='5' width='19' height='13' rx='2.5'/%3E%3Cpath d='M8 21h8M9 18v3M15 18v3' stroke-linecap='round'/%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Bebas+Neue&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background:#000; color:#fff; }
    .brand { font-family: 'Bebas Neue', sans-serif; font-weight: 900; color:#e50914; letter-spacing:0.02em; text-shadow: 0 4px 24px rgba(229,9,20,0.4); }
    .bg-fx::before {
      content:''; position:fixed; inset:0; z-index:-1; pointer-events:none;
      background: radial-gradient(50% 60% at 30% 20%, rgba(229,9,20,0.18) 0%, transparent 60%),
                  radial-gradient(50% 60% at 70% 80%, rgba(229,9,20,0.10) 0%, transparent 60%);
      filter: blur(20px);
    }
    .flag-btn { transition: transform 0.2s, border-color 0.2s; }
    .flag-btn:hover { transform: translateY(-4px); border-color: rgba(229,9,20,0.5); }
  </style>
</head>
<body class="min-h-screen bg-fx flex items-center justify-center px-4">
  <main class="max-w-3xl w-full text-center">
    <h1 class="brand text-6xl md:text-8xl mb-4">PEZZOTTIO</h1>
    <p class="text-zinc-400 text-sm md:text-base mb-12 tracking-wide uppercase">Choose your language · Scegli la lingua</p>

    <div class="grid sm:grid-cols-2 gap-4 sm:gap-6 max-w-2xl mx-auto">
      <a href="/configure" class="flag-btn block rounded-xl border-2 border-white/10 bg-white/[0.03] p-8 hover:bg-white/[0.06] no-underline">
        <div class="text-7xl mb-4">🇮🇹</div>
        <div class="text-2xl font-bold text-white mb-2">Italiano</div>
        <div class="text-xs text-zinc-400 leading-relaxed">
          Stream HTTP italiani · Audio ITA prioritario · AnimeWorld, AnimeSaturn, GuardaSerie, StreamingCommunity
        </div>
      </a>
      <a href="/configure-en" class="flag-btn block rounded-xl border-2 border-white/10 bg-white/[0.03] p-8 hover:bg-white/[0.06] no-underline">
        <div class="text-7xl mb-4">🇺🇸</div>
        <div class="text-2xl font-bold text-white mb-2">English</div>
        <div class="text-xs text-zinc-400 leading-relaxed">
          HTTP streams · English audio priority · HiAnime, StreamingCommunity (EN track), full torrent coverage
        </div>
      </a>
    </div>

    <div class="text-[11px] text-zinc-600 mt-12">
      100% free · Open source · <a href="https://github.com/ceres777/pezzottio" target="_blank" rel="noopener" class="hover:text-zinc-400 transition">GitHub</a>
    </div>
  </main>
</body>
</html>`);
});

// === EXTRA CATALOG PROXY (/extra/*) ===
// Proxy completo verso un addon di metadata esterno preconfigurato.
// Lo serviamo sotto il nostro dominio con branding "Pezzottio Extra" così
// l'utente non vede il nome dell'addon upstream nel dialog Stremio.
// Solo manifest viene riscritto (id + name); catalog/meta/subtitles sono
// passthrough con caching aggressivo.
const EXTRA_UPSTREAM = process.env.EXTRA_CATALOG_UPSTREAM
  || 'https://aiometadata.elfhosted.com/stremio/3bfc4ec0-ef9d-4703-98ca-ab313631d178';
// Upstream EN: configurazione AIOMetadata separata (lingua/sources orientati EN).
// Lo serviamo sotto /extra-en/* con rebranding "Pezzottio Extra (English)".
const EXTRA_UPSTREAM_EN = process.env.EXTRA_CATALOG_UPSTREAM_EN
  || 'https://aiometadata.elfhosted.com/stremio/e06851f2-66a3-4cd7-afb9-b80c6a2c9f01';

function _extraTtl(path) {
  if (/manifest\.json$/.test(path)) return 5 * 60 * 1000;        // 5min
  if (/^\/meta\//.test(path)) return 6 * 60 * 60 * 1000;          // 6h
  if (/^\/catalog\//.test(path)) return 60 * 60 * 1000;           // 1h
  if (/^\/subtitles\//.test(path)) return 60 * 60 * 1000;         // 1h
  return 10 * 60 * 1000;                                          // default
}

// Factory: crea un proxy reusable per qualsiasi upstream AIOMetadata.
// `brand` definisce il rebranding del manifest (id/name/description).
function _createExtraProxy({ upstream, brand }) {
  const cache = new Map();
  async function fetchPath(subpath) {
    const ckey = subpath;
    const ttl = _extraTtl(subpath);
    const hit = cache.get(ckey);
    if (hit && Date.now() - hit.t < ttl) return hit;
    try {
      const r = await fetch(`${upstream}${subpath}`, {
        timeout: 8000,
        headers: { 'Accept': 'application/json', 'User-Agent': 'Pezzottio-Proxy/1.0' },
      });
      const body = await r.text();
      const entry = { body, status: r.status, t: Date.now() };
      if (r.ok) cache.set(ckey, entry);
      return entry;
    } catch (e) {
      console.error(`[${brand.id}]`, subpath, e.message);
      return { body: '{"err":"upstream"}', status: 502, t: Date.now() };
    }
  }
  return async (req, res) => {
    const subpath = (req.params[0] || '/').split('?')[0];
    // Manifest: rebrand
    if (subpath === '/manifest.json' || subpath === '/') {
      const r = await fetchPath('/manifest.json');
      if (r.status >= 400) return res.status(r.status).type('application/json').send(r.body);
      try {
        const m = JSON.parse(r.body);
        m.id = brand.id;
        m.name = brand.name;
        m.description = brand.description;
        m.logo = `${publicBase(req)}/logo.png`;
        if (m.behaviorHints) {
          delete m.behaviorHints.configurable;
          delete m.behaviorHints.configurationRequired;
        }
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'max-age=300, public');
        return res.send(JSON.stringify(m));
      } catch (e) {
        return res.status(502).json({ err: 'manifest parse failed' });
      }
    }
    // Tutto il resto: passthrough
    const r = await fetchPath(subpath);
    res.status(r.status || 200);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', `max-age=${Math.floor(_extraTtl(subpath) / 1000)}, public`);
    res.send(r.body);
  };
}

// /extra/* → catalogo IT (Netflix/Prime/Disney+/HBO/Apple TV+/Crunchyroll, descrizioni italiane)
app.get(/^\/extra(\/.*)?$/, _createExtraProxy({
  upstream: EXTRA_UPSTREAM,
  brand: {
    id: 'org.pezzottio.extracatalogs',
    name: 'Pezzottio Extra',
    description: 'Catalog Netflix, Prime Video, Disney+, HBO Max, Apple TV+, Crunchyroll integrato in Pezzottio.',
  },
}));

// /extra-en/* → catalogo EN (config AIOMetadata separata, lingua/source EN-oriented)
app.get(/^\/extra-en(\/.*)?$/, _createExtraProxy({
  upstream: EXTRA_UPSTREAM_EN,
  brand: {
    id: 'org.pezzottio.extracatalogs.en',
    name: 'Pezzottio Extra (English)',
    description: 'Netflix, Prime Video, Disney+, HBO Max, Apple TV+, Crunchyroll catalog — English edition integrated in Pezzottio.',
  },
}));

// Manifest dinamico: rimuove i cataloghi Pezzottio Anime se l'utente ha
// disabilitato l'anime nella sua config (httpAnime=false). Catalogo e stream
// HTTP anime vanno insieme — se uno è off, l'altro pure. Questo middleware
// deve girare PRIMA del SDK router (che serve il manifest statico).
app.get(/^\/manifest\.json$/, (req, res, next) => serveManifest(req, res, next));
function serveManifest(req, res) {
  try {
    const animeOff = req.userConfig?.httpAnime === false || req.userConfig?.httpAnime === 'false';
    // Clone shallow del manifest. Filtra catalogs se anime off.
    const m = { ...addonInterface.manifest };
    if (animeOff && Array.isArray(m.catalogs)) {
      m.catalogs = m.catalogs.filter((c) => !c.id.startsWith('pezzottio-anime-'));
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'max-age=300, public');
    res.send(JSON.stringify(m));
  } catch (e) {
    console.error('[manifest]', e.message);
    res.status(500).send('manifest error');
  }
}

// Tutto il resto va all'SDK router, dentro un contesto ALS con la config dell'utente.
const sdkRouter = getRouter(addonInterface);
app.use((req, res, next) => {
  // publicHost derivato dalla request (Host/X-Forwarded-Host) viene passato
  // come 3° arg separato a runWithConfig — così non finisce in encodeConfig(user)
  // e ogni richiesta vede l'host del suo dominio di ingresso senza propagarlo
  // nei link emessi (cfgB64 resta pulito = solo {tb, rd, order, ...}).
  runWithConfig(req.userConfig || {}, () => sdkRouter(req, res, next), publicBase(req));
});

const c = getConfig();
app.listen(c.port, c.host, () => {
  console.log(`Pezzottio listening on http://${c.host}:${c.port}`);
  console.log(`Configure: http://${c.host}:${c.port}/configure`);
});
