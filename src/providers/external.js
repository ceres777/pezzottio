// External Stremio addon aggregator.
//
// Chiama upstream addon Stremio (Torrentio + proxy community IT) e normalizza
// i loro risultati nel formato torrent interno.
//
// Perché serve: ilCorsaroNero, MejorTorrent, BluDV ecc. sono protetti da CF e
// non si possono scrapare da datacenter cloud. Torrentio / MediaFusion / Comet
// li hanno già indicizzati. Chiamando questi upstream "rubiamo" i loro risultati.
//
// torrentio.strem.fun BLOCCA IP cloud (verificato su Render). I proxy community
// (mediafusionfortheweebs, comet.feels.legal) sono accessibili da ovunque e
// hanno filtro language=ita pre-bakeato.

const fetch = require('node-fetch');
const { parseQuality, isItalian, hasItalianSub } = require('../parse');
const { getConfig } = require('../config');

// === INIEZIONE CHIAVE RD NEGLI AGGREGATOR ===
// Gli aggregator esterni sanno fare il check cached-on-RD se gli passi la
// chiave. Lo facciamo dinamicamente per /stream così Pezzottio non deve più
// chiamare RD /torrents/instantAvailability (deprecato 403).
// Pattern noti:
//   - Torrentio: appende '|realdebrid=KEY' al path config
//   - Comet: campo `debridServices: [{service, apiKey, hosts}]` nel JSON base64
//   - StremThru: campo `stores: [{c, t}]` nel JSON base64 (c='rd')
//   - MediaFusion: payload Fernet-encrypted → POST /encrypt-user-data per
//     ottenere il token cifrato dalla nostra config

// Cache token MediaFusion encrypted per (chiave RD + lang) (TTL 24h).
// Lang nel key è critico: token con language_sorting:['Italian','English']
// è diverso da ['English','Italian']. Senza, utenti EN ricevono filtro IT.
const _mfTokenCache = new Map();
const _MF_TTL = 24 * 60 * 60 * 1000;
async function _getMediaFusionToken(rdKey) {
  let lang = 'it';
  try { lang = getConfig().lang || 'it'; } catch (_) {}
  const cacheKey = `${rdKey}:${lang}`;
  const cached = _mfTokenCache.get(cacheKey);
  if (cached && Date.now() - cached.t < _MF_TTL) return cached.v;
  const host = (process.env.MEDIAFUSION_HOST || 'https://mediafusionfortheweebs.midnightignite.me').replace(/\/$/, '');
  // Lang-aware sorting: utente IT vuole IT in cima, utente EN vuole EN in cima.
  const languageSorting = lang === 'en'
    ? ['English', 'Italian']
    : ['Italian', 'English'];
  const userData = {
    streaming_provider: { service: 'realdebrid', token: rdKey, enable_watchlist_catalogs: false },
    selected_catalogs: [],
    selected_resolutions: ['4K', '2160p', '1440p', '1080p', '720p', '480p'],
    enable_catalogs: false,
    enable_imdb_metadata: false,
    max_streams_per_resolution: 50,
    torrent_sorting_priority: [
      { key: 'cached', direction: 'desc' },
      { key: 'resolution', direction: 'desc' },
      { key: 'size', direction: 'desc' },
      { key: 'seeders', direction: 'desc' },
    ],
    language_sorting: languageSorting,
    quality_filter: ['CAM'],
    show_full_torrent_name: true,
    mediaflow_config: null,
    rpdb_config: null,
    live_search_streams: true,
    contribution_streams: false,
    api_password: null,
  };
  try {
    // Timeout 5s (era 3s): la prima call cold dopo pm2 restart può tardare.
    const r = await fetch(`${host}/encrypt-user-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_data: userData }),
      timeout: 5000,
    });
    if (!r.ok) {
      console.error(`[external] MediaFusion encrypt-user-data ${r.status}`);
      return null;
    }
    const j = await r.json();
    const token = j?.encrypted_str || j?.data || j?.user_data || null;
    if (!token) {
      console.error('[external] MediaFusion encrypt-user-data no token in response');
      return null;
    }
    _mfTokenCache.set(cacheKey, { v: token, t: Date.now() });
    console.log(`[external] MediaFusion token caricato per chiave RD ${rdKey.slice(0, 6)}... lang=${lang}`);
    return token;
  } catch (e) {
    console.error('[external] MediaFusion encrypt-user-data err:', e.message);
    return null;
  }
}

async function _buildBaseUrl(addon, rdKey) {
  // Lang switch per-request:
  // - Torrentio: rimuovo |language=italian quando lang='en'
  // - Comet / StremThru / Meteor: swap a baseUrlEN (config encoded che
  //   filtra "en" invece di "it" — necessario perché le loro config B64
  //   includono required/exclude language hard-coded).
  // Backward compat: lang='it' default → tutto invariato per utenti IT.
  let baseUrl = addon.baseUrl;
  try {
    const lang = getConfig().lang;
    if (lang === 'en') {
      if (addon.key === 'torrentio') {
        baseUrl = baseUrl.replace(/\|language=italian/g, '');
      } else if (addon.baseUrlEN) {
        baseUrl = addon.baseUrlEN;
      }
    }
  } catch (_) { /* getConfig non chiamato in test runtime — fallback safe */ }
  if (!rdKey) return baseUrl;
  try {
    if (addon.key === 'torrentio') {
      // Se il baseUrl è un proxy AIOStreams (contiene /stremio/ con UUID),
      // la chiave RD è già incorporata nel config-token. NON appendere
      // |realdebrid= che romperebbe il routing del proxy.
      // Uso `baseUrl` (eventualmente lang-patched senza language=italian) e
      // non `addon.baseUrl` (raw), così EN funziona anche con RD attivo.
      if (/\/stremio\/[0-9a-f-]{36}\//i.test(baseUrl)) {
        return baseUrl;
      }
      return `${baseUrl}|realdebrid=${rdKey}`;
    }
    if (addon.key === 'comet') {
      // Uso `baseUrl` (lang-aware: IT o EN) per estrarre+riencodare il config.
      const m = baseUrl.match(/^(https?:\/\/[^/]+\/)([^/]+)$/);
      if (!m) return baseUrl;
      const cfg = JSON.parse(Buffer.from(m[2], 'base64').toString('utf8'));
      cfg.debridServices = [{ service: 'realdebrid', apiKey: rdKey, hosts: [] }];
      const newB64 = Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64');
      return m[1] + newB64;
    }
    if (addon.key === 'stremthru') {
      const m = baseUrl.match(/^(.+\/torz\/)([^/]+)$/);
      if (!m) return baseUrl;
      const cfg = JSON.parse(Buffer.from(m[2], 'base64').toString('utf8'));
      cfg.stores = [{ c: 'rd', t: rdKey }];
      const newB64 = Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64');
      return m[1] + newB64;
    }
    if (addon.key === 'mediafusion') {
      const token = await _getMediaFusionToken(rdKey);
      if (!token) return baseUrl; // fallback torrent-only
      const host = (process.env.MEDIAFUSION_HOST || 'https://mediafusionfortheweebs.midnightignite.me').replace(/\/$/, '');
      return `${host}/${token}`;
    }
    if (addon.key === 'meteor') {
      // Il config base64 ha "debridService":"torrent" e "debridApiKey":"" →
      // restituisce stream torrent-only, nessun tag [RD+]. Sovrascrivo con
      // la chiave RD utente così Meteor pre-filtra i cached server-side.
      const m = baseUrl.match(/^(.+\/)([^/]+)$/);
      if (!m) return baseUrl;
      const cfg = JSON.parse(Buffer.from(m[2], 'base64').toString('utf8'));
      cfg.debridService = 'realdebrid';
      cfg.debridApiKey = rdKey;
      cfg.cachedOnly = false; // mostra anche uncached, ma con priorità ai cached
      const newB64 = Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64');
      return m[1] + newB64;
    }
  } catch (e) {
    console.error(`[external] inject RD key err ${addon.key}:`, e.message);
  }
  return addon.baseUrl;
}

// === ADDON UPSTREAM ===
// `assumeItalian`: l'upstream filtra già per language=ITA required.
// Possiamo assumere che ogni risultato abbia almeno sub ITA (lo flagghiamo
// se la detection esplicita fallisce — non vogliamo falsi positivi negativi).
const EXTERNAL_ADDONS = [
  {
    key: 'torrentio',
    label: 'Torrentio',
    baseUrl: process.env.TORRENTIO_URL || 'https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,nyaasi,tokyotosho,anidex,rutor,rutracker,comando,bludv,torrent9,ilcorsaronero,mejortorrent,wolfmax4k,cinecalidad,besttorrents|language=italian|qualityfilter=scr,cam',
    // 10s: Torrentio dietro proxy AIOStreams ha latenze >5s su titoli con
    // pool grande (Grey's Anatomy ~24 stream, One Piece ~30). Con cap 5s
    // andava sempre in timeout → breaker aperto 5min → -50% pool ITA.
    timeout: 3000,
    breakerThreshold: 3, // default: 3 errori consecutivi prima di sospendere
    assumeItalian: true,
    enabled: true,
  },
  // Community IT-aware proxy — URL pubblici hardcoded.
  // Sovrascrivibili via env var se cambiano endpoint.
  {
    key: 'mediafusion',
    label: 'MediaFusion',
    baseUrl: process.env.MEDIAFUSION_URL || 'https://mediafusionfortheweebs.midnightignite.me/D--MuTCQ99t0sh23nd3nx2xZCCqMkr4MPwy5I9suo3Ej2tUYTqimnxZBJ34hbNRwoL5AIvPt4N8KPnl50LWHT5YLDcrwnX_dhOq3vHO0aCNKBlnXeki7olZAUDoHepPCTDFLFtZVcZcohYRa83aT2Vbig3W5Qz3qErPqw2Zdb676ioZa452Mb35T0IX-ftQcNF0oGJerUTZhfvv9w4wrEIiW8wx0jdSxAfcrnM6yKFEcYMP-3dRWYAL2wy13Gcvwr2j4ax2z6TQ35xlcW9WWsKjA',
    timeout: 3000,
    assumeItalian: true,
    enabled: true,
  },
  {
    key: 'comet',
    label: 'Comet',
    baseUrl: process.env.COMET_URL || 'https://comet.feels.legal/eyJtYXhSZXN1bHRzUGVyUmVzb2x1dGlvbiI6MCwibWF4U2l6ZSI6MCwiY2FjaGVkT25seSI6ZmFsc2UsInNvcnRDYWNoZWRVbmNhY2hlZFRvZ2V0aGVyIjpmYWxzZSwicmVtb3ZlVHJhc2giOnRydWUsInJlc3VsdEZvcm1hdCI6WyJhbGwiXSwiZGVicmlkU2VydmljZXMiOltdLCJlbmFibGVUb3JyZW50Ijp0cnVlLCJkZWR1cGxpY2F0ZVN0cmVhbXMiOmZhbHNlLCJzY3JhcGVEZWJyaWRBY2NvdW50VG9ycmVudHMiOmZhbHNlLCJkZWJyaWRTdHJlYW1Qcm94eVBhc3N3b3JkIjoiIiwibGFuZ3VhZ2VzIjp7InJlcXVpcmVkIjpbIml0Il0sImFsbG93ZWQiOlsibXVsdGkiLCJpdCJdLCJleGNsdWRlIjpbImVuIiwiamEiLCJ6aCIsInJ1IiwiYXIiLCJwdCIsImVzIiwiZnIiLCJkZSIsImtvIiwiaGkiLCJibiIsInBhIiwibXIiLCJndSIsInRhIiwidGUiLCJrbiIsIm1sIiwidGgiLCJ2aSIsImlkIiwidHIiLCJoZSIsImZhIiwidWsiLCJlbCIsImx0IiwibHYiLCJldCIsInBsIiwiY3MiLCJzayIsImh1Iiwicm8iLCJiZyIsInNyIiwiaHIiLCJzbCIsIm5sIiwiZGEiLCJmaSIsInN2Iiwibm8iLCJtcyIsImxhIl0sInByZWZlcnJlZCI6WyJpdCJdfSwicmVzb2x1dGlvbnMiOnsicjI0MHAiOmZhbHNlfSwib3B0aW9ucyI6eyJyZW1vdmVfcmFua3NfdW5kZXIiOi0xMDAwMDAwMDAwLCJhbGxvd19lbmdsaXNoX2luX2xhbmd1YWdlcyI6ZmFsc2UsInJlbW92ZV91bmtub3duX2xhbmd1YWdlcyI6ZmFsc2V9fQ==',
    // Lang switch EN: required:[en], allowed:[multi,en], exclude:[it,ja,...], preferred:[en].
    // Usato solo se getConfig().lang === 'en' (vedi _buildBaseUrl).
    baseUrlEN: process.env.COMET_URL_EN || 'https://comet.feels.legal/eyJtYXhSZXN1bHRzUGVyUmVzb2x1dGlvbiI6MCwibWF4U2l6ZSI6MCwiY2FjaGVkT25seSI6ZmFsc2UsInNvcnRDYWNoZWRVbmNhY2hlZFRvZ2V0aGVyIjpmYWxzZSwicmVtb3ZlVHJhc2giOnRydWUsInJlc3VsdEZvcm1hdCI6WyJhbGwiXSwiZGVicmlkU2VydmljZXMiOltdLCJlbmFibGVUb3JyZW50Ijp0cnVlLCJkZWR1cGxpY2F0ZVN0cmVhbXMiOmZhbHNlLCJzY3JhcGVEZWJyaWRBY2NvdW50VG9ycmVudHMiOmZhbHNlLCJkZWJyaWRTdHJlYW1Qcm94eVBhc3N3b3JkIjoiIiwibGFuZ3VhZ2VzIjp7InJlcXVpcmVkIjpbImVuIl0sImFsbG93ZWQiOlsibXVsdGkiLCJlbiJdLCJleGNsdWRlIjpbIml0IiwiamEiLCJ6aCIsInJ1IiwiYXIiLCJwdCIsImVzIiwiZnIiLCJkZSIsImtvIiwiaGkiLCJibiIsInBhIiwibXIiLCJndSIsInRhIiwidGUiLCJrbiIsIm1sIiwidGgiLCJ2aSIsImlkIiwidHIiLCJoZSIsImZhIiwidWsiLCJlbCIsImx0IiwibHYiLCJldCIsInBsIiwiY3MiLCJzayIsImh1Iiwicm8iLCJiZyIsInNyIiwiaHIiLCJzbCIsIm5sIiwiZGEiLCJmaSIsInN2Iiwibm8iLCJtcyIsImxhIl0sInByZWZlcnJlZCI6WyJlbiJdfSwicmVzb2x1dGlvbnMiOnsicjI0MHAiOmZhbHNlfSwib3B0aW9ucyI6eyJyZW1vdmVfcmFua3NfdW5kZXIiOi0xMDAwMDAwMDAwLCJhbGxvd19lbmdsaXNoX2luX2xhbmd1YWdlcyI6dHJ1ZSwicmVtb3ZlX3Vua25vd25fbGFuZ3VhZ2VzIjpmYWxzZX19',
    timeout: 3000,
    assumeItalian: true,
    enabled: true,
  },
  {
    key: 'stremthru',
    label: 'StremThru',
    baseUrl: process.env.STREMTHRU_URL || 'https://stremthru.13377001.xyz/stremio/torz/eyJpbmRleGVycyI6bnVsbCwic3RvcmVzIjpbeyJjIjoicDJwIiwidCI6IiJ9XSwiZmlsdGVyIjoiXCJpdFwiIGluIExhbmd1YWdlcyBcdTAwMjZcdTAwMjYgUXVhbGl0eSAhPSBcIkNBTVwiIn0=',
    // Lang switch EN: filter = "en" in Languages && Quality != CAM.
    // Nota 1: && (escape Unicode) invece di && letterale.
    // Nota 2: padding "=" finale OBBLIGATORIO — StremThru rifiuta urlsafe
    // b64 senza padding con "illegal base64 data at input byte N" → HTTP 500.
    baseUrlEN: process.env.STREMTHRU_URL_EN || 'https://stremthru.13377001.xyz/stremio/torz/eyJpbmRleGVycyI6bnVsbCwic3RvcmVzIjpbeyJjIjoicDJwIiwidCI6IiJ9XSwiZmlsdGVyIjoiXCJlblwiIGluIExhbmd1YWdlcyBcdTAwMjZcdTAwMjYgUXVhbGl0eSAhPSBcIkNBTVwiIn0=',
    timeout: 3000,
    assumeItalian: true,
    enabled: true,
  },
  {
    key: 'meteor',
    label: 'Meteor',
    baseUrl: process.env.METEOR_URL || 'https://meteorfortheweebs.midnightignite.me/eyJkZWJyaWRTZXJ2aWNlIjoidG9ycmVudCIsImRlYnJpZEFwaUtleSI6IiIsImNhY2hlZE9ubHkiOnRydWUsImVuYWJsZVlvdXJNZWRpYSI6ZmFsc2UsInlvdXJNZWRpYUxlZ2FjeU1vZGUiOmZhbHNlLCJzaG93WW91ck1lZGlhU3RyZWFtcyI6ZmFsc2UsInlvdXJNZWRpYVNvdXJjZXMiOlsidG9ycmVudCJdLCJyZW1vdmVUcmFzaCI6ZmFsc2UsInJlbW92ZVNhbXBsZXMiOmZhbHNlLCJyZW1vdmVBZHVsdCI6ZmFsc2UsImV4Y2x1ZGUzRCI6ZmFsc2UsImVuYWJsZVNlYURleCI6ZmFsc2UsImVuYWJsZVVzZW5ldCI6ZmFsc2UsInVzZW5ldEN1c3RvbUVuZ2luZXMiOmZhbHNlLCJtaW5TZWVkZXJzIjowLCJtYXhSZXN1bHRzIjowLCJtYXhSZXN1bHRzUGVyUmVzIjowLCJtYXhTaXplIjowLCJyZXNvbHV0aW9ucyI6W10sImxhbmd1YWdlcyI6eyJwcmVmZXJyZWQiOlsibXVsdGkiLCJpdCJdLCJyZXF1aXJlZCI6WyJpdCIsIm11bHRpIl0sImV4Y2x1ZGUiOltdfSwicmVzdWx0Rm9ybWF0IjpbInRpdGxlIiwicXVhbGl0eSIsInNpemUiLCJhdWRpbyJdLCJzb3J0T3JkZXIiOlsicGFjayIsImNhY2hlZCIsInlvdXJtZWRpYSIsInNlYWRleCIsInJlc29sdXRpb24iLCJzaXplIiwicXVhbGl0eSIsInNlZWRlcnMiLCJsYW5ndWFnZSIsInR5cGUiXX0',
    // Lang switch EN: preferred:[multi,en], required:[en,multi].
    baseUrlEN: process.env.METEOR_URL_EN || 'https://meteorfortheweebs.midnightignite.me/eyJkZWJyaWRTZXJ2aWNlIjoidG9ycmVudCIsImRlYnJpZEFwaUtleSI6IiIsImNhY2hlZE9ubHkiOnRydWUsImVuYWJsZVlvdXJNZWRpYSI6ZmFsc2UsInlvdXJNZWRpYUxlZ2FjeU1vZGUiOmZhbHNlLCJzaG93WW91ck1lZGlhU3RyZWFtcyI6ZmFsc2UsInlvdXJNZWRpYVNvdXJjZXMiOlsidG9ycmVudCJdLCJyZW1vdmVUcmFzaCI6ZmFsc2UsInJlbW92ZVNhbXBsZXMiOmZhbHNlLCJyZW1vdmVBZHVsdCI6ZmFsc2UsImV4Y2x1ZGUzRCI6ZmFsc2UsImVuYWJsZVNlYURleCI6ZmFsc2UsImVuYWJsZVVzZW5ldCI6ZmFsc2UsInVzZW5ldEN1c3RvbUVuZ2luZXMiOmZhbHNlLCJtaW5TZWVkZXJzIjowLCJtYXhSZXN1bHRzIjowLCJtYXhSZXN1bHRzUGVyUmVzIjowLCJtYXhTaXplIjowLCJyZXNvbHV0aW9ucyI6W10sImxhbmd1YWdlcyI6eyJwcmVmZXJyZWQiOlsibXVsdGkiLCJlbiJdLCJyZXF1aXJlZCI6WyJlbiIsIm11bHRpIl0sImV4Y2x1ZGUiOltdfSwicmVzdWx0Rm9ybWF0IjpbInRpdGxlIiwicXVhbGl0eSIsInNpemUiLCJhdWRpbyJdLCJzb3J0T3JkZXIiOlsicGFjayIsImNhY2hlZCIsInlvdXJtZWRpYSIsInNlYWRleCIsInJlc29sdXRpb24iLCJzaXplIiwicXVhbGl0eSIsInNlZWRlcnMiLCJsYW5ndWFnZSIsInR5cGUiXX0',
    timeout: 3000,
    assumeItalian: true,
    enabled: true,
  },
];

// === PROTEZIONE: cache + circuit breaker + in-flight dedup ===
// TTL 30 min (era 10): con 300 utenti che cercano gli stessi titoli popolari,
// triplichiamo la finestra di cache hit → ~3x meno hit upstream → meno 429.
const CACHE_TTL = 30 * 60 * 1000;
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN = 5 * 60 * 1000;
// 429 (rate limit) è cooldown immediato e più lungo: l'upstream ci sta dicendo
// "fermati subito o ti blocco di più". 10 min e 1 errore basta per attivarlo.
const RATELIMIT_COOLDOWN = 10 * 60 * 1000;

const _cache = new Map();
const _breaker = new Map();
const _inFlight = new Map();
const _stats = new Map();

function _bump(key, field) {
  const s = _stats.get(key) || { fetched: 0, hit: 0, miss: 0, err: 0, blocked: 0, dedup: 0 };
  s[field]++;
  _stats.set(key, s);
}
function _isBlocked(key) {
  const b = _breaker.get(key);
  return b && b.until > Date.now();
}
function _recordError(key, label, customThreshold) {
  const b = _breaker.get(key) || { errors: 0, until: 0 };
  b.errors++;
  const threshold = customThreshold || BREAKER_THRESHOLD;
  if (b.errors >= threshold) {
    b.until = Date.now() + BREAKER_COOLDOWN;
    b.errors = 0;
    console.error(`[external] ${label} circuit breaker OPEN (5min)`);
  }
  _breaker.set(key, b);
  _bump(key, 'err');
}
function _recordSuccess(key) {
  const b = _breaker.get(key);
  if (b) b.errors = 0;
}

function getStats() {
  const out = {};
  for (const [k, v] of _stats.entries()) out[k] = { ...v };
  return out;
}

async function _fetchAddon(addon, type, id) {
  if (!addon.enabled || !addon.baseUrl) return [];
  if (_isBlocked(addon.key)) { _bump(addon.key, 'blocked'); return []; }
  // Cache key include la chiave RD: utenti diversi vedono risultati diversi
  // (i loro cached). Trunco a 8 char per evitare chiavi gigantesche.
  const rdKey = (getConfig().realdebridKey || '').slice(0, 8);
  const cacheKey = `${addon.key}:${rdKey}:${type}:${id}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_TTL) { _bump(addon.key, 'hit'); return hit.v; }

  const inFlight = _inFlight.get(cacheKey);
  if (inFlight) { _bump(addon.key, 'dedup'); return inFlight; }

  _bump(addon.key, 'miss');
  _bump(addon.key, 'fetched');

  const promise = (async () => {
    try {
      const baseUrl = await _buildBaseUrl(addon, getConfig().realdebridKey);
      const url = `${baseUrl}/stream/${type}/${id}.json`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), addon.timeout);
      const t0 = Date.now();
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Pezzottio/0.1 (Stremio Addon)',
          'Accept': 'application/json',
        },
      });
      clearTimeout(timeoutId);
      const ms = Date.now() - t0;
      if (!res.ok) {
        // 429 = rate limit → cooldown immediato 10min (no soglia 3 errori).
        // Continuare a sbattere genera blacklist più dure.
        if (res.status === 429) {
          _breaker.set(addon.key, { errors: 0, until: Date.now() + RATELIMIT_COOLDOWN });
          _bump(addon.key, 'err');
          console.error(`[external] ${addon.label} ${type}/${id} → 429 — cooldown 10min`);
        } else {
          _recordError(addon.key, addon.label, addon.breakerThreshold);
          console.error(`[external] ${addon.label} ${type}/${id} → ${res.status} (${ms}ms)`);
        }
        return [];
      }
      _recordSuccess(addon.key);
      const data = await res.json();
      const streams = data?.streams || [];
      const rdPlus = streams.filter((s) => /\[RD\+\]/i.test(s.name || '')).length;
      const rdPlusTag = rdPlus ? ` [RD+]=${rdPlus}` : '';
      console.log(`[external] ${addon.label} ${type}/${id} → ${streams.length} stream (${ms}ms)${rdPlusTag}`);
      _cache.set(cacheKey, { v: streams, t: Date.now() });
      return streams;
    } catch (e) {
      _recordError(addon.key, addon.label);
      console.error(`[external] ${addon.label} ${type}/${id} ERR:`, e.name === 'AbortError' ? 'timeout' : e.message);
      return [];
    } finally {
      _inFlight.delete(cacheKey);
    }
  })();

  _inFlight.set(cacheKey, promise);
  return promise;
}

// Bandiera 🇮🇹 (regional indicator IT) = 2 codepoint U+1F1EE U+1F1F9
const FLAG_ITA = /🇮🇹/;

function _bytesToSize(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let n = Number(bytes);
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 ? 2 : 1)} ${units[i]}`;
}

// Normalizza uno stream upstream nel formato torrent interno.
function _normalize(s, addon) {
  // 1) infoHash: campo diretto, estratto dal magnet URL, o da URL "playback"
  //    degli aggregator con chiave debrid configurata.
  //    Pattern noti:
  //      - magnet:?xt=urn:btih:HASH
  //      - Torrentio: /resolve/<service>/<key>/HASH/
  //      - Comet:     /playback/HASH/0/3/3/4
  //      - StremThru: /_/strem/<imdb>/rd/HASH
  //    Regex generica: hash 40hex preceduto da '/' e seguito da '/?#$'.
  let infoHash = s.infoHash;
  if (!infoHash && s.url) {
    const m = s.url.match(/btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i)
      || s.url.match(/\/([a-fA-F0-9]{40})(?:[/?#]|$)/);
    if (m) infoHash = m[1];
  }
  if (!infoHash) return null;
  infoHash = String(infoHash).toLowerCase();

  // 2) Testo "completo" per analisi
  const filename = s.behaviorHints?.filename || '';
  const text = `${s.title || ''} ${s.name || ''} ${s.description || ''} ${filename}`;

  // 3) Titolo user-friendly: il nome del TORRENT (non del file interno).
  // Torrentio: `title` = "Nome.Torrent\nFile.mkv\n👤 60 💾 4GB\n🇮🇹". Prendo riga 1.
  // MediaFusion/Comet: `name` è brand ("[TORRENT] Comet 1080p"), `description` ha
  // emoji + filename. Filename rappresenta il file specifico, non il torrent.
  // Strategia: prima riga del `title` se contiene info reali (non solo brand),
  // altrimenti filename.
  function firstUsefulLine(txt) {
    if (!txt) return null;
    return txt.split('\n').map((l) => l.replace(/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu, '').trim()).find((l) => l && l.length > 2);
  }
  let firstLine = firstUsefulLine(s.title)
    || firstUsefulLine(s.description)
    || filename
    || s.name || 'Unknown';
  firstLine = firstLine.trim();

  // 4) Size: behaviorHints.videoSize è il più affidabile
  let sizeText = null;
  if (s.behaviorHints?.videoSize) {
    sizeText = _bytesToSize(s.behaviorHints.videoSize);
  } else {
    const sizeMatch = text.match(/(?:💾|📦|📁|📦|Size:?)\s*([\d.,]+)\s*(B|KB|MB|GB|TB)/i);
    if (sizeMatch) sizeText = `${sizeMatch[1]} ${sizeMatch[2]}`;
  }

  // 5) Seeders
  const seedMatch = text.match(/👤\s*(\d+)|[Ss]eeders?:?\s*(\d+)|⏳\s*(\d+)/);
  const seeds = seedMatch ? parseInt(seedMatch[1] || seedMatch[2] || seedMatch[3], 10) || 0 : 0;

  // 6) Trackers (magnet URL)
  const trackers = [];
  if (s.url) {
    const trMatches = [...s.url.matchAll(/tr=([^&]+)/g)];
    for (const m of trMatches) trackers.push(decodeURIComponent(m[1]));
  }
  // Trackers fallback se l'upstream non ne ha forniti (necessari per costruire
  // un magnet valido che RD accetta in addMagnet).
  if (!trackers.length) {
    trackers.push(
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://exodus.desync.com:6969/announce',
    );
  }

  // 7) Italian detection: emoji 🇮🇹 nel testo, marker ITA, oppure assumeItalian dell'upstream
  const hasFlagIta = FLAG_ITA.test(text);
  const explicitIta = isItalian(text);
  const explicitSub = hasItalianSub(text);

  let italian = explicitIta || hasFlagIta;
  let italianSub = explicitSub;
  // NB: il vecchio comportamento marcava italianSub=true se l'upstream era
  // filtrato language=italian ma senza match esplicito nel nome. Causava
  // troppi falsi positivi (gli aggregator taggano male, es. release upscale
  // R&H, gruppi russi Wild_Cat, ecc.). Adesso il badge SUB ITA appare SOLO
  // su match esplicito (Sub Ita / language list con ita / source NF/AMZN
  // WEB-DL). Gli stream restano comunque in lista, solo senza badge.

  // Costruisco SEMPRE un magnet valido dall'infoHash. Senza magnet RD fa
  // immediate-return null in addMagnet() e l'utente vede 0 risultati.
  // (TB non ha questo problema perché checkCachedBatch usa solo infoHash).
  let magnet = s.url && s.url.startsWith('magnet:') ? s.url : null;
  if (!magnet) {
    const trParts = trackers.map((t) => `&tr=${encodeURIComponent(t)}`).join('');
    const dn = firstLine ? `&dn=${encodeURIComponent(firstLine)}` : '';
    magnet = `magnet:?xt=urn:btih:${infoHash}${dn}${trParts}`;
  }

  // Cached-on-RD detection: pattern variabili tra aggregator
  //  - Torrentio: "[RD+]" cached, "[RD download]" non cached
  //  - Comet: "[RD⚡]" cached, "[❌]" errore
  //  - StremThru: "[RD]" cached, "[P2P]" torrent-only
  // Match [RD] seguito da 0+ caratteri non-spazio prima del ]. Esclude
  // "[RD download]" che ha uno spazio.
  const rdCached = /\[RD[^\s\]]*\]/i.test(text);

  return {
    title: `${firstLine} [${addon.label}]`,
    infoHash,
    magnet,
    seeds,
    peers: 0,
    sizeText,
    quality: parseQuality(text),
    trackers,
    provider: addon.label,
    italian,
    italianSub,
    filename: filename || null,
    rdCached,
  };
}

async function searchExternal(type, fullStremioId) {
  if (!fullStremioId) return [];
  const enabled = EXTERNAL_ADDONS.filter((a) => a.enabled && a.baseUrl);
  if (!enabled.length) return [];

  const buckets = await Promise.all(
    enabled.map((addon) => _fetchAddon(addon, type, fullStremioId))
  );
  const out = [];
  for (let i = 0; i < enabled.length; i++) {
    const addon = enabled[i];
    for (const s of buckets[i]) {
      const norm = _normalize(s, addon);
      if (norm) out.push(norm);
    }
  }
  return out;
}

module.exports = { searchExternal, getStats, EXTERNAL_ADDONS, _buildBaseUrl };
