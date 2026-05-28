// Anime metadata: alias multi-titolo + mapping permanente IMDB↔slug provider.
//
// 1. AniList GraphQL: da titolo Cinemeta → romaji/english/native/synonyms
//    + anilistId + malId
// 2. ani.zip: da anilistId → IMDB/TMDB/Kitsu/MAL/TVDB id (cross-mapping)
// 3. File cache assets/anime-mapping.json: per ogni imdbId, salva slug AW/AS/AU
//    trovati durante l'uso. Lookup successivi saltano la search dinamica.

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const ANIZIP_ENDPOINT = 'https://api.ani.zip/mappings';
const PROVIDER_MAPPING_ENDPOINT = 'https://animemapping.realbestia.com';
const TIMEOUT = 5000;

const ANIME_MAP_PATH = path.join(__dirname, '..', 'assets', 'anime-mapping.json');

const ANILIST_QUERY = `
  query ($search: String) {
    Media(search: $search, type: ANIME) {
      id
      idMal
      title { romaji english native }
      synonyms
      seasonYear
    }
  }
`;

// In-memory cache (24h) — evita hit ridondanti su AniList/ani.zip
const aliasCache = new Map();
const ALIAS_TTL = 24 * 60 * 60 * 1000;

// File-backed mapping IMDB→{providers: {aw, as, au}, aliases}
let _animeMap = null;
function loadAnimeMap() {
  if (_animeMap) return _animeMap;
  try {
    if (fs.existsSync(ANIME_MAP_PATH)) {
      _animeMap = JSON.parse(fs.readFileSync(ANIME_MAP_PATH, 'utf8'));
    } else {
      _animeMap = {};
    }
  } catch (_) {
    _animeMap = {};
  }
  return _animeMap;
}

let _saveTimer = null;
function scheduleSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    try {
      const dir = path.dirname(ANIME_MAP_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(ANIME_MAP_PATH, JSON.stringify(_animeMap, null, 2));
    } catch (_) {}
  }, 5000);
}

// AniList lookup per ottenere aliases
async function fetchAniListAliases(title) {
  try {
    const r = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: title } }),
      timeout: TIMEOUT,
    });
    if (!r.ok) return null;
    const data = await r.json();
    const m = data?.data?.Media;
    if (!m) return null;
    const titles = [
      m.title?.romaji,
      m.title?.english,
      m.title?.native,
      ...(Array.isArray(m.synonyms) ? m.synonyms : []),
    ].filter(Boolean);
    const seen = new Set();
    const aliases = [];
    for (const t of titles) {
      const norm = t.toLowerCase().trim();
      if (!seen.has(norm)) {
        seen.add(norm);
        aliases.push(t);
      }
    }
    return { aliases, anilistId: m.id, malId: m.idMal };
  } catch (_) {
    return null;
  }
}

// Ritorna { aliases, anilistId, malId } per un titolo anime
async function getMetadata(title, imdbId) {
  const key = `meta:${(title || '').toLowerCase().trim()}`;
  const hit = aliasCache.get(key);
  if (hit && Date.now() - hit.t < ALIAS_TTL) return hit.v;

  // Se abbiamo già il mapping per questo imdbId nel file, usalo come hint
  const map = loadAnimeMap();
  if (imdbId && map[imdbId] && Array.isArray(map[imdbId].aliases)) {
    const v = { aliases: map[imdbId].aliases, anilistId: map[imdbId].anilistId, malId: map[imdbId].malId };
    aliasCache.set(key, { v, t: Date.now() });
    return v;
  }

  const r = await fetchAniListAliases(title);
  const v = r || { aliases: [], anilistId: null, malId: null };
  aliasCache.set(key, { v, t: Date.now() });

  // Salva nel file mapping per look-up futuri istantanei
  if (imdbId && r) {
    if (!map[imdbId]) map[imdbId] = {};
    map[imdbId].aliases = r.aliases;
    if (r.anilistId) map[imdbId].anilistId = r.anilistId;
    if (r.malId) map[imdbId].malId = r.malId;
    scheduleSave();
  }
  return v;
}

// Backward-compat helper
async function getAliases(title) {
  const r = await getMetadata(title, null);
  return r.aliases;
}

// Provider slugs cross-mapping via animemapping.realbestia.com.
// Per ogni ID anime (kitsu/mal/imdb/tmdb/anilist/anidb) ritorna lista di slug
// AW/AS/AU PRE-MAPPATI. Bypassa completamente search/scoring/matching.
const providerSlugsCache = new Map();
async function fetchProviderSlugs(idSource, idValue) {
  const ck = `${idSource}:${idValue}`;
  const hit = providerSlugsCache.get(ck);
  if (hit && Date.now() - hit.t < 24 * 60 * 60 * 1000) return hit.v;
  try {
    const r = await fetch(`${PROVIDER_MAPPING_ENDPOINT}/${idSource}/${idValue}`, { timeout: TIMEOUT });
    if (!r.ok) {
      providerSlugsCache.set(ck, { v: null, t: Date.now() });
      return null;
    }
    const data = await r.json();
    if (!data.ok || !data.mappings) {
      providerSlugsCache.set(ck, { v: null, t: Date.now() });
      return null;
    }
    const v = {
      aw: data.mappings.animeworld || [],
      as: data.mappings.animesaturn || [],
      au: data.mappings.animeunity || [],
      otherIds: data.mappings.ids || {},
    };
    providerSlugsCache.set(ck, { v, t: Date.now() });
    return v;
  } catch (_) {
    providerSlugsCache.set(ck, { v: null, t: Date.now() });
    return null;
  }
}

// Lookup unificato: prova tutti gli ID disponibili (kitsu/mal/anilist/imdb/tmdb)
// in PARALLELO, ritorna il primo non-null. Prima era sequenziale (kitsu→mal→...),
// con latenza fino a 5×TIMEOUT se i primi ID rispondevano 404. Parallelo:
// ~1×TIMEOUT, taglia 2-3s sul cold path per anime.
async function getProviderSlugs({ kitsuId, malId, anilistId, imdbId, tmdbId }) {
  const sources = [];
  if (kitsuId) sources.push(['kitsu', kitsuId]);
  if (malId) sources.push(['mal', malId]);
  if (anilistId) sources.push(['anilist', anilistId]);
  if (imdbId) sources.push(['imdb', imdbId]);
  if (tmdbId) sources.push(['tmdb', tmdbId]);
  if (!sources.length) return null;
  // Lancia tutte le richieste in parallelo. Ritorna la PRIMA che risponde
  // con dati validi (mappings non-null). Promise.any non disponibile su Node
  // vecchi → emulo con race + filtro null.
  return new Promise((resolve) => {
    let pending = sources.length;
    let resolved = false;
    for (const [src, id] of sources) {
      fetchProviderSlugs(src, id).then((r) => {
        if (resolved) return;
        pending--;
        if (r) { resolved = true; resolve(r); return; }
        if (pending === 0 && !resolved) { resolved = true; resolve(null); }
      }).catch(() => {
        pending--;
        if (pending === 0 && !resolved) { resolved = true; resolve(null); }
      });
    }
  });
}

// Sceglie il slug "migliore" da una lista: preferisce audio italiano (-ita),
// poi sub italiano, poi qualsiasi
function pickBestSlug(slugs) {
  const ranked = rankSlugs(slugs);
  return ranked[0] || null;
}

// Ritorna i slug in ordine di preferenza (audio ITA > sub ITA > default).
// Utile quando il primo slug del mapping è "stale" e il provider deve provare
// il prossimo in lista.
function rankSlugs(slugs) {
  if (!Array.isArray(slugs) || !slugs.length) return [];
  const audioIta = slugs.filter((s) => /(?:^|[^a-z])(?:ita|ITA)(?:$|[^a-z])/.test(s) && !/sub[-_]?ita/i.test(s));
  const subIta = slugs.filter((s) => /sub[-_]?ita/i.test(s));
  const others = slugs.filter((s) => !audioIta.includes(s) && !subIta.includes(s));
  const seen = new Set();
  const out = [];
  for (const s of [...audioIta, ...subIta, ...others]) {
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

// API per i provider: salva lo slug trovato per un imdbId, riusabile next time
function rememberProviderSlug(imdbId, provider, value) {
  if (!imdbId || !provider || !value) return;
  const map = loadAnimeMap();
  if (!map[imdbId]) map[imdbId] = {};
  if (!map[imdbId].providers) map[imdbId].providers = {};
  if (map[imdbId].providers[provider] !== value) {
    map[imdbId].providers[provider] = value;
    scheduleSave();
  }
}

function getProviderSlug(imdbId, provider) {
  if (!imdbId || !provider) return null;
  const map = loadAnimeMap();
  return map[imdbId]?.providers?.[provider] || null;
}

module.exports = {
  getMetadata,
  getAliases,
  rememberProviderSlug,
  getProviderSlug,
  loadAnimeMap,
  getProviderSlugs,
  pickBestSlug,
  rankSlugs,
};
