// AnimeUnity scraper — HLS stream via il loro CDN upstream.
//
// Flusso:
//   1. POST /archivio/get-animes con title → records {id, slug, dub, episodes_count}
//   2. Match best record (preferisce audio ITA = dub:1, season giusta)
//   3. GET /anime/{id}-{slug} → estrae attribute episodes="[{id, number, scws_id}, ...]"
//   4. Filtra episodio richiesto (number == episode)
//   5. GET /embed-url/{episode_id} → URL https://vixcloud.co/embed/{scws_id}?token=...
//   6. GET embed URL → HTML con window.masterPlaylist {params:{token, expires}, url}
//   7. Compongo master URL → ritorno a Pezzottio (che lo proxy via /hls/au/*)

const fetch = require('node-fetch');

const BASE = 'https://www.animeunity.so';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const TIMEOUT = 10000;

const COMMON_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
};

const PLAYBACK_HEADERS = {
  'User-Agent': UA,
  'Accept': '*/*',
  'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
  'Referer': 'https://vixcloud.co/',
  'Origin': 'https://vixcloud.co',
};

// Session = (cookie file + csrf token), valida ~30 min
let session = null;
let sessionAt = 0;
async function getSession() {
  if (session && Date.now() - sessionAt < 30 * 60 * 1000) return session;
  const r = await fetch(`${BASE}/`, { headers: COMMON_HEADERS, timeout: TIMEOUT });
  const setCookie = r.headers.raw()['set-cookie'] || [];
  const cookieStr = setCookie.map((c) => c.split(';')[0]).join('; ');
  const html = await r.text();
  const tokenM = html.match(/csrf-token"\s+content="([^"]+)"/);
  if (!tokenM) throw new Error('AU: no CSRF token');
  session = { cookie: cookieStr, csrf: tokenM[1] };
  sessionAt = Date.now();
  return session;
}

const STOPS = new Set(['di', 'il', 'la', 'le', 'gli', 'i', 'lo', 'e', 'un', 'una', 'the', 'a', 'an', 'of']);
function norm(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokenSet(s) {
  return new Set(norm(s).split(' ').filter((w) => w.length > 1 && !STOPS.has(w)));
}
function sanitizeForSearch(title) {
  return (title || '')
    .replace(/[×✕✖⨉]/g, ' x ').replace(/[–—‒―]/g, '-')
    .replace(/[''‘’`]/g, '').replace(/[:;"!?,.]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Search via POST /archivio/get-animes
async function searchAU(title) {
  const s = await getSession();
  const body = JSON.stringify({ title });
  const r = await fetch(`${BASE}/archivio/get-animes`, {
    method: 'POST',
    headers: {
      ...COMMON_HEADERS,
      'Content-Type': 'application/json',
      'X-CSRF-TOKEN': s.csrf,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${BASE}/archivio`,
      'Cookie': s.cookie,
    },
    body,
    timeout: TIMEOUT,
  });
  if (!r.ok) throw new Error(`AU search -> ${r.status}`);
  const data = await r.json();
  return data.records || [];
}

// Score per matching (title + season + dub preference)
async function pickRecord(title, season) {
  const cleaned = sanitizeForSearch(title);
  // AnimeUnity search ha matching imperfetto su titoli compositi (es.
  // "Demon Slayer Kimetsu no Yaiba" non ritorna "Demon Slayer" originale).
  // Cerco con varianti: titolo completo + primo segmento + primi 2 token.
  const queries = new Set([cleaned]);
  if (title) {
    queries.add(title.trim());
    // Prime 2 parole RAW + variant senza spazi attorno a ':'
    const rawWords = title.split(/\s+/).filter((w) => w.length > 0);
    if (rawWords.length >= 2) {
      const first2 = rawWords.slice(0, 2).join(' ');
      queries.add(first2);
      const first2NoSpace = first2.replace(/\s*:\s*/g, ':');
      if (first2NoSpace !== first2) queries.add(first2NoSpace);
    }
    const colonNoSpace = title.replace(/\s*:\s*/g, ':').trim();
    if (colonNoSpace !== title.trim()) queries.add(colonNoSpace);
  }
  const beforeColon = cleaned.split(':')[0].trim();
  if (beforeColon !== cleaned && beforeColon.length >= 2) queries.add(beforeColon);
  const beforeDash = cleaned.split(' - ')[0].trim();
  // length >= 2: gestisce titoli "numerici" come "86 - Eighty Six"
  if (beforeDash !== cleaned && beforeDash.length >= 2) queries.add(beforeDash);
  // Word slicing: escludo dashes e separatori vuoti
  const wordsClean = cleaned.split(/\s+/).filter((w) => w && w !== '-');
  if (wordsClean.length >= 2) queries.add(wordsClean.slice(0, 2).join(' '));
  // Single-word search per match con titoli "smashed" (es. "Steins;Gate" → "steinsgate")
  // length >= 2 invece di 4: per supportare titoli come "86" o digit-based
  if (wordsClean.length > 0 && wordsClean[0].length >= 2) queries.add(wordsClean[0]);

  const seen = new Map();
  for (const q of queries) {
    try {
      const rs = await searchAU(q);
      for (const r of rs) if (!seen.has(r.id)) seen.set(r.id, r);
    } catch (_) {}
  }
  const records = [...seen.values()];
  if (!records.length) return null;

  const titleTokens = tokenSet(title);
  const identifierTokens = norm(title).split(' ').filter((w) => w.length > 1 && !STOPS.has(w)).slice(0, 2);
  // Single-letter differentiators: token 1-char (Z di "Dragon Ball Z", X di
  // "Spy x Family"). Se mancano nel record → penalty forte: è l'anime base.
  const singleLetterDiff = norm(title).split(' ').filter((w) => /^[a-z0-9]$/.test(w));

  function score(r) {
    const nameTokens = tokenSet(r.title || '');
    const itTokens = tokenSet(r.title_it || '');
    const engTokens = tokenSet(r.title_eng || '');
    const bestOverlap = Math.max(
      [...titleTokens].filter((t) => nameTokens.has(t)).length,
      [...titleTokens].filter((t) => itTokens.has(t)).length,
      [...titleTokens].filter((t) => engTokens.has(t)).length,
    );
    let s = bestOverlap / Math.max(titleTokens.size, 1);

    // Tutti i text del record (normalizzato) per check identifier + differentiator
    const allText = `${r.title || ''} ${r.title_eng || ''} ${r.title_it || ''} ${r.slug || ''}`.toLowerCase();
    const allTextNorm = allText.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
    const recTokens = new Set(allTextNorm.split(/\s+/).filter(Boolean));

    // Identifier boost: primi 2-3 token significativi presenti
    if (identifierTokens.length >= 2) {
      const hasAllIdentifiers = identifierTokens.every((w) => allTextNorm.includes(w));
      if (hasAllIdentifiers) s += 0.6;
    }

    // Smashed match: titolo e record senza spazi a confronto.
    // Es. "Mushishi" vs record "Mushi-Shi" → "mushishi" vs "mushishi" ✓
    //     "Steins;Gate" vs "steins gate" → "steinsgate" vs "steinsgate" ✓
    const titleSmashed = norm(title).replace(/\s+/g, '');
    const recSmashed = allTextNorm.replace(/\s+/g, '');
    if (titleSmashed.length >= 4 && (recSmashed.includes(titleSmashed) || titleSmashed.includes(norm(r.title || r.title_eng || r.title_it || r.slug).replace(/\s+/g, '')))) {
      s += 0.5;
    }

    // Single-letter differentiator: penalty se mancano (es. cerchiamo "Dragon Ball Z"
    // → record "dragon ball" senza "z" è SBAGLIATO, penalty -0.8 per Z mancante)
    for (const d of singleLetterDiff) {
      if (!recTokens.has(d)) s -= 0.8;
    }

    // Penalty modificatori extra: se il TITLE cercato non contiene un modificatore
    // noto (kai, super, gt, ...) ma il RECORD sì → il record è una variante diversa.
    // Es. cerco "Dragon Ball" → record "Dragon Ball Super" ha extra "super" → penalty.
    const titleAllNorm = norm(title);
    const titleAllTokens = new Set(titleAllNorm.split(' '));
    const SEQUEL_MODIFIERS = ['kai', 'super', 'gt', 'z', 'movie', 'film', 'special', 'ova', 'ona', 'recap', 'gaiden', 'special', 'daima'];
    for (const mod of SEQUEL_MODIFIERS) {
      if (recTokens.has(mod) && !titleAllTokens.has(mod)) s -= 0.5;
    }

    const slugL = (r.slug || '').toLowerCase();
    const typeL = (r.type || '').toLowerCase();

    // Bonus per audio ITA dub (moderato — la season corretta vale di più)
    if (r.dub === 1) s += 0.25;

    // Penalty forti per spinoff/movie/special
    if (/movie|film|special|ova|ona|recap/i.test(typeL)) s -= 0.5;
    if (/movie|special|ova/i.test(slugL)) s -= 0.3;

    // SLUG STAGIONE — heavy weights perché tanti anime hanno titoli simili
    // tra S1/S2/Sn (es. "Demon Slayer S1" vs "Demon Slayer Yuukaku-hen S2")
    if (season && season > 1) {
      // Cerchiamo Sn → BONUS se slug menziona N, PENALTY se è uno slug "puro" (sarà S1)
      if (new RegExp(`-${season}(?:st|nd|rd|th)|season-${season}|-${season}$|-${season}-`).test(slugL)) s += 0.7;
      else if (!/-(arc|hen|season|movie|special)|-\d|nd-season|rd-season|th-season|2nd|3rd|4th|5th/.test(slugL)) s -= 0.6;
    } else {
      // S1 (o assente) → preferisce slug "principale", penalizza spinoff/season-N
      const isSpinoffSlug = /-(arc|hen|2nd|3rd|4th|5th|6th|nd-season|rd-season|th-season|second-season|third-season|movie|special|ova|recap|gaiden|prequel|sequel)/i.test(slugL);
      const isSpinoffTitle = /(\barc\b|\bhen\b|stagione\s*[2-9]|season\s*[2-9]|2nd\s+season|3rd\s+season|4th\s+season|movie\s*[2-9])/i.test(r.title || '');
      if (isSpinoffSlug || isSpinoffTitle) s -= 0.8;
      // Bonus se slug è "pulito" (solo title tokens + eventualmente -ita)
      const slugClean = slugL.replace(/-ita$/, '').split('-').filter(Boolean);
      const titleClean = [...titleTokens];
      // se i token slug sono un subset perfetto dei title tokens (no parole extra) → bonus
      const allMatch = slugClean.length > 0 && slugClean.every((w) => titleTokens.has(w) || w === 'no' || STOPS.has(w));
      if (allMatch) s += 0.4;
    }
    return s;
  }
  records.sort((a, b) => score(b) - score(a));
  const best = records[0];
  if (!best) return null;
  const bestAllText = `${best.title || ''} ${best.title_eng || ''} ${best.title_it || ''} ${best.slug || ''}`.toLowerCase();
  const bestAllNorm = bestAllText.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
  // Match via identifier (primi 2 token) O smashed (titolo unito vs record unito)
  const titleSmashed = norm(title).replace(/\s+/g, '');
  const bestSmashed = bestAllNorm.replace(/\s+/g, '');
  const identifierOK = identifierTokens.length >= 2 && identifierTokens.every((w) => bestAllNorm.includes(w));
  const smashedOK = titleSmashed.length >= 4 && bestSmashed.includes(titleSmashed);
  if (identifierTokens.length >= 2) {
    if (!identifierOK && !smashedOK) return null;
  } else {
    const bt = tokenSet(best.title || best.title_eng || best.title_it || '');
    const ov = [...titleTokens].filter((t) => bt.has(t)).length / Math.max(titleTokens.size, 1);
    if (ov < 0.3 && !smashedOK) return null;
  }
  return best;
}

// Estrai episodi dalla pagina /anime/{id-slug}
async function getEpisodes(record) {
  const s = await getSession();
  const url = `${BASE}/anime/${record.id}-${record.slug}`;
  const r = await fetch(url, { headers: { ...COMMON_HEADERS, 'Cookie': s.cookie }, timeout: TIMEOUT });
  if (!r.ok) throw new Error(`AU anime page -> ${r.status}`);
  const html = await r.text();
  const m = html.match(/episodes="([^"]+)"/);
  if (!m) return [];
  // Decoded HTML entities
  const json = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  try {
    return JSON.parse(json);
  } catch (_) { return []; }
}

// Ottieni embed URL VixCloud per un episodio
async function getEmbedUrl(episodeId) {
  const s = await getSession();
  const r = await fetch(`${BASE}/embed-url/${episodeId}`, {
    headers: {
      ...COMMON_HEADERS,
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': s.cookie,
      'Referer': `${BASE}/`,
    },
    timeout: TIMEOUT,
  });
  if (!r.ok) throw new Error(`AU embed-url -> ${r.status}`);
  return (await r.text()).trim();
}

// Parse master playlist URL dall'embed VixCloud
async function getMasterUrlFromEmbed(embedUrl) {
  const r = await fetch(embedUrl, {
    headers: { ...COMMON_HEADERS, 'Referer': `${BASE}/` },
    timeout: TIMEOUT,
  });
  if (!r.ok) throw new Error(`AU embed -> ${r.status}`);
  const html = await r.text();
  const tokenM = html.match(/['"]token['"]\s*:\s*['"]([^'"]+)['"]/);
  const expiresM = html.match(/['"]expires['"]\s*:\s*['"]([^'"]+)['"]/);
  const urlM = html.match(/window\.masterPlaylist\s*=[\s\S]*?url\s*:\s*['"]([^'"]+)['"]/);
  if (!tokenM || !expiresM || !urlM) throw new Error('AU: masterPlaylist parse failed');
  const fhdM = html.match(/window\.canPlayFHD\s*=\s*(true|false)/);
  const fhd = fhdM ? fhdM[1] === 'true' : true;
  const sep = urlM[1].includes('?') ? '&' : '?';
  return `${urlM[1]}${sep}token=${tokenM[1]}&expires=${expiresM[1]}${fhd ? '&h=1' : ''}`;
}

const masterCache = new Map();
// Cache episodes/animeId direttamente (più stabile di recordCache, sopravvive
// a search di titolo diverso). Key: animeId.
const animeEpisodesCache = new Map(); // animeId -> { episodes: [...], t: ts, slug }

// Firma compatibile con proxy /hls/* in index.js: (id, season, episode, isMovie)
// Per AU usiamo solo (animeId, episodeNum). Season ignorata.
async function getMasterUrlCached(animeId, _season, episodeNum, _isMovie) {
  const k = `${animeId}:${episodeNum}`;
  const entry = masterCache.get(k);
  if (entry && entry.expire - Date.now() > 60_000) return entry;

  // Refresh: rigenera embed → master. Serve episode_id quindi recupero gli
  // episodi cached (o li rifetcho dalla pagina anime).
  let cache = animeEpisodesCache.get(animeId);
  if (!cache || Date.now() - cache.t > 15 * 60 * 1000) {
    // Fetcha la pagina anime con slug "wildcard". AnimeUnity accetta solo l'id
    // anche se lo slug è sbagliato (redirige al canonico).
    cache = await fetchEpisodesForAnimeId(animeId);
  }
  if (!cache || !cache.episodes) throw new Error(`AU: no episodes for animeId ${animeId}`);
  const ep = cache.episodes.find((e) => Number(e.number) === Number(episodeNum));
  if (!ep) throw new Error(`AU: episode ${episodeNum} not found in animeId ${animeId}`);

  const embedUrl = await getEmbedUrl(ep.id);
  const master = await getMasterUrlFromEmbed(embedUrl);
  const fresh = { url: master, expire: Date.now() + 4 * 60 * 1000 };
  masterCache.set(k, fresh);
  return fresh;
}

// Fetcha episodi solo dato animeId (senza dover sapere lo slug esatto).
// AnimeUnity redirige automaticamente /anime/{id}-{wrong-slug} al canonico.
async function fetchEpisodesForAnimeId(animeId) {
  const s = await getSession();
  // Uso slug placeholder "x" — AnimeUnity redirige al canonico
  const r = await fetch(`${BASE}/anime/${animeId}-x`, {
    headers: { ...COMMON_HEADERS, 'Cookie': s.cookie },
    timeout: TIMEOUT,
    redirect: 'follow',
  });
  if (!r.ok) return null;
  const html = await r.text();
  const m = html.match(/episodes="([^"]+)"/);
  if (!m) return null;
  const json = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  let episodes;
  try { episodes = JSON.parse(json); } catch (_) { return null; }
  const slugM = html.match(/\/anime\/(\d+)-([a-z0-9-]+)/);
  const slug = slugM ? slugM[2] : null;
  const cache = { episodes, t: Date.now(), slug };
  animeEpisodesCache.set(animeId, cache);
  return cache;
}

async function cdnFetch(url, extraHeaders = {}) {
  return fetch(url, {
    headers: { ...PLAYBACK_HEADERS, ...extraHeaders },
    timeout: 10000,
    redirect: 'follow',
  });
}

async function resolveSegmentUrl(animeId, _season, episodeNum, _isMovie, segmentPath) {
  masterCache.delete(`${animeId}:${episodeNum}`);
  const master = await getMasterUrlCached(animeId, episodeNum);
  const r = await cdnFetch(master.url);
  if (!r.ok) throw new Error(`AU master CDN ${r.status}`);
  const masterText = await r.text();
  const lines = masterText.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  for (const line of lines) {
    const playlistUrl = line.startsWith('http') ? line : new URL(line, master.url).toString();
    const pr = await cdnFetch(playlistUrl);
    if (!pr.ok) continue;
    const ptext = await pr.text();
    const segs = ptext.split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
    for (const s of segs) {
      const segUrl = s.startsWith('http') ? s : new URL(s, playlistUrl).toString();
      if (segUrl.includes(segmentPath) || segUrl.split('?')[0].endsWith(segmentPath)) {
        return segUrl;
      }
    }
  }
  return null;
}

const animeMeta = require('../anime-meta');
const streamCache = new Map();
async function findStreams(title, season, episode, absoluteEpisode, aliases = [], imdbId = null, providerSlugs = null) {
  if (!episode && !absoluteEpisode) return [];
  const ckey = `au:${title}:${season}:${episode}:${absoluteEpisode}`;
  const cached = streamCache.get(ckey);
  if (cached && Date.now() - cached.t < 5 * 60 * 1000) return cached.v;

  try {
    let record = null;
    // 1. Mapping diretto (preferito): itero ranked list di slug "/anime/2998-one-piece-ita"
    if (providerSlugs && Array.isArray(providerSlugs.au) && providerSlugs.au.length) {
      const ranked = animeMeta.rankSlugs(providerSlugs.au);
      for (const s of ranked) {
        const m = s.match(/^\/anime\/(\d+)-(.+)$/);
        if (!m) continue;
        const auId = Number(m[1]);
        const slug = m[2];
        const cache = await fetchEpisodesForAnimeId(auId).catch(() => null);
        if (cache && cache.episodes && cache.episodes.length) {
          record = { id: auId, slug: cache.slug || slug, title: '', dub: /-ita\b/.test(slug) ? 1 : 0 };
          break;
        }
      }
    }
    // 2. Lookup file cache permanente
    if (!record) {
      const cachedAuId = imdbId ? animeMeta.getProviderSlug(imdbId, 'au') : null;
      if (cachedAuId) {
        const cache = await fetchEpisodesForAnimeId(cachedAuId).catch(() => null);
        if (cache && cache.slug) {
          record = { id: Number(cachedAuId), slug: cache.slug, title: '', dub: cache.slug.endsWith('-ita') ? 1 : 0 };
        }
      }
    }
    // 3. Search dinamica
    if (!record) record = await pickRecord(title, season);
    // 4. Fallback con aliases AniList
    if (!record && Array.isArray(aliases)) {
      for (const alt of aliases) {
        record = await pickRecord(alt, season);
        if (record) break;
      }
    }
    if (!record) return [];

    if (imdbId && record.id) animeMeta.rememberProviderSlug(imdbId, 'au', String(record.id));

    // Cerca episodio: prima episode (in-stagione), poi absoluteEpisode
    const eps = await getEpisodes(record);
    // Cacho gli episodi per animeId — usata da resolveSegmentUrl/getMasterUrlCached
    // quando il token scade e dobbiamo rigenerare master senza rifare search.
    animeEpisodesCache.set(record.id, { episodes: eps, t: Date.now(), slug: record.slug });

    let ep = eps.find((e) => Number(e.number) === Number(episode));
    if (!ep && absoluteEpisode) ep = eps.find((e) => Number(e.number) === Number(absoluteEpisode));
    if (!ep) return [];

    const embedUrl = await getEmbedUrl(ep.id);
    const masterUrl = await getMasterUrlFromEmbed(embedUrl);

    // Cache per il proxy
    masterCache.set(`${record.id}:${ep.number}`, {
      url: masterUrl,
      expire: Date.now() + 4 * 60 * 1000,
    });

    const isItaDub = record.dub === 1;
    const out = [{
      provider: 'AU',
      animeId: record.id,
      episodeNum: ep.number,
      masterUrl, // emesso al proxy /hls/au/*
      name: record.title_it || record.title || record.title_eng || record.slug,
      italian: isItaDub,
      italianSub: !isItaDub,
      quality: null,
    }];
    streamCache.set(ckey, { v: out, t: Date.now() });
    return out;
  } catch (e) {
    console.error('[AnimeUnity]', e.message);
    return [];
  }
}

module.exports = { findStreams, getMasterUrlCached, cdnFetch, resolveSegmentUrl };
