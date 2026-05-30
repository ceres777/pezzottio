// RealDebrid integration v2 — affidabilità 100% sui cached.
//
// Filosofia:
//   - Niente "blind trust" sui tag aggregator (Comet [RD⚡], StremThru [RD]).
//     Sono dati stale e producono falsi positivi che fanno "loading failed".
//   - Solo 2 fonti garantite al 100%:
//       1. mylist (torrents nell'account utente con status='downloaded')
//       2. verify foreground (addMagnet+getInfo+delete real-time)
//   - gcache locale (mappa hash → cached:true|false) popolata SOLO da:
//       - verify foreground positive
//       - /play successo (unrestrict OK)
//       - 451 infringing (negative)
//   - Background enrichment opzionale dopo response, alimenta gcache per
//     prossime visite (dello stesso o altro utente sullo stesso server).

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../config');
const { findFileForEpisode } = require('../parse');

const API = 'https://api.real-debrid.com/rest/1.0';
const VIDEO_RE = /\.(mkv|mp4|avi|mov|webm|m4v|ts|wmv|flv|m2ts|mpeg|mpg)$/i;

// ─────────────────────────────────────────────────────────────────────
// Rate limiter (token bucket): 3 req/s steady-state, burst 6.
// RD documenta 250 req/min ma fa burst limiting (~15 req/3s → 429).
// ─────────────────────────────────────────────────────────────────────
const _bucket = { capacity: 6, tokens: 6, refillRate: 3, lastRefill: Date.now() };
async function _acquireToken() {
  while (true) {
    const now = Date.now();
    const elapsed = (now - _bucket.lastRefill) / 1000;
    if (elapsed > 0) {
      _bucket.tokens = Math.min(_bucket.capacity, _bucket.tokens + elapsed * _bucket.refillRate);
      _bucket.lastRefill = now;
    }
    if (_bucket.tokens >= 1) { _bucket.tokens -= 1; return; }
    const waitMs = Math.ceil(((1 - _bucket.tokens) / _bucket.refillRate) * 1000);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

let _rd429 = 0;
async function rdFetch(url, opts = {}, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    await _acquireToken();
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        _rd429++;
        if (i < retries) {
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
          continue;
        }
        console.error(`[RD] 429 RATE LIMITED (total ${_rd429}) ${url}`);
      }
      return res;
    } catch (e) {
      if (i >= retries) return { ok: false, status: 0, _err: e.message };
    }
  }
}

function headers() {
  return {
    Authorization: `Bearer ${getConfig().realdebridKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

// addMagnet ha un rate limit RD più stretto (~1 ogni 1.5-2s).
// Bucket dedicato + serializzazione: 1 chiamata ogni 1.5s (= 40/min, sotto soglia).
let _lastAddMagnet = 0;
let _addMagnetLock = Promise.resolve();
async function addMagnet(magnet) {
  const job = _addMagnetLock.then(async () => {
    const sinceLast = Date.now() - _lastAddMagnet;
    if (sinceLast < 1500) {
      await new Promise((r) => setTimeout(r, 1500 - sinceLast));
    }
    _lastAddMagnet = Date.now();
    const res = await rdFetch(`${API}/torrents/addMagnet`, {
      method: 'POST', headers: headers(),
      body: `magnet=${encodeURIComponent(magnet)}`,
    });
    if (!res.ok) {
      const err = new Error(`addMagnet ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  });
  _addMagnetLock = job.catch(() => undefined);
  return job;
}

async function selectAll(id) {
  await rdFetch(`${API}/torrents/selectFiles/${id}`, {
    method: 'POST', headers: headers(), body: 'files=all',
  });
}

async function getInfo(id) {
  const res = await rdFetch(`${API}/torrents/info/${id}`, { headers: headers() });
  if (!res.ok) throw new Error(`info ${res.status}`);
  return res.json();
}

async function deleteTorrent(id) {
  try {
    await rdFetch(`${API}/torrents/delete/${id}`, { method: 'DELETE', headers: headers() });
  } catch (_) { /* fire-and-forget */ }
}

async function unrestrict(link) {
  const res = await rdFetch(`${API}/unrestrict/link`, {
    method: 'POST', headers: headers(),
    body: `link=${encodeURIComponent(link)}`,
  });
  if (!res.ok) {
    const err = new Error(`unrestrict ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────
// gcache: hash → { v: true|false, t: timestamp }
// TTL 10 giorni (come IlCorsaroViola DB cache). Persistita su file
// .gcache.json (sopravvive a sleep Render). I cached:true vengono
// alimentati da: mylist personale + verify foreground + /play OK.
// Con TTL 10gg la cache cresce e diventa utile dopo molti accessi.
// ─────────────────────────────────────────────────────────────────────
const _gcache = new Map();
const _GCACHE_TTL = 10 * 24 * 60 * 60 * 1000;
const _GCACHE_FILE = path.join(__dirname, '..', '..', '.gcache.json');
function gCacheGet(hash) {
  const e = _gcache.get(hash);
  if (!e || Date.now() - e.t > _GCACHE_TTL) {
    if (e) _gcache.delete(hash);
    return undefined;
  }
  return e.v;
}
function gCacheSet(hash, isCached) {
  if (_gcache.size >= 10000) _gcache.delete(_gcache.keys().next().value);
  _gcache.set(hash, { v: isCached, t: Date.now() });
  _schedulePersist();
}
let _persistT = null;
function _schedulePersist() {
  if (_persistT) return;
  _persistT = setTimeout(() => {
    _persistT = null;
    try {
      const arr = [];
      for (const [h, e] of _gcache.entries()) arr.push([h, e.v, e.t]);
      fs.writeFile(_GCACHE_FILE, JSON.stringify(arr), () => {});
    } catch (_) {}
  }, 5000);
}
(function loadPersist() {
  try {
    if (!fs.existsSync(_GCACHE_FILE)) return;
    const arr = JSON.parse(fs.readFileSync(_GCACHE_FILE, 'utf8'));
    const now = Date.now();
    for (const [h, v, t] of arr) {
      if (now - t < _GCACHE_TTL) _gcache.set(h, { v, t });
    }
    console.log(`[RD] gcache restore: ${_gcache.size} voci`);
  } catch (_) {}
})();

// ─────────────────────────────────────────────────────────────────────
// Mylist: torrents nell'account utente. Cached 5 min.
// ─────────────────────────────────────────────────────────────────────
const _mylistCache = new Map();
async function getMyList() {
  const key = getConfig().realdebridKey;
  if (!key) return new Map();
  const entry = _mylistCache.get(key);
  if (entry && Date.now() - entry.t < 5 * 60 * 1000) return entry.map;
  try {
    // Aumentato limit a 1000: vogliamo TUTTA la mylist per popolare gcache.
    const r = await rdFetch(`${API}/torrents?limit=1000`, { headers: headers() });
    if (!r.ok) return new Map();
    const torrents = await r.json();
    const map = new Map();
    let promoted = 0;
    for (const t of torrents) {
      if (!t.hash) continue;
      const h = String(t.hash).toLowerCase();
      map.set(h, t);
      // PROMOZIONE GLOBALE: ogni torrent downloaded della mylist personale
      // diventa cache positiva globale (come fa IlCorsaroViola DB). Anche se
      // l'utente non ha mai cliccato quello stream nella sessione corrente,
      // sappiamo che è cached.
      if (t.status === 'downloaded' && gCacheGet(h) !== true) {
        gCacheSet(h, true);
        promoted++;
      }
    }
    if (promoted) console.log(`[RD] mylist promote +${promoted} to gcache (totale mylist ${torrents.length})`);
    _mylistCache.set(key, { map, t: Date.now() });
    return map;
  } catch (_) { return new Map(); }
}

// ─────────────────────────────────────────────────────────────────────
// pickRdLink: dal info.files+links selezionato sceglie il link
// dell'episodio (S/E) o del file video più grande (movie).
// ─────────────────────────────────────────────────────────────────────
function pickRdLink(info, season, episode) {
  if (!info || !info.links || !info.links.length) return null;
  const selected = (info.files || []).filter((f) => f.selected);
  if (!selected.length) return info.links[0];

  // Conta i file video selezionati: se ce n'è solo 1, è un singolo episodio
  // (o un movie) → ritorna quel link senza filtrare per S/E. Match SxxExx
  // andrebbe in fallimento sugli anime con numerazione assoluta
  // (es. "One Piece - 1163.mkv" mentre cerchi S23E08).
  const videoIdx = selected
    .map((f, idx) => ({ f, idx }))
    .filter((x) => VIDEO_RE.test(x.f.path || ''));

  if (season && episode && videoIdx.length > 1) {
    // Multi-file: probabile pack stagione. Cerca match per S/E.
    const target = findFileForEpisode(
      selected.map((f) => ({ ...f, name: f.path })),
      season, episode,
    );
    if (target && target.path) {
      const idx = selected.findIndex((f) => f.path === target.path);
      if (idx >= 0 && info.links[idx]) return info.links[idx];
    }
    return null;
  }

  // Singolo file video (singolo episodio o movie) → quello.
  if (videoIdx.length === 1) {
    return info.links[videoIdx[0].idx] || info.links[0];
  }

  // Movie o altri casi: il file video più grande tra quelli selezionati.
  if (videoIdx.length > 1) {
    const sorted = videoIdx.slice().sort((a, b) => (b.f.bytes || 0) - (a.f.bytes || 0));
    if (info.links[sorted[0].idx]) return info.links[sorted[0].idx];
  }
  return info.links[0];
}

// ─────────────────────────────────────────────────────────────────────
// verifyHash: test live cached/non-cached.
// addMagnet → selectAll → getInfo → status=='downloaded' && links.len > 0
// Restituisce { cached: boolean, info: full } o null su errore/timeout.
// Delete del torrent solo se NOT cached (cached restano in mylist).
// ─────────────────────────────────────────────────────────────────────
async function verifyHash(hash, magnet) {
  let addedId = null;
  const t0 = Date.now();
  try {
    const added = await addMagnet(magnet);
    addedId = added.id;
    if (!addedId) return { cached: false };
    await selectAll(addedId);
    await new Promise((r) => setTimeout(r, 1100));
    const info = await getInfo(addedId);
    const cached = info?.status === 'downloaded'
      && Array.isArray(info.links) && info.links.length > 0;
    if (!cached) {
      deleteTorrent(addedId).catch(() => {});
      gCacheSet(hash, false);
      return { cached: false };
    }
    gCacheSet(hash, true);
    // Il torrent è ora nella mylist RD: aggiungilo subito al nostro cache
    // così il successivo /play lo trova senza dover ri-addMagnet.
    _addToMylistCache(info);
    return { cached: true, info, elapsed: Date.now() - t0 };
  } catch (e) {
    if (addedId) deleteTorrent(addedId).catch(() => {});
    return { cached: false, error: e.message };
  }
}

// Aggiunge un torrent alla mylist cache live (usato dopo verifyHash positiva)
function _addToMylistCache(info) {
  if (!info || !info.hash || !info.id) return;
  const key = getConfig().realdebridKey;
  if (!key) return;
  const entry = _mylistCache.get(key);
  if (entry && entry.map) {
    entry.map.set(String(info.hash).toLowerCase(), info);
  }
}

// ─────────────────────────────────────────────────────────────────────
// checkCachedBatch: trova quali hash sono cached su RD.
// Pipeline (in ordine di affidabilità):
//   1. gcache positiva → trust (già verificato di recente)
//   2. mylist (status=downloaded + file presente per S/E) → trust
//   3. verify foreground (top N hash, concurrency 3, timeout per slot)
//   4. background enrichment per il resto (alimenta gcache per future visite)
// Restituisce Map(hash → info) con SOLO cached confermati al 100%.
// ─────────────────────────────────────────────────────────────────────
// Limit verify foreground stretti: addMagnet ha rate stretto (1 ogni ~1.5s).
// Strategia:
//   - Pochi trust [RD+] dagli aggregator? → verifichiamo 3 hash extra (max ~5s)
//   - Concurrency 2 (i wait/getInfo si sovrappongono, addMagnet resta serial)
// Risultato: STEP 2 fallback aggiunge max ~5s al /stream invece di 10-12s.
const VERIFY_LIMIT = 3;
const VERIFY_CONCURRENCY = 2;

// ─────────────────────────────────────────────────────────────────────
// instantAvailability batch: come IlCorsaroViola e Torrentio.
// L'endpoint /torrents/instantAvailability/{h1}/{h2}/... accetta fino
// a ~40 hash per request. Cache 5min sui risultati per non sprecare RTT.
// RD ha "deprecato" IA nel 2024 ma l'endpoint risponde ancora (401 con
// token invalido, non 503/410). Restituisce { hash: {rd:[file_groups]} }.
// ─────────────────────────────────────────────────────────────────────
const _iaCache = new Map();
const _IA_TTL = 5 * 60 * 1000;
const _IA_BATCH = 40;
// Cooldown disabled_endpoint: per account RD nuovi/medi, instantAvailability
// ritorna 403 error_code:37. Inutile riprovare ogni richiesta — settiamo un
// cooldown 24h. Si resetta solo a restart server (raro).
let _iaDisabledUntil = 0;

async function instantAvailabilityBatch(hashes) {
  const cached = new Set();
  if (!hashes.length) return cached;
  if (Date.now() < _iaDisabledUntil) return cached; // skip totale
  const fresh = [];
  for (const h of hashes) {
    const e = _iaCache.get(h);
    if (e && Date.now() - e.t < _IA_TTL) {
      if (e.v) cached.add(h);
    } else {
      fresh.push(h);
    }
  }
  if (!fresh.length) return cached;

  for (let i = 0; i < fresh.length; i += _IA_BATCH) {
    const batch = fresh.slice(i, i + _IA_BATCH);
    try {
      const url = `${API}/torrents/instantAvailability/${batch.join('/')}`;
      const res = await rdFetch(url, { headers: headers() });
      if (!res.ok) {
        // 403 disabled_endpoint = RD ha disattivato IA per questo account.
        // Cooldown 24h così non sprechiamo round-trip a ogni richiesta.
        if (res.status === 403) {
          _iaDisabledUntil = Date.now() + 24 * 60 * 60 * 1000;
          console.error(`[RD] IA disabled_endpoint per account, cooldown 24h`);
          return cached;
        }
        if (res.status === 503) console.error(`[RD] IA 503 (endpoint giù temporaneo)`);
        for (const h of batch) _iaCache.set(h, { v: false, t: Date.now() });
        continue;
      }
      const data = await res.json();
      for (const h of batch) {
        const entry = data?.[h];
        const isCached = entry && Array.isArray(entry.rd) && entry.rd.length > 0;
        _iaCache.set(h, { v: isCached, t: Date.now() });
        if (isCached) cached.add(h);
      }
      // Rate limiting tra batch (come IlCorsaroViola: 500ms)
      if (i + _IA_BATCH < fresh.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    } catch (e) {
      console.error('[RD] IA batch err:', e.message);
      for (const h of batch) _iaCache.set(h, { v: false, t: Date.now() });
    }
  }
  return cached;
}

async function checkCachedBatch(hashes, hashWithMagnets, season, episode, verifyLimitOverride) {
  const out = new Map();
  if (!hashes.length) return out;
  const lower = hashes.map((h) => String(h).toLowerCase());

  // STEP 1: gcache lookup. I cached confermati vanno subito in out.
  // I "false" passano comunque a IA (potrebbero essere falsi negativi di
  // verify foreground precedente, RD può averli cached ora).
  const toCheck = [];
  let gHits = 0;
  for (const h of lower) {
    const v = gCacheGet(h);
    if (v === true) { out.set(h, { source: 'gcache' }); gHits++; }
    else toCheck.push(h); // include sia 'undefined' che 'false'
  }
  console.log(`[RD] gcache hit ${gHits}/${hashes.length}, toCheck=${toCheck.length}`);

  // STEP 1.5: instantAvailability batch (come IlCorsaroViola e Torrentio originale).
  // L'endpoint /torrents/instantAvailability/{h1}/{h2}/... ritorna { hash: {rd:[...]} }
  // dove rd è un array di file groups. Non-vuoto = cached.
  // Lo trattiamo come segnale "molto probabile cached" → trust e skip verify
  // foreground per gli hash che IA conferma. Il fallback /play 503 gestisce
  // i rari falsi positivi.
  let iaHits = 0;
  if (toCheck.length) {
    const tIA = Date.now();
    const iaSet = await instantAvailabilityBatch(toCheck);
    for (const h of iaSet) {
      out.set(h, { source: 'ia' });
      gCacheSet(h, true);
      iaHits++;
    }
    console.log(`[RD] IA cached ${iaHits}/${toCheck.length} (${Date.now() - tIA}ms)`);
  }

  // STEP 2: mylist + verifica file per S/E
  if (toCheck.length) {
    const mylist = await getMyList();
    const candidates = [];
    for (const h of toCheck) {
      const t = mylist.get(h);
      if (t && t.status === 'downloaded') candidates.push({ h, t });
    }
    if (candidates.length) {
      const verifyMylist = async ({ h, t }) => {
        try {
          const r = await rdFetch(`${API}/torrents/info/${t.id}`, { headers: headers() });
          if (!r.ok) return null;
          const info = await r.json();
          const sel = (info.files || []).filter((f) => f.selected);
          if (!info.links || info.links.length < sel.length) return null;
          // File-match SOLO sui pack (>1 video selezionato). Singolo episodio
          // o movie: il torrent è cached, basta. Match SxxExx fallirebbe su
          // anime con nomi assoluti (es. "One Piece - 1163.mkv" vs S23E08).
          if (season && episode) {
            const videos = sel.filter((f) => VIDEO_RE.test(f.path || ''));
            if (videos.length > 1) {
              const file = findFileForEpisode(
                sel.map((f) => ({ ...f, name: f.path })), season, episode,
              );
              if (!file) return null;
            }
          }
          return { h, info };
        } catch (_) { return null; }
      };
      let hits = 0;
      for (let i = 0; i < candidates.length; i += 5) {
        const batch = candidates.slice(i, i + 5);
        const results = await Promise.all(batch.map(verifyMylist));
        for (const r of results) {
          if (r) { out.set(r.h, r.info); gCacheSet(r.h, true); hits++; }
        }
      }
      if (hits) console.log(`[RD] mylist +${hits}/${candidates.length}`);
    }
  }

  // STEP 3: verify foreground (live addMagnet+getInfo) sui top hash rimasti.
  // SHORT-CIRCUIT: se IA ha già trovato abbastanza cached (>=5), skip verify
  // foreground per non aggiungere 15-18s di addMagnet sequenziali. L'utente
  // vede comunque tanti risultati e in tempi rapidi.
  const SKIP_VERIFY_IF_IA_HITS = 5;
  if (iaHits >= SKIP_VERIFY_IF_IA_HITS) {
    console.log(`[RD] IA hit sufficiente (${iaHits}), skip verify foreground`);
    return out;
  }
  const remaining = lower.filter((h) => !out.has(h) && gCacheGet(h) !== true);
  const withMagnet = remaining.filter((h) => hashWithMagnets?.get(h));
  // verifyLimitOverride viene da addon.js in base al rdTagCount del pool
  const limit = verifyLimitOverride || VERIFY_LIMIT;
  const syncSlice = withMagnet.slice(0, limit);
  const bgSlice = withMagnet.slice(limit);

  if (syncSlice.length) {
    const t0 = Date.now();
    let hits = 0;
    for (let i = 0; i < syncSlice.length; i += VERIFY_CONCURRENCY) {
      const batch = syncSlice.slice(i, i + VERIFY_CONCURRENCY);
      await Promise.all(batch.map(async (h) => {
        const r = await verifyHash(h, hashWithMagnets.get(h));
        if (r.cached && r.info) {
          // File-match SOLO sui pack (>1 video). Singolo episodio = già OK.
          // Allinea il comportamento RD a quello TB (in addon.js TB applica
          // findFileForEpisode solo se c.seasonPack=true).
          if (season && episode) {
            const sel = (r.info.files || []).filter((f) => f.selected);
            if (!r.info.links || r.info.links.length < sel.length) {
              gCacheSet(h, false); return;
            }
            const videos = sel.filter((f) => VIDEO_RE.test(f.path || ''));
            if (videos.length > 1) {
              const file = findFileForEpisode(
                sel.map((f) => ({ ...f, name: f.path })), season, episode,
              );
              if (!file) { gCacheSet(h, false); return; }
            }
          }
          out.set(h, r.info);
          hits++;
        }
      }));
    }
    if (hits) console.log(`[RD] verify +${hits}/${syncSlice.length} (${Date.now() - t0}ms)`);
  }

  // STEP 4: background enrichment LIMITATO (max 15 hash per /stream).
  // Più alto → bucket addMagnet saturato → 429 a cascata. Meglio popolare
  // poco a poco gcache visite dopo visite.
  const BG_LIMIT = 15;
  if (bgSlice.length) {
    const bgItems = bgSlice.slice(0, BG_LIMIT)
      .map((h) => ({ hash: h, magnet: hashWithMagnets.get(h) }));
    console.log(`[RD] bg enrichment +${bgItems.length}`);
    enqueueBackground(bgItems);
  }

  return out;
}

// Background enrichment DISABILITATO. Faceva addMagnet "fantasma" continuo
// dopo le response, accumulava 429 anche senza traffico /stream attivo. Il
// trade-off accettato: gcache cresce solo da verify foreground + /play
// successi (entrambi triggered dall'utente).
function enqueueBackground() { /* no-op */ }

// ─────────────────────────────────────────────────────────────────────
// getStreamUrl: chiamato al /play. Restituisce URL CDN scaricabile.
// Se hash in mylist: refetch info (per files/links), pickLink, unrestrict.
// Altrimenti: addMagnet+selectAll+wait+getInfo+pickLink+unrestrict.
// ─────────────────────────────────────────────────────────────────────
async function getStreamUrl(infoHash, magnet, season, episode) {
  const key = getConfig().realdebridKey;
  if (!key || !magnet) return null;
  const hash = String(infoHash).toLowerCase();
  try {
    // Se in mylist → riusa torrent esistente
    const mylist = await getMyList();
    const existing = mylist.get(hash);
    if (existing && existing.id) {
      const info = await getInfo(existing.id);
      if (!info.links || !info.links.length) return null;
      const link = pickRdLink(info, season, episode);
      if (!link) return null;
      const { download } = await unrestrict(link);
      gCacheSet(hash, true);
      return download;
    }
    // Nuovo torrent: addMagnet+select+wait+info
    const added = await addMagnet(magnet);
    if (!added.id) return null;
    await selectAll(added.id);
    await new Promise((r) => setTimeout(r, 1100));
    const info = await getInfo(added.id);
    if (info.status !== 'downloaded' || !info.links || !info.links.length) {
      deleteTorrent(added.id).catch(() => {});
      gCacheSet(hash, false);
      return null;
    }
    const link = pickRdLink(info, season, episode);
    if (!link) return null;
    const { download } = await unrestrict(link);
    gCacheSet(hash, true);
    return download;
  } catch (e) {
    if (e && e.status === 451) gCacheSet(hash, false);
    return null;
  }
}

// Alias compatibilità: usato dal /play se l'hash è in mylist
async function getStreamUrlFromExisting(torrent, season, episode) {
  if (!torrent || !torrent.id) return null;
  try {
    const info = await getInfo(torrent.id);
    if (!info.links || !info.links.length) return null;
    const link = pickRdLink(info, season, episode);
    if (!link) return null;
    const { download } = await unrestrict(link);
    if (torrent.hash) gCacheSet(String(torrent.hash).toLowerCase(), true);
    return download;
  } catch (e) {
    if (e && e.status === 451 && torrent.hash) {
      gCacheSet(String(torrent.hash).toLowerCase(), false);
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// FAST PATH — API esterna che ritorna lista torrent + flag cached_rd
// pre-computato. Saltiamo completamente il batch scraper + mylist verify.
// ─────────────────────────────────────────────────────────────────────
const RD_CACHE_API = process.env.RD_CACHE_API || 'http://158.101.170.131:8321';
const _findCachedCache = new Map(); // key: kind:tmdb:s:e → { v, t }
const _FIND_TTL = 5 * 60 * 1000; // 5 min

// Ritorna lista di torrent CACHED-{debrid} pronti da servire.
// `debrid` può essere 'rd' (default, backward compat) o 'tb' — ICV supporta
// entrambi e ritorna stesso schema con flag `cached_rd` o `cached_tb`.
// Per i film: ogni entry ha {hash, magnet, title, size, seeders, is_pack}.
// Per le serie: ogni entry ha anche {file: {title, size, file_index, rd_link_index}}
// pre-mappato (l'API risolve già file index + link index per l'episodio).
async function findCachedByTmdb(tmdbId, season, episode, isMovie, debrid = 'rd') {
  if (!tmdbId) return [];
  const kind = isMovie ? 'movie' : 'tv';
  const qid = isMovie ? String(tmdbId) : `${tmdbId}:${season || 1}:${episode || 1}`;
  // Cache key separata per debrid (pool TB e RD sono diversi anche per stesso titolo).
  const ckey = `${kind}:${qid}:${debrid}`;
  const hit = _findCachedCache.get(ckey);
  if (hit && Date.now() - hit.t < _FIND_TTL) return hit.v;
  try {
    const url = `${RD_CACHE_API}/${kind}?tmdb_id=${encodeURIComponent(qid)}&debrid=${debrid}`;
    const r = await fetch(url, { timeout: 5000 });
    if (!r.ok) {
      console.error(`[ICV ${debrid}] ${kind}/${qid} -> ${r.status}`);
      return [];
    }
    const data = await r.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    // Filtra per cached_{debrid}: true.
    const cachedFlag = `cached_${debrid}`;
    const out = [];
    for (const r of results) {
      if (!r[cachedFlag]) continue;
      const hashM = String(r.magnet || '').match(/btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
      if (!hashM) continue;
      out.push({
        hash: hashM[1].toLowerCase(),
        magnet: r.magnet,
        title: r.title || '',
        size: (r.file && r.file.size) || 0,
        seeders: r.seeders || 0,
        isPack: !!r.is_pack,
        file: r.file || null, // contiene file_index + rd_link_index per le serie
      });
    }
    _findCachedCache.set(ckey, { v: out, t: Date.now() });
    return out;
  } catch (e) {
    console.error(`[ICV ${debrid}] ${kind}/${qid} ERR:`, e.message);
    return [];
  }
}

// Risolve l'URL stream usando direttamente file_index + rd_link_index forniti
// dall'API esterna (più affidabile dell'euristica pickRdLink). Per i film,
// fileIndex/rdLinkIndex possono essere null → selectAll + first link.
async function getStreamUrlFast(hash, magnet, fileIndex, rdLinkIndex) {
  const key = getConfig().realdebridKey;
  if (!key || !magnet) return null;
  const lowerHash = String(hash || '').toLowerCase();
  try {
    // Prova prima mylist (skip addMagnet se il torrent esiste già nell'account)
    const mylist = await getMyList();
    let torrentId = mylist.get(lowerHash)?.id;
    if (!torrentId) {
      const added = await addMagnet(magnet);
      if (!added.id) return null;
      torrentId = added.id;
      // selectFiles: indice puntuale se fornito, altrimenti "all"
      const body = (fileIndex != null && fileIndex !== '')
        ? `files=${Number(fileIndex) + 1}` // RD usa 1-based
        : 'files=all';
      await rdFetch(`${API}/torrents/selectFiles/${torrentId}`, {
        method: 'POST', headers: headers(), body,
      });
      // Cached → ready immediato. Brevissima pausa per consistency.
      await new Promise((r) => setTimeout(r, 800));
    }
    const info = await getInfo(torrentId);
    if (!info.links || !info.links.length) {
      gCacheSet(lowerHash, false);
      return null;
    }
    // Link da unrestrict:
    //  - se rdLinkIndex fornito dall'API: link[rdLinkIndex] direttamente
    //  - altrimenti fallback: link[0] (film) o pickRdLink (serie senza index)
    let chosen = null;
    if (rdLinkIndex != null && rdLinkIndex !== '' && Number.isFinite(Number(rdLinkIndex))) {
      const idx = Number(rdLinkIndex);
      chosen = info.links[idx] || info.links[0];
    } else {
      chosen = info.links[0];
    }
    if (!chosen) return null;
    const { download } = await unrestrict(chosen);
    gCacheSet(lowerHash, true);
    return download;
  } catch (e) {
    if (e && e.status === 451) gCacheSet(lowerHash, false);
    console.error(`[RD fast] ${lowerHash.slice(0, 8)} err: ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Traduzione episodio ASSOLUTO → S/E TMDB per anime via Kitsu.
// Kitsu serve One Piece (e altri long-running) come lista flat di episodi:
// "ep 1163" su Kitsu = "S23E08" su TMDB. L'API esterna usa il formato TMDB
// strutturato, quindi serve la traduzione prima del lookup.
//
// Fonte primaria: Cinemeta videos array (S/E corretta, allineata a TMDB ma
// filtrata da specials/recap). Cache 24h per evitare l'hit grosso (~1.3MB
// per One Piece).
// Fallback: TMDB API /tv/{id} seasons summing (meno preciso ma veloce).
// ─────────────────────────────────────────────────────────────────────
const CINEMETA = 'https://v3-cinemeta.strem.io';
const _TMDB_API = 'https://api.themoviedb.org/3';
const _TMDB_KEY = process.env.TMDB_API_KEY || '4ef0d7355d9ffb5151e987764708ce96';
const _videosCache = new Map(); // imdb → { v: [...], t }
const _tmdbSeasonsCache = new Map(); // tmdbId → { v: [...], t }

async function getCinemetaVideos(imdbId) {
  if (!imdbId) return null;
  const hit = _videosCache.get(imdbId);
  if (hit && Date.now() - hit.t < 24 * 60 * 60 * 1000) return hit.v;
  try {
    // Timeout alto (12s) perché One Piece ha 1.3MB di videos. La cache 24h
    // amortizza il costo: prima call lenta, successive istantanee.
    const r = await fetch(`${CINEMETA}/meta/series/${imdbId}.json`, { timeout: 12000 });
    if (!r.ok) return null;
    const { meta } = await r.json();
    const videos = (meta?.videos || [])
      .filter((v) => Number(v.season) > 0)
      .sort((a, b) => (Number(a.season) - Number(b.season)) || (Number(a.episode) - Number(b.episode)));
    _videosCache.set(imdbId, { v: videos, t: Date.now() });
    return videos;
  } catch (_) {
    return null;
  }
}

async function getTmdbSeasons(tmdbId) {
  if (!tmdbId) return null;
  const hit = _tmdbSeasonsCache.get(tmdbId);
  if (hit && Date.now() - hit.t < 24 * 60 * 60 * 1000) return hit.v;
  try {
    const r = await fetch(`${_TMDB_API}/tv/${tmdbId}?api_key=${_TMDB_KEY}`, { timeout: 6000 });
    if (!r.ok) return null;
    const data = await r.json();
    const seasons = (data.seasons || [])
      .filter((s) => Number(s.season_number) > 0)
      .map((s) => ({ season: Number(s.season_number), count: Number(s.episode_count) }));
    _tmdbSeasonsCache.set(tmdbId, { v: seasons, t: Date.now() });
    return seasons;
  } catch (_) {
    return null;
  }
}

// Mappa episodio assoluto → { season, episode } TMDB-style.
// Ritorna null se l'imdbId non ha videos oppure l'index è fuori range.
//
// Alcuni anime long-running hanno offset broadcast vs Cinemeta. Lo stesso
// hardcoded in cinemeta.js (ABSOLUTE_OFFSET) viene applicato inversamente qui:
// se Kitsu dice "ep 1163" e Cinemeta è +1 (ep 1164), per allineare al sort
// di Cinemeta dobbiamo sottrarre l'offset.
const _ABS_OFFSET = {
  tt0388629: 1, // One Piece (Kitsu broadcast → Cinemeta - 1)
};
async function absoluteEpisodeToSE(imdbId, absoluteEpisode, tmdbIdFallback) {
  const offset = _ABS_OFFSET[imdbId] || 0;

  // PRIMA: Cinemeta videos (precisa, ma 1.3MB per One Piece → cache 24h)
  const videos = await getCinemetaVideos(imdbId);
  if (videos && videos.length) {
    // L'offset broadcast vs Cinemeta non è lineare: cresce nel tempo. Per gli
    // episodi alti l'offset si applica, per quelli bassi no. Strategia: prova
    // prima con offset; se fuori range, fallback a absolute non-offsettato.
    const tryAdjusted = absoluteEpisode - offset;
    if (tryAdjusted >= 1 && tryAdjusted - 1 < videos.length) {
      const v = videos[tryAdjusted - 1];
      return { season: Number(v.season), episode: Number(v.episode) };
    }
    if (absoluteEpisode >= 1 && absoluteEpisode - 1 < videos.length) {
      const v = videos[absoluteEpisode - 1];
      return { season: Number(v.season), episode: Number(v.episode) };
    }
  }

  // FALLBACK: TMDB seasons summing (meno preciso — TMDB include specials che
  // Cinemeta filtra). Veloce: solo 23 seasons object vs 1.3MB videos.
  if (tmdbIdFallback) {
    const seasons = await getTmdbSeasons(tmdbIdFallback);
    if (seasons && seasons.length) {
      const target = Math.max(1, absoluteEpisode - offset);
      let acc = 0;
      for (const s of seasons) {
        if (acc + s.count >= target) {
          return { season: s.season, episode: target - acc };
        }
        acc += s.count;
      }
    }
  }
  return null;
}

module.exports = {
  name: 'RD',
  getStreamUrl,
  getStreamUrlFromExisting,
  checkCachedBatch,
  getMyList,
  gCacheSet,
  // Fast path (API esterna)
  findCachedByTmdb,
  getStreamUrlFast,
  absoluteEpisodeToSE,
};
