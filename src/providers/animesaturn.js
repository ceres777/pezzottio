// AnimeSaturn scraper — implementazione originale.
// Strategia:
//   1. Cerca via /animelist?search=
//   2. Trova slug giusto per la stagione
//   3. Va su /anime/SLUG, trova URL episodio richiesto (/ep/SLUG-ep-N)
//   4. Va su /ep/..., estrae link /watch?file=TOKEN
//   5. Va su /watch?file=TOKEN, estrae MP4 URL diretto
const fetch = require('node-fetch');

const BASES = ['https://www.animesaturn.cx', 'https://www.animesaturn.tv', 'https://www.animesaturn.it'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const TIMEOUT = 7000;

let activeBase = null;
async function getBase() {
  if (activeBase) return activeBase;
  for (const b of BASES) {
    try {
      const r = await fetch(b + '/', { headers: { 'user-agent': UA }, timeout: TIMEOUT, redirect: 'follow' });
      if (r.ok) { activeBase = b; return b; }
    } catch (_) {}
  }
  activeBase = BASES[0];
  return activeBase;
}

async function asFetch(path) {
  const base = await getBase();
  const url = path.startsWith('http') ? path : base + path;
  const r = await fetch(url, {
    headers: {
      'user-agent': UA,
      'accept-language': 'it-IT,it;q=0.9,en;q=0.8',
      // Referer obbligatorio sul /watch (sennò CF lo blocca con 520).
      'referer': base + '/',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: TIMEOUT,
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`AS ${path} -> ${r.status}`);
  return { html: await r.text(), base };
}

const STOPS = new Set(['di', 'il', 'la', 'le', 'gli', 'i', 'lo', 'e', 'un', 'una', 'the', 'a', 'an', 'of']);
function norm(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokenSet(s) {
  return new Set(norm(s).split(' ').filter((w) => w.length > 1 && !STOPS.has(w)));
}

// Pulisce il titolo prima di mandarlo all'API search.
// Kitsu restituisce titoli con × (MULTIPLICATION SIGN U+00D7), ":", "'", ecc.
// che il search engine non gestisce → 0 risultati. Es. "SPY×FAMILY" → "SPY x FAMILY".
function sanitizeForSearch(title) {
  return (title || '')
    .replace(/[×✕✖⨉]/g, ' x ')
    .replace(/[–—‒―]/g, '-')
    .replace(/[''‘’`]/g, '')
    .replace(/[:;"!?,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Search HTML scrape: /animelist?search=QUERY.
// L'API JSON /index.php?search=1&key=... era usata prima ma ora ritorna 520.
// Pattern HTML: <a class="badge badge-archivio badge-light" href=".../anime/SLUG">Name</a>
async function searchJson(query) {
  const base = await getBase();
  const url = `${base}/animelist?search=${encodeURIComponent(query)}`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, timeout: TIMEOUT });
    if (!r.ok) return [];
    const html = await r.text();
    const re = /<a[^>]*class="badge badge-archivio[^"]*"[^>]*href="[^"]*\/anime\/([^"]+)"[^>]*>([^<]+)</g;
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      const slug = m[1];
      const name = m[2].trim();
      if (!out.find((x) => x.link === slug)) out.push({ link: slug, name });
    }
    return out;
  } catch (_) {
    return [];
  }
}

// Cerca slug AS per (title, season). Tenta varie query se non trova la season giusta.
async function searchSlug(title, season) {
  const cleaned = sanitizeForSearch(title);
  const queries = new Set();
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
  queries.add(cleaned);
  if (season && season > 1) queries.add(`${cleaned} ${season}`);
  const beforeColon = cleaned.split(':')[0].trim();
  if (beforeColon !== cleaned && beforeColon.length >= 2) queries.add(beforeColon);
  const beforeDash = cleaned.split(' - ')[0].trim();
  if (beforeDash !== cleaned && beforeDash.length >= 2) queries.add(beforeDash);
  const wordsClean = cleaned.split(/\s+/).filter((w) => w && w !== '-');
  if (wordsClean.length >= 2) queries.add(wordsClean.slice(0, 2).join(' '));
  if (wordsClean.length > 0 && wordsClean[0].length >= 2) queries.add(wordsClean[0]);

  const allResults = new Map();
  for (const q of queries) {
    const results = await searchJson(q);
    for (const r of results) {
      if (r.link && !allResults.has(r.link)) {
        allResults.set(r.link, { slug: r.link, name: r.name || r.link });
      }
    }
  }
  const candidates = [...allResults.values()];
  if (!candidates.length) return null;

  const titleTokens = tokenSet(title);
  const identifierTokens = norm(title).split(' ').filter((w) => w.length > 1 && !STOPS.has(w)).slice(0, 2);
  // Single-letter differentiators (Z di Dragon Ball Z, X di Spy x Family)
  const singleLetterDiff = norm(title).split(' ').filter((w) => /^[a-z0-9]$/.test(w));

  function score(c) {
    const ntokens = tokenSet(c.name);
    let overlap = 0;
    for (const t of titleTokens) if (ntokens.has(t)) overlap++;
    let s = overlap / Math.max(titleTokens.size, 1);
    const slugLower = c.slug.toLowerCase();
    const nameLower = c.name.toLowerCase();

    const allText = `${c.name || ''} ${c.slug || ''}`.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
    const recTokens = new Set(allText.split(/\s+/).filter(Boolean));

    // Identifier boost: primi token presenti
    if (identifierTokens.length >= 2) {
      if (identifierTokens.every((w) => allText.includes(w))) s += 0.6;
    }

    // Single-letter differentiator: penalty se manca (Z di DBZ, X di Spy x Family)
    for (const d of singleLetterDiff) {
      if (!recTokens.has(d)) s -= 0.8;
    }

    // Penalty modificatori extra: cerco "Dragon Ball" → record "Dragon Ball Super"
    const titleAllTokens = new Set(norm(title).split(' '));
    const SEQUEL_MODIFIERS = ['kai', 'super', 'gt', 'z', 'movie', 'film', 'special', 'ova', 'ona', 'recap', 'gaiden', 'daima'];
    for (const mod of SEQUEL_MODIFIERS) {
      if (recTokens.has(mod) && !titleAllTokens.has(mod)) s -= 0.5;
    }

    if (season && season > 1) {
      if (new RegExp(`(?:^|[\\s\\-])${season}(?:$|[\\s\\-])`).test(nameLower)) s += 0.7;
      if (new RegExp(`-${season}-|-${season}$`).test(slugLower)) s += 0.5;
      if (/-\d-|-\d$/.test(slugLower) && !new RegExp(`-${season}-|-${season}$`).test(slugLower)) s -= 0.3;
    } else if (season === 1) {
      if (!/-\d-|-\d$/.test(slugLower) && !/\s\d(?:\s|$)/.test(nameLower)) s += 0.4;
    }
    if (/movie|special|ova|recap/i.test(c.name) || /movie|special|ova/i.test(c.slug)) s -= 0.5;
    return s;
  }
  candidates.sort((a, b) => score(b) - score(a));
  const best = candidates[0];
  if (!best) return null;
  // Soglia min: identifier match per anime (titoli english vs romaji)
  if (identifierTokens.length >= 2) {
    const allText = `${best.name || ''} ${best.slug || ''}`.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
    if (!identifierTokens.every((w) => allText.includes(w))) return null;
  } else {
    const bestTokens = tokenSet(best.name);
    const ov = [...titleTokens].filter((t) => bestTokens.has(t)).length / Math.max(titleTokens.size, 1);
    if (ov < 0.5) return null;
  }
  return best;
}

// Estrae URL episodio N dalla pagina /anime/SLUG
function findEpisodeUrl(html, episodeNum) {
  // Pattern AS: <a href="https://.../ep/SLUG-ep-N">
  const re = /href="(https?:\/\/[^"]+\/ep\/[^"]+-ep-(\d+(?:\.\d+)?))"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (Number.parseFloat(m[2]) === Number(episodeNum)) return m[1];
  }
  return null;
}

// Estrae URL /watch?file=TOKEN dalla pagina /ep/...
function findWatchUrl(html) {
  const m = html.match(/href="(https?:\/\/[^"]+\/watch\?file=[^"]+)"/);
  return m ? m[1] : null;
}

// Estrae URL stream dalla pagina watch.
// AS usa:
//   - MP4 diretto per molti anime nuovi (es. Demon Slayer ITA)
//   - HLS .m3u8 per anime "vecchi"/lunghi (es. Naruto, Bleach)
// Preferisco MP4 quando disponibile (compat universal), fallback su m3u8.
function extractStreamUrl(html) {
  const mp4 = [...html.matchAll(/(https?:\/\/[^\s"'<>]+?\.mp4(?:\?[^\s"'<>]*)?)/g)].map((m) => m[1]);
  const mp4Direct = mp4.find((u) => !/download[-_]file/i.test(u)) || mp4[0];
  if (mp4Direct) return { url: mp4Direct, kind: 'mp4' };
  // HLS .m3u8 (formato JwPlayer file: "...m3u8")
  const m3u8 = [...html.matchAll(/file:\s*['"](https?:\/\/[^'"]+\.m3u8(?:\?[^'"]*)?)['"]/g)].map((m) => m[1]);
  if (m3u8.length) return { url: m3u8[0], kind: 'hls' };
  // Fallback: cerca qualsiasi .m3u8 nel HTML
  const m3u8Any = [...html.matchAll(/(https?:\/\/[^\s"'<>]+?\.m3u8(?:\?[^\s"'<>]*)?)/g)].map((m) => m[1]);
  if (m3u8Any.length) return { url: m3u8Any[0], kind: 'hls' };
  return null;
}

const cache = new Map();
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 15 * 60 * 1000) return hit.v;
  const v = await fn();
  if (v) cache.set(key, { v, t: Date.now() });
  return v;
}

const animeMeta = require('../anime-meta');
async function findStreams(title, season, episode, absoluteEpisode, aliases = [], imdbId = null, providerSlugs = null) {
  if (!episode && !absoluteEpisode) return [];
  try {
    let slugInfo = null;
    // 1. Mapping diretto (preferito): itero ranked list, primo che ha episodi
    if (providerSlugs && Array.isArray(providerSlugs.as) && providerSlugs.as.length) {
      const ranked = animeMeta.rankSlugs(providerSlugs.as);
      for (const s of ranked) {
        const m = s.match(/^\/anime\/(.+)$/);
        if (!m) continue;
        try {
          const { html } = await asFetch(`/anime/${m[1]}`);
          // Valido solo se la pagina contiene almeno 1 link episodio
          if (/\/ep\/[^"]+-ep-\d+/.test(html)) {
            slugInfo = { slug: m[1], name: '' };
            break;
          }
        } catch (_) {}
      }
    }
    // 2. Cache permanente
    if (!slugInfo) {
      const cachedSlug = imdbId ? animeMeta.getProviderSlug(imdbId, 'as') : null;
      if (cachedSlug) slugInfo = { slug: cachedSlug, name: '' };
    }
    // 3. Search dinamica
    if (!slugInfo) slugInfo = await cached(`as:slug:${title}:${season}`, () => searchSlug(title, season));
    // 4. Fallback aliases
    if (!slugInfo && Array.isArray(aliases)) {
      for (const alt of aliases) {
        slugInfo = await cached(`as:slug:${alt}:${season}`, () => searchSlug(alt, season));
        if (slugInfo) break;
      }
    }
    if (!slugInfo) return [];
    if (imdbId && slugInfo.slug) animeMeta.rememberProviderSlug(imdbId, 'as', slugInfo.slug);

    const slug = slugInfo.slug;
    const { html: animeHtml, base } = await asFetch(`/anime/${slug}`);
    // Provo prima episode (in-stagione), poi absolute (per slug "globali" tipo One Piece)
    let epUrl = findEpisodeUrl(animeHtml, episode);
    if (!epUrl && absoluteEpisode) epUrl = findEpisodeUrl(animeHtml, absoluteEpisode);
    if (!epUrl) return [];

    const { html: epHtml } = await asFetch(epUrl);
    const watchUrl = findWatchUrl(epHtml);
    if (!watchUrl) return [];

    const { html: watchHtml } = await asFetch(watchUrl);
    const stream = extractStreamUrl(watchHtml);
    if (!stream) return [];

    // AS è prevalentemente SUB ITA. Marker eventuale "Ita" nel slug = audio ITA dub.
    const slugLower = slug.toLowerCase();
    const isAudioIta = /-ita(?:\b|$)/.test(slugLower);

    return [{
      provider: 'AS',
      url: stream.url,
      referer: watchUrl,
      name: slugInfo.name,
      italian: isAudioIta,
      italianSub: !isAudioIta,
      quality: null,
    }];
  } catch (e) {
    console.error('[AnimeSaturn]', e.message);
    return [];
  }
}

// Resolve diretto da slug noto (skippa search). Usato dall'endpoint lazy
// /resolve/as/{slugEnc}/{ep} chiamato AL CLICK utente. Cache 30 min.
const _resolveCache = new Map();
const _RESOLVE_TTL = 30 * 60 * 1000;
async function resolveBySlug(slug, episode, absoluteEpisode) {
  const ckey = `${slug}:${episode}:${absoluteEpisode || ''}`;
  const hit = _resolveCache.get(ckey);
  if (hit && Date.now() - hit.t < _RESOLVE_TTL) return hit.v;
  try {
    const { html: animeHtml } = await asFetch(`/anime/${slug}`);
    let epUrl = findEpisodeUrl(animeHtml, episode);
    if (!epUrl && absoluteEpisode) epUrl = findEpisodeUrl(animeHtml, absoluteEpisode);
    if (!epUrl) return null;
    const { html: epHtml } = await asFetch(epUrl);
    const watchUrl = findWatchUrl(epHtml);
    if (!watchUrl) return null;
    const { html: watchHtml } = await asFetch(watchUrl);
    const stream = extractStreamUrl(watchHtml);
    if (!stream) return null;
    const v = { url: stream.url, referer: watchUrl, kind: stream.kind };
    _resolveCache.set(ckey, { v, t: Date.now() });
    return v;
  } catch (e) {
    console.error('[AnimeSaturn resolveBySlug]', e.message);
    return null;
  }
}

module.exports = { findStreams, resolveBySlug };
