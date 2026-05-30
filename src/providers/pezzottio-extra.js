// Pezzottio Extra catalog provider — TMDB-based, sostituisce il proxy AIOMetadata.
// Espone cataloghi streaming (Netflix, Prime, Disney+, ecc.) sia per IT che EN
// chiamando direttamente TMDB /discover con with_watch_providers + watch_region.
// Nessuna dipendenza da servizi terzi (no più 403/banning AIOMetadata).
//
// Endpoint Stremio supportati:
//   GET /manifest.json                            → manifest addon
//   GET /catalog/:type/:catalogId.json            → lista metas
//   GET /catalog/:type/:catalogId/:extra.json     → con genre/skip/search
//   GET /meta/:type/tmdb:<id>.json                → meta singolo

const fetch = require('node-fetch');

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY || '';
const IMG_BASE = 'https://image.tmdb.org/t/p';
const TIMEOUT = 8000;
const PAGE_SIZE = 20; // TMDB ritorna 20 per pagina

// Provider IDs TMDB. NB: gli ID variano per region (es. Prime Video = 119 in IT,
// 9 in US perché TMDB ha duplicato l'entry per il marketplace italiano). Lista
// sempre aggiornabile via https://api.themoviedb.org/3/watch/providers/movie?watch_region=XX
// Provider con tmdbId mancante per una region NON viene esposto in quella region.
const PROVIDERS = {
  netflix:     { tmdbId: { IT: 8,    US: 8 },    label: 'Netflix' },
  prime:       { tmdbId: { IT: 119,  US: 9 },    label: 'Prime Video' },
  disney:      { tmdbId: { IT: 337,  US: 337 },  label: 'Disney+' },
  apple:       { tmdbId: { IT: 350,  US: 350 },  label: 'Apple TV+' },
  hbomax:      { tmdbId: { IT: 1899, US: 1899 }, label: 'HBO Max' },
  hulu:        { tmdbId: { US: 15 },             label: 'Hulu' },
  discovery:   { tmdbId: { US: 520 },            label: 'Discovery+' },
  starz:       { tmdbId: { US: 43 },             label: 'Starz' },
  paramount:   { tmdbId: { IT: 531,  US: 2303 }, label: 'Paramount+' },
  peacock:     { tmdbId: { US: 386 },            label: 'Peacock' },
  // SkyShowtime esiste in EU (NL/SE/DK/ES/PT) ma NON in US su TMDB. Rimosso da CATALOGS_BY_REGION.US.
  skyshowtime: { tmdbId: { IT: 1773 },           label: 'SkyShowtime' },
  crunchyroll: { tmdbId: { IT: 283,  US: 283 },  label: 'Crunchyroll' },
  // IT-specific
  nowtv:       { tmdbId: { IT: 39 },             label: 'NOW TV' },
  mediaset:    { tmdbId: { IT: 359 },            label: 'Mediaset Infinity' },
  raiplay:     { tmdbId: { IT: 222 },            label: 'RaiPlay' },
  timvision:   { tmdbId: { IT: 109 },            label: 'TimVision' },
  skygo:       { tmdbId: { IT: 29 },             label: 'Sky Go' },
};

// Lista cataloghi per region. Solo provider con tmdbId definito per quella region.
const CATALOGS_BY_REGION = {
  IT: ['netflix', 'prime', 'disney', 'apple', 'hbomax', 'paramount', 'skygo', 'nowtv', 'mediaset', 'raiplay', 'timvision', 'crunchyroll'],
  US: ['netflix', 'prime', 'disney', 'apple', 'hbomax', 'paramount', 'peacock', 'hulu', 'discovery', 'starz', 'crunchyroll'],
};

// Generi TMDB Movie (https://api.themoviedb.org/3/genre/movie/list)
const GENRES_MOVIE = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
  53: 'Thriller', 10752: 'War', 37: 'Western',
};
// Generi TMDB TV (https://api.themoviedb.org/3/genre/tv/list)
const GENRES_TV = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk',
  10768: 'War & Politics', 37: 'Western',
};
const ALL_GENRE_NAMES = [...new Set([...Object.values(GENRES_MOVIE), ...Object.values(GENRES_TV)])].sort();

// Cache in-memory: catalog 10min, meta 1h.
const _cacheCat = new Map(); const CACHE_CAT_TTL = 10 * 60 * 1000;
const _cacheMeta = new Map(); const CACHE_META_TTL = 60 * 60 * 1000;
function _cacheGet(map, key, ttl) {
  const hit = map.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  return null;
}
function _cacheSet(map, key, v) {
  map.set(key, { v, t: Date.now() });
  if (map.size > 500) { const k = map.keys().next().value; map.delete(k); }
}

// ─────────────────────────────────────────────────────────────────────
// Manifest
// ─────────────────────────────────────────────────────────────────────
// Label dei type esposti a Stremio (visibili come tab nel Discover).
// IT: "Film" / "Serie" (come AIOMetadata IT precedente, coerente con Stremio italiano).
// EN: "Movies" / "TV Series" (chiaro per utenti EN).
// Search catalogs invece restano col type standard 'movie'/'series' perché Stremio
// usa quei type per la search bar globale — i custom non funzionano per search.
const TYPE_LABELS = {
  IT: { movie: 'Film', series: 'Serie' },
  US: { movie: 'Movies', series: 'TV Series' },
};

function buildManifest(region) {
  const isEN = region === 'US';
  const labels = TYPE_LABELS[region] || TYPE_LABELS.US;
  const provs = CATALOGS_BY_REGION[region] || CATALOGS_BY_REGION.US;
  const catalogs = [];
  for (const key of provs) {
    const p = PROVIDERS[key];
    if (!p) continue;
    // Safety: skippa provider che non hanno ID TMDB per questa region
    if (!p.tmdbId || !p.tmdbId[region]) continue;
    const extra = [
      { name: 'genre', options: ALL_GENRE_NAMES, isRequired: false },
      { name: 'skip', isRequired: false },
    ];
    catalogs.push({
      id: `pezzottio-extra-${key}-movie`,
      type: labels.movie,
      name: p.label,
      pageSize: PAGE_SIZE,
      extra,
      showInHome: true,
    });
    catalogs.push({
      id: `pezzottio-extra-${key}-series`,
      type: labels.series,
      name: p.label,
      pageSize: PAGE_SIZE,
      extra,
      showInHome: true,
    });
  }
  // Search cataloghi — type standard per consentire search globale di Stremio.
  catalogs.push({
    id: 'pezzottio-extra-search-movie',
    type: 'movie',
    name: isEN ? 'Search results' : 'Risultati ricerca',
    extra: [{ name: 'search', isRequired: true }, { name: 'skip' }],
  });
  catalogs.push({
    id: 'pezzottio-extra-search-series',
    type: 'series',
    name: isEN ? 'Search results' : 'Risultati ricerca',
    extra: [{ name: 'search', isRequired: true }, { name: 'skip' }],
  });
  return {
    id: isEN ? 'org.pezzottio.extracatalogs.en' : 'org.pezzottio.extracatalogs',
    version: '2.0.0',
    name: isEN ? 'Pezzottio Extra (English)' : 'Pezzottio Extra',
    description: isEN
      ? 'Netflix, Prime Video, Disney+, HBO Max, Apple TV+, Paramount+, Peacock, Hulu, Crunchyroll catalog — English edition. Powered by TMDB.'
      : 'Catalogo Netflix, Prime Video, Disney+, HBO Max, Apple TV+, Sky Go, NOW TV, Mediaset, RaiPlay, TimVision, Crunchyroll integrato in Pezzottio. Powered by TMDB.',
    resources: ['catalog', 'meta'],
    // Lista types deve includere TUTTI quelli usati nei catalog (custom + standard).
    types: [labels.movie, labels.series, 'movie', 'series'],
    idPrefixes: ['tmdb:'],
    catalogs,
    behaviorHints: { configurable: false, configurationRequired: false },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Fetch wrapper con timeout + JSON parsing
// ─────────────────────────────────────────────────────────────────────
async function _tmdbFetch(path, qs) {
  if (!TMDB_KEY) throw new Error('TMDB_API_KEY env mancante');
  const q = new URLSearchParams({ api_key: TMDB_KEY, ...qs });
  const url = `${TMDB_API}${path}?${q.toString()}`;
  const r = await fetch(url, { timeout: TIMEOUT, headers: { 'Accept': 'application/json' } });
  if (!r.ok) {
    console.error(`[extra TMDB] ${path} → ${r.status}`);
    return null;
  }
  return r.json();
}

// Inverse lookup: nome genere → id TMDB (movie + tv merged)
function _genreNameToId(name, tmdbKind) {
  const dict = tmdbKind === 'movie' ? GENRES_MOVIE : GENRES_TV;
  const entry = Object.entries(dict).find(([, v]) => v === name);
  return entry ? entry[0] : null;
}

// Trasforma item TMDB in meta Stremio
function _itemToMeta(item, stremioType, tmdbKind) {
  const genreDict = tmdbKind === 'movie' ? GENRES_MOVIE : GENRES_TV;
  const dateRaw = item.release_date || item.first_air_date || '';
  return {
    id: `tmdb:${item.id}`,
    type: stremioType,
    name: item.title || item.name || '',
    poster: item.poster_path ? `${IMG_BASE}/w500${item.poster_path}` : null,
    background: item.backdrop_path ? `${IMG_BASE}/original${item.backdrop_path}` : null,
    description: item.overview || '',
    releaseInfo: dateRaw ? dateRaw.substring(0, 4) : null,
    genres: (item.genre_ids || []).map((id) => genreDict[id]).filter(Boolean),
    imdbRating: item.vote_average ? Number(item.vote_average).toFixed(1) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Catalog handler
// ─────────────────────────────────────────────────────────────────────
async function fetchCatalog({ catalogId, region, language, extra }) {
  // catalogId: pezzottio-extra-{provider}-{movie|series}
  const m = catalogId.match(/^pezzottio-extra-(.+)-(movie|series)$/);
  if (!m) return { metas: [] };
  const provKey = m[1];
  const stremioType = m[2];
  const tmdbKind = stremioType === 'movie' ? 'movie' : 'tv';

  const skip = parseInt((extra && extra.skip) || '0', 10);
  const page = Math.max(1, Math.floor(skip / PAGE_SIZE) + 1);
  const genreName = extra && extra.genre;
  const genreId = genreName ? _genreNameToId(genreName, tmdbKind) : null;

  const cacheKey = `cat:${region}:${language}:${catalogId}:p${page}:g${genreName || ''}:s${(extra && extra.search) || ''}`;
  const hit = _cacheGet(_cacheCat, cacheKey, CACHE_CAT_TTL);
  if (hit) return hit;

  let result;
  if (provKey === 'search') {
    const query = (extra && extra.search) || '';
    if (!query) return { metas: [] };
    const data = await _tmdbFetch(`/search/${tmdbKind}`, { language, query, page });
    result = { metas: (data?.results || []).map((it) => _itemToMeta(it, stremioType, tmdbKind)) };
  } else {
    const prov = PROVIDERS[provKey];
    if (!prov) return { metas: [] };
    // Risolvi tmdbId per region (Prime IT=119, Prime US=9, etc.)
    const tmdbId = prov.tmdbId && prov.tmdbId[region];
    if (!tmdbId) return { metas: [] }; // provider non disponibile in questa region
    const qs = {
      language,
      watch_region: region,
      with_watch_providers: tmdbId,
      page,
      sort_by: 'popularity.desc',
      include_adult: 'false',
    };
    if (genreId) qs.with_genres = genreId;
    const data = await _tmdbFetch(`/discover/${tmdbKind}`, qs);
    result = { metas: (data?.results || []).map((it) => _itemToMeta(it, stremioType, tmdbKind)) };
  }

  _cacheSet(_cacheCat, cacheKey, result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// Meta handler (per quando Stremio richiede dettagli del singolo titolo)
// ─────────────────────────────────────────────────────────────────────
async function fetchMeta({ stremioType, id, language }) {
  const m = id.match(/^tmdb:(\d+)$/);
  if (!m) return null;
  const tmdbId = m[1];
  const tmdbKind = stremioType === 'movie' ? 'movie' : 'tv';
  const cacheKey = `meta:${language}:${tmdbKind}:${tmdbId}`;
  const hit = _cacheGet(_cacheMeta, cacheKey, CACHE_META_TTL);
  if (hit) return hit;

  const data = await _tmdbFetch(`/${tmdbKind}/${tmdbId}`, { language, append_to_response: 'external_ids,videos,credits' });
  if (!data) return null;

  const meta = {
    id: `tmdb:${tmdbId}`,
    type: stremioType,
    name: data.title || data.name || '',
    poster: data.poster_path ? `${IMG_BASE}/w500${data.poster_path}` : null,
    background: data.backdrop_path ? `${IMG_BASE}/original${data.backdrop_path}` : null,
    logo: null,
    description: data.overview || '',
    releaseInfo: (data.release_date || data.first_air_date || '').substring(0, 4) || null,
    genres: (data.genres || []).map((g) => g.name),
    imdbRating: data.vote_average ? Number(data.vote_average).toFixed(1) : null,
    runtime: data.runtime ? `${data.runtime} min` : (data.episode_run_time?.[0] ? `${data.episode_run_time[0]} min` : null),
    cast: (data.credits?.cast || []).slice(0, 6).map((c) => c.name),
    director: (data.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name),
    country: (data.production_countries || []).map((c) => c.name).join(', '),
    language: data.original_language || null,
    imdb_id: data.external_ids?.imdb_id || null,
  };

  // Per series: aggiungiamo videos (episodi). TMDB API list_seasons → fetch ogni season.
  if (stremioType === 'series' && Array.isArray(data.seasons)) {
    const videos = [];
    // Per evitare 50+ API call, ci limitiamo alle seasons con season_number > 0
    // e prendiamo solo la lista episodes via single /tv/{id}/season/{n}
    // (TMDB ritorna gli episodi della season specifica)
    const validSeasons = data.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0).slice(0, 30);
    const seasonData = await Promise.all(validSeasons.map(async (s) => {
      try {
        return await _tmdbFetch(`/tv/${tmdbId}/season/${s.season_number}`, { language });
      } catch (_) { return null; }
    }));
    for (const sd of seasonData) {
      if (!sd || !Array.isArray(sd.episodes)) continue;
      for (const ep of sd.episodes) {
        videos.push({
          id: `tmdb:${tmdbId}:${sd.season_number}:${ep.episode_number}`,
          title: ep.name || `Episode ${ep.episode_number}`,
          season: sd.season_number,
          episode: ep.episode_number,
          released: ep.air_date ? new Date(ep.air_date).toISOString() : null,
          overview: ep.overview || '',
          thumbnail: ep.still_path ? `${IMG_BASE}/w300${ep.still_path}` : null,
        });
      }
    }
    meta.videos = videos;
  }

  _cacheSet(_cacheMeta, cacheKey, meta);
  return meta;
}

module.exports = { buildManifest, fetchCatalog, fetchMeta, PROVIDERS, CATALOGS_BY_REGION };
