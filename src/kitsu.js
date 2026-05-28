// Kitsu API wrapper per cataloghi anime + search.
//
// Cataloghi via Kitsu JSON:API diretta (kitsu.io/api/edge/anime).
// Search via filter[text]= con relevance sort lato Kitsu.
// Meta (con lista episodi) proxy a anime-kitsu.strem.fun: è l'unico endpoint
// pubblico che restituisce videos[] correttamente formattati per Stremio.

const fetch = require('node-fetch');

const KITSU_API = 'https://kitsu.io/api/edge';
const PAGE_SIZE = 20;
const TIMEOUT = 8000;

// Cache risposte JSON: search 1h, catalog 4h, meta 24h (i metadati Kitsu
// cambiano raramente; aggressive cache risparmia round-trip).
const _cache = new Map();
function cacheGet(key, ttl) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  return null;
}
function cacheSet(key, v) {
  _cache.set(key, { v, t: Date.now() });
}

// Converte un anime record Kitsu (JSON:API) in meta object Stremio (per catalog).
// Catalogo Stremio vuole: id, type, name, poster, background, description,
// releaseInfo, imdbRating, genres.
function toStremioCatalogMeta(item) {
  const a = item.attributes || {};
  const type = a.subtype === 'movie' ? 'movie' : 'series';
  const startYear = a.startDate ? a.startDate.match(/^\d+/)?.[0] : null;
  const endYear = a.endDate ? a.endDate.match(/^\d+/)?.[0] : null;
  let releaseInfo = startYear || null;
  if (releaseInfo) {
    if (endYear && endYear !== startYear) releaseInfo = `${startYear}-${endYear}`;
    else if (a.status === 'current') releaseInfo = `${startYear}-`;
  }
  // Genres da included relationships (richiede include=genres nella query)
  const genres = [];
  if (item.relationships?.genres?.data) {
    for (const g of item.relationships.genres.data) {
      const inc = (item._includedGenres || {})[g.id];
      if (inc?.attributes?.name) genres.push(inc.attributes.name);
    }
  }
  const rating = a.averageRating
    ? (Math.round((a.averageRating / 10) * 10) / 10).toFixed(1)
    : null;
  // Titolo: preferenza canonical → en_us → en → en_jp
  const name = a.canonicalTitle
    || a.titles?.en_us
    || a.titles?.en
    || a.titles?.en_jp
    || `Anime ${item.id}`;
  return {
    id: `kitsu:${item.id}`,
    type,
    name,
    poster: a.posterImage?.medium || a.posterImage?.small || a.posterImage?.original,
    background: a.coverImage?.original || a.coverImage?.large,
    description: a.synopsis || a.description,
    releaseInfo,
    imdbRating: rating,
    genres,
    runtime: Number.isInteger(a.episodeLength) ? `${a.episodeLength} min` : null,
  };
}

// Fetch generico con cache + parsing included (per genres).
async function fetchKitsu(path, ttl) {
  const ckey = path;
  const hit = cacheGet(ckey, ttl);
  if (hit) return hit;
  try {
    const url = `${KITSU_API}${path}`;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.api+json',
        'User-Agent': 'Pezzottio/1.0',
      },
      timeout: TIMEOUT,
    });
    if (!r.ok) {
      console.error(`[kitsu] ${path} -> ${r.status}`);
      return null;
    }
    const data = await r.json();
    // Pre-indicizzo gli included (genres) per ogni item
    if (Array.isArray(data.data) && Array.isArray(data.included)) {
      const genresById = {};
      for (const inc of data.included) {
        if (inc.type === 'genres') genresById[inc.id] = inc;
      }
      for (const item of data.data) {
        item._includedGenres = genresById;
      }
    }
    cacheSet(ckey, data);
    return data;
  } catch (e) {
    console.error(`[kitsu] ${path} ERR:`, e.message);
    return null;
  }
}

// Quattro cataloghi con sort/filter diversi (corrispondono a quelli del
// reference addon che proxyava anime-kitsu.strem.fun).
const CATALOG_DEFS = {
  airing: { sort: '-userCount', extraFilter: { status: 'current' } },
  popular: { sort: '-userCount' },
  rating: { sort: '-averageRating' },
  newest: { sort: '-startDate' },
};

async function getCatalog(catalogKey, { skip = 0, genre = null, limit = PAGE_SIZE } = {}) {
  const def = CATALOG_DEFS[catalogKey];
  if (!def) return [];
  const params = new URLSearchParams();
  params.set('sort', def.sort);
  params.set('page[limit]', String(limit));
  params.set('page[offset]', String(skip));
  params.set('filter[subtype]', 'TV,OVA,ONA,movie,special');
  if (def.extraFilter?.status) params.set('filter[status]', def.extraFilter.status);
  if (genre) params.set('filter[genres]', genre);
  params.set('include', 'genres');
  const path = `/anime?${params.toString()}`;
  // Catalog: cache 4h (le liste cambiano lentamente)
  const data = await fetchKitsu(path, 4 * 60 * 60 * 1000);
  if (!data || !Array.isArray(data.data)) return [];
  return data.data.map(toStremioCatalogMeta);
}

async function search(query, { skip = 0, limit = PAGE_SIZE } = {}) {
  if (!query) return [];
  const params = new URLSearchParams();
  params.set('filter[text]', query);
  params.set('page[limit]', String(limit));
  params.set('page[offset]', String(skip));
  params.set('filter[subtype]', 'TV,OVA,ONA,movie,special');
  params.set('include', 'genres');
  const path = `/anime?${params.toString()}`;
  // Search: cache 1h (query specifiche, riusabili tra utenti)
  const data = await fetchKitsu(path, 60 * 60 * 1000);
  if (!data || !Array.isArray(data.data)) return [];
  return data.data.map(toStremioCatalogMeta);
}

// Meta con lista episodi via Kitsu API JSON:API diretta.
// Una sola chiamata con include=genres,episodes restituisce tutto (anche 220
// episodi di Naruto). Costruiamo videos[] format Stremio. Cache 24h.
//
// Note: l'addon anime-kitsu.strem.fun ha la stessa info ma blocca IP non
// residenziali con 403 (datacenter/VPN), quindi facciamo da soli.
async function getMeta(stremioType, kitsuFullId) {
  const ckey = `meta:${kitsuFullId}`;
  const hit = cacheGet(ckey, 24 * 60 * 60 * 1000);
  if (hit) return hit;
  const kitsuId = kitsuFullId.replace('kitsu:', '').split(':')[0];
  if (!kitsuId) return null;
  try {
    const path = `/anime/${kitsuId}?include=genres,episodes`;
    const data = await fetchKitsu(path, 24 * 60 * 60 * 1000);
    if (!data || !data.data) return null;
    const a = data.data.attributes || {};
    const isMovie = a.subtype === 'movie';
    const type = isMovie ? 'movie' : 'series';

    // Indicizza included per tipo
    const includedByType = {};
    for (const inc of (data.included || [])) {
      if (!includedByType[inc.type]) includedByType[inc.type] = [];
      includedByType[inc.type].push(inc);
    }
    const genres = (includedByType.genres || []).map((g) => g.attributes?.name).filter(Boolean);
    const episodes = includedByType.episodes || [];

    // Build releaseInfo
    const startYear = a.startDate ? a.startDate.match(/^\d+/)?.[0] : null;
    const endYear = a.endDate ? a.endDate.match(/^\d+/)?.[0] : null;
    let releaseInfo = startYear || null;
    if (releaseInfo) {
      if (endYear && endYear !== startYear) releaseInfo = `${startYear}-${endYear}`;
      else if (a.status === 'current') releaseInfo = `${startYear}-`;
    }
    const rating = a.averageRating
      ? (Math.round((a.averageRating / 10) * 10) / 10).toFixed(1)
      : null;
    const name = a.canonicalTitle
      || a.titles?.en_us || a.titles?.en || a.titles?.en_jp
      || `Anime ${kitsuId}`;

    // Build videos[] dagli episodi
    let videos = null;
    if (!isMovie && episodes.length) {
      const sorted = episodes.slice().sort((x, y) => Number(x.attributes?.number || 0) - Number(y.attributes?.number || 0));
      videos = sorted.map((ep) => {
        const ea = ep.attributes || {};
        const num = Number(ea.number) || null;
        const epTitle = ea.titles?.en_us || ea.titles?.en || ea.canonicalTitle || ea.titles?.en_jp || `Episode ${num}`;
        return {
          id: `kitsu:${kitsuId}:${num}`,
          title: epTitle,
          season: 1,
          episode: num,
          released: ea.airdate ? new Date(ea.airdate).toISOString() : undefined,
          thumbnail: ea.thumbnail?.original,
          overview: ea.synopsis || ea.description,
        };
      }).filter((v) => v.episode != null);
    } else if (!isMovie && a.episodeCount) {
      // Fallback: solo placeholder S1E1..S1EN (per anime senza episodi popolati in Kitsu)
      videos = [];
      for (let i = 1; i <= a.episodeCount; i++) {
        videos.push({ id: `kitsu:${kitsuId}:${i}`, title: `Episode ${i}`, season: 1, episode: i });
      }
    }

    // Aliases (titoli alternativi): utili per il search e display
    const aliases = [a.titles?.en_us, a.titles?.en, a.titles?.en_jp, ...(a.abbreviatedTitles || [])]
      .filter(Boolean)
      .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);

    const meta = {
      id: kitsuFullId.includes(':') ? `kitsu:${kitsuId}` : kitsuFullId,
      kitsu_id: kitsuId,
      type,
      name,
      slug: a.slug,
      aliases,
      poster: a.posterImage?.medium || a.posterImage?.small || a.posterImage?.original,
      background: a.coverImage?.original || a.coverImage?.large,
      description: a.synopsis || a.description,
      releaseInfo,
      year: releaseInfo,
      imdbRating: rating,
      genres,
      runtime: Number.isInteger(a.episodeLength) ? `${a.episodeLength} min` : null,
      videos,
      links: rating ? [{ name: rating, category: 'imdb', url: `https://kitsu.io/anime/${a.slug || kitsuId}` }] : [],
    };
    // Rimuovi undefined/null leaf per output pulito
    const cleanMeta = Object.fromEntries(Object.entries(meta).filter(([_, v]) => v != null));
    const out = { meta: cleanMeta };
    cacheSet(ckey, out);
    return out;
  } catch (e) {
    console.error(`[kitsu meta] ${kitsuFullId} ERR:`, e.message);
    return null;
  }
}

module.exports = { getCatalog, search, getMeta, CATALOG_DEFS };
