// AnimeWorld scraper — implementazione originale.
// Strategia:
//   1. Cerca anime via /filter?keyword=...
//   2. Trova slug della stagione giusta (es. "boku-no-hero-academia-3" per MHA S3)
//   3. Va su /play/SLUG, trova token episodio richiesto
//   4. Va su /play/SLUG/TOKEN, estrae URL MP4 diretto
const fetch = require('node-fetch');

const BASES = ['https://www.animeworld.ac', 'https://www.animeworld.so', 'https://www.animeworld.tv'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
const TIMEOUT = 7000;

// Cache di base URL "vivo" (alcuni mirror cambiano)
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

async function awFetch(path) {
  const base = await getBase();
  const r = await fetch(base + path, {
    headers: { 'user-agent': UA, 'accept-language': 'it-IT,it;q=0.9,en;q=0.8' },
    timeout: TIMEOUT,
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`AW ${path} -> ${r.status}`);
  return { html: await r.text(), base };
}

// Stop word italiane comuni nei titoli, da non considerare in similarity
const STOPS = new Set(['di', 'il', 'la', 'le', 'gli', 'i', 'lo', 'e', 'un', 'una', 'il', 'la', 'the', 'a', 'an', 'of']);

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

// Pulisce il titolo prima di mandarlo all'URL search.
// Kitsu restituisce titoli con × (MULTIPLICATION SIGN U+00D7), ":", "'", ecc.
// che il search engine non gestisce → 0 risultati. Es. "SPY×FAMILY" → "SPY x FAMILY".
function sanitizeForSearch(title) {
  return (title || '')
    .replace(/[×✕✖⨉]/g, ' x ')        // moltiplicazione → x letterale
    .replace(/[–—‒―]/g, '-')          // dash unicode → trattino ASCII
    .replace(/[''‘’`]/g, '')          // apostrofi
    .replace(/[:;"!?,.]/g, ' ')       // punteggiatura
    .replace(/\s+/g, ' ')
    .trim();
}

// Cerca slug AnimeWorld per (title, season). Se season > 1, preferisce
// slug che termina con "-N" o contiene parole tipo "2nd-season", "season-3".
async function searchSlug(title, season) {
  const cleaned = sanitizeForSearch(title);
  // Multi-query: AW filtra meglio CON il `:` originale (es. "Re:Zero" trova S1+S2+S3,
  // "Re Zero" pulito trova solo recent). Provo titolo raw + cleaned + variants.
  const queries = new Set();
  if (title) {
    queries.add(title.trim());
    // Prime 2 parole RAW (preservando ':' originale) — AW filtra molto meglio
    // con prefisso corto. Es. "Re: Zero - Starting Life..." → "Re: Zero" → "Re:Zero"
    // che è la SOLA query che trova S1+S2+S3 (non solo S4).
    const rawWords = title.split(/\s+/).filter((w) => w.length > 0);
    if (rawWords.length >= 2) {
      const first2 = rawWords.slice(0, 2).join(' ');
      queries.add(first2);
      const first2NoSpace = first2.replace(/\s*:\s*/g, ':');
      if (first2NoSpace !== first2) queries.add(first2NoSpace);
    }
    // Variant senza spazi attorno a ":" sul titolo completo
    const colonNoSpace = title.replace(/\s*:\s*/g, ':').trim();
    if (colonNoSpace !== title.trim()) queries.add(colonNoSpace);
  }
  queries.add(cleaned);
  const beforeColon = cleaned.split(':')[0].trim();
  if (beforeColon !== cleaned && beforeColon.length >= 2) queries.add(beforeColon);
  const beforeDash = cleaned.split(' - ')[0].trim();
  if (beforeDash !== cleaned && beforeDash.length >= 2) queries.add(beforeDash);
  const wordsClean = cleaned.split(/\s+/).filter((w) => w && w !== '-');
  if (wordsClean.length >= 2) queries.add(wordsClean.slice(0, 2).join(' '));
  if (wordsClean.length > 0 && wordsClean[0].length >= 2) queries.add(wordsClean[0]);

  const seen = new Map();
  for (const q of queries) {
    try {
      const enc = encodeURIComponent(q);
      // /api/search ritorna JSON con HTML dei risultati. Molto meglio di /filter
      // che è una vista "homepage" filtrata e nasconde anime vecchi (es. DBZ).
      const base = await getBase();
      const r = await fetch(`${base}/api/search?keyword=${enc}`, {
        headers: { 'user-agent': UA, 'x-requested-with': 'XMLHttpRequest', 'accept': 'application/json' },
        timeout: TIMEOUT,
      });
      if (!r.ok) continue;
      const data = await r.json();
      const html = data.html || '';
      // Estrae slug + nome dal HTML del risultato
      const itemMatches = [...html.matchAll(/href="play\/([^"]+)"[^>]*>(?:<img[^>]*>)?<\/a>[\s\S]*?<a class="name"[^>]*>([^<]+)/g)];
      for (const m of itemMatches) {
        const slug = m[1];
        const name = m[2].trim();
        if (!seen.has(slug)) seen.set(slug, { slug, name });
      }
    } catch (_) {}
  }
  const candidates = [...seen.values()];
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

    const allText = `${c.name || ''} ${c.slug || ''}`.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
    const recTokens = new Set(allText.split(/\s+/).filter(Boolean));

    // Identifier boost: primi token presenti
    if (identifierTokens.length >= 2) {
      const hasAllIdentifiers = identifierTokens.every((w) => allText.includes(w));
      if (hasAllIdentifiers) s += 0.6;
    }

    // Single-letter differentiator: penalty se manca (Z di DBZ, X di Spy x Family)
    for (const d of singleLetterDiff) {
      if (!recTokens.has(d)) s -= 0.8;
    }

    // Modificatori extra → reject hard: se cerco "Dragon Ball" ma record è
    // "Dragon Ball Super" → è la serie sbagliata, score negativo enorme.
    // Identifica varianti dello stesso titolo base.
    const titleAllTokens = new Set(norm(title).split(' '));
    const SEQUEL_MODIFIERS = ['kai', 'super', 'gt', 'z', 'movie', 'film', 'special', 'ova', 'ona', 'recap', 'gaiden', 'daima'];
    for (const mod of SEQUEL_MODIFIERS) {
      if (recTokens.has(mod) && !titleAllTokens.has(mod)) s -= 2;
    }

    // Bonus se slug match stagione richiesta
    if (season && season > 1) {
      const slugLower = c.slug.toLowerCase();
      if (new RegExp(`-${season}\\b|season[\\s\\-_]?${season}\\b|${season}(?:st|nd|rd|th)`).test(slugLower)) s += 0.5;
      else if (slugLower.match(/-\d/)) s -= 0.2; // ha altra season number
    } else if (season === 1) {
      // S1 → preferisce slug senza suffisso stagione
      const slugLower = c.slug.toLowerCase();
      if (!/-\d|season[\s\-_]?\d|nd-season|rd-season|th-season/.test(slugLower)) s += 0.3;
    }
    // Penalty per spinoff
    if (/movie|special|ova|recap/i.test(c.name) || /movie|special|ova/i.test(c.slug)) s -= 0.5;
    return s;
  }
  candidates.sort((a, b) => score(b) - score(a));
  const best = candidates[0];
  if (!best) return null;
  // Soglia min: score >= 0.5 (con tutti i penalty applicati). Score basso = no match
  // affidabile, meglio null che mostrare anime sbagliato.
  if (score(best) < 0.5) return null;
  // Identifier check finale: il record DEVE contenere i primi token significativi
  if (identifierTokens.length >= 2) {
    const allText = `${best.name || ''} ${best.slug || ''}`.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
    if (!identifierTokens.every((w) => allText.includes(w))) return null;
  } else {
    const bestTokens = tokenSet(best.name);
    const ov = [...titleTokens].filter((t) => bestTokens.has(t)).length / Math.max(titleTokens.size, 1);
    if (ov < 0.5) return null;
  }
  // Single-letter differentiator obbligatorio: se cerco "Dragon Ball Z" e record
  // non contiene "z" → reject (anche se identifier match)
  const bestRecText = `${best.name || ''} ${best.slug || ''}`.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
  const bestRecTokens = new Set(bestRecText.split(/\s+/).filter(Boolean));
  for (const d of singleLetterDiff) {
    if (!bestRecTokens.has(d)) return null;
  }
  return best;
}

// Estrae token episodio per N richiesto dalla pagina /play/SLUG
function findEpisodeToken(html, episodeNum) {
  // Pattern reale AnimeWorld:
  //   data-episode-num="1" data-num="1" ... href="/play/SLUG/TOKEN"
  const items = [...html.matchAll(/data-episode-num="(\d+(?:\.\d+)?)"[^>]*href="\/play\/[^\/"]+\/([^"]+)"/g)];
  if (!items.length) return null;
  for (const m of items) {
    if (Number.parseFloat(m[1]) === Number(episodeNum)) return m[2];
  }
  return null;
}

// Estrae URL MP4 dalla pagina /play/SLUG/TOKEN
function extractMp4(html) {
  // AnimeWorld espone l'URL diretto del file MP4 nel HTML.
  // Cerco TUTTI i .mp4 e preferisco il link diretto (no download-file.php).
  const matches = [...html.matchAll(/(https?:\/\/[^\s"'<>]+?\.mp4(?:\?[^\s"'<>]*)?)/g)].map((m) => m[1]);
  if (!matches.length) return null;
  // Preferisco URL "diretto" (no download-file.php nello stream)
  const direct = matches.find((u) => !/download[-_]file/i.test(u));
  return direct || matches[0];
}

// Cache risultati search per 15 min
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
    // 1. Mapping diretto via animemapping.realbestia.com (preferito, accuratezza 100%)
    // Itero ranked list, primo che ha pagina valida
    if (providerSlugs && Array.isArray(providerSlugs.aw) && providerSlugs.aw.length) {
      const ranked = animeMeta.rankSlugs(providerSlugs.aw);
      for (const s of ranked) {
        const m = s.match(/^\/play\/(.+)$/);
        if (!m) continue;
        try {
          const { html } = await awFetch(`/play/${m[1]}`);
          if (/data-episode-num="\d+"/.test(html)) {
            slugInfo = { slug: m[1], name: '' };
            break;
          }
        } catch (_) {}
      }
    }
    // 2. Cache permanente IMDB → slug AW
    if (!slugInfo) {
      const cachedSlug = imdbId ? animeMeta.getProviderSlug(imdbId, 'aw') : null;
      if (cachedSlug) slugInfo = { slug: cachedSlug, name: '' };
    }
    // 3. Search dinamica con titolo Cinemeta
    if (!slugInfo) slugInfo = await cached(`aw:slug:${title}:${season}`, () => searchSlug(title, season));
    // 4. Fallback su aliases AniList
    if (!slugInfo && Array.isArray(aliases)) {
      for (const alt of aliases) {
        slugInfo = await cached(`aw:slug:${alt}:${season}`, () => searchSlug(alt, season));
        if (slugInfo) break;
      }
    }
    if (!slugInfo) return [];
    if (imdbId && slugInfo.slug) animeMeta.rememberProviderSlug(imdbId, 'aw', slugInfo.slug);

    const slug = slugInfo.slug;
    const base = await getBase();
    const { html: playHtml } = await awFetch(`/play/${slug}`);
    let token = findEpisodeToken(playHtml, episode);
    if (!token && absoluteEpisode) token = findEpisodeToken(playHtml, absoluteEpisode);
    if (!token) return [];

    // AW non espone più il MP4 direttamente nella pagina /play/SLUG/TOKEN.
    // Il vero URL si ottiene via API: /api/episode/serverPlayerAnimeWorld?id=TOKEN
    // Restituisce HTML con il MP4 diretto embedded.
    const apiUrl = `${base}/api/episode/serverPlayerAnimeWorld?id=${token}`;
    const apiRes = await fetch(apiUrl, {
      headers: {
        'user-agent': UA,
        'accept-language': 'it-IT,it;q=0.9,en;q=0.8',
        'x-requested-with': 'XMLHttpRequest',
        'referer': `${base}/play/${slug}/${token}`,
      },
      timeout: TIMEOUT,
    });
    if (!apiRes.ok) return [];
    const epHtml = await apiRes.text();
    const mp4 = extractMp4(epHtml);
    if (!mp4) return [];

    const epUrl = `${base}/play/${slug}`;
    // Determina audio/sub dalla slug:
    // - "slug-ita" → audio ITA (es. one-piece-ita)
    // - "slug-subita" → sub ITA esplicito (es. one-piece-subita)
    // - default → sub ITA (la maggior parte degli anime su AW sono sub ITA)
    const slugLower = slug.toLowerCase();
    const isAudioIta = /-ita\b/.test(slugLower);
    const isSubIta = /-subita\b|-sub-ita\b/.test(slugLower) || !isAudioIta;

    return [{
      provider: 'AW',
      url: mp4,
      referer: epUrl,
      name: slugInfo.name,
      italian: isAudioIta,
      italianSub: isSubIta && !isAudioIta,
      quality: null, // AW non espone la quality
    }];
  } catch (e) {
    console.error('[AnimeWorld]', e.message);
    return [];
  }
}

// Resolve diretto da slug noto (skippa search). Usato dall'endpoint lazy
// /resolve/aw/{slugEnc}/{ep} che viene chiamato AL CLICK utente (non a /stream).
// Ritorna { url, referer } o null. Cache 30 min interna.
const _resolveCache = new Map();
const _RESOLVE_TTL = 30 * 60 * 1000;
async function resolveBySlug(slug, episode, absoluteEpisode) {
  const ckey = `${slug}:${episode}:${absoluteEpisode || ''}`;
  const hit = _resolveCache.get(ckey);
  if (hit && Date.now() - hit.t < _RESOLVE_TTL) return hit.v;
  try {
    const base = await getBase();
    const { html: playHtml } = await awFetch(`/play/${slug}`);
    let token = findEpisodeToken(playHtml, episode);
    if (!token && absoluteEpisode) token = findEpisodeToken(playHtml, absoluteEpisode);
    if (!token) return null;
    const apiUrl = `${base}/api/episode/serverPlayerAnimeWorld?id=${token}`;
    const apiRes = await fetch(apiUrl, {
      headers: {
        'user-agent': UA,
        'accept-language': 'it-IT,it;q=0.9,en;q=0.8',
        'x-requested-with': 'XMLHttpRequest',
        'referer': `${base}/play/${slug}/${token}`,
      },
      timeout: TIMEOUT,
    });
    if (!apiRes.ok) return null;
    const epHtml = await apiRes.text();
    const mp4 = extractMp4(epHtml);
    if (!mp4) return null;
    const v = { url: mp4, referer: `${base}/play/${slug}` };
    _resolveCache.set(ckey, { v, t: Date.now() });
    return v;
  } catch (e) {
    console.error('[AnimeWorld resolveBySlug]', e.message);
    return null;
  }
}

module.exports = { findStreams, resolveBySlug };
