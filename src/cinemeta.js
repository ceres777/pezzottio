const fetch = require('node-fetch');
const animeMeta = require('./anime-meta');

const CINEMETA = 'https://v3-cinemeta.strem.io';
const KITSU = 'https://anime-kitsu.strem.fun';
const ANIZIP = 'https://api.ani.zip/mappings';
const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY || '4ef0d7355d9ffb5151e987764708ce96';

// Cache 24h per titolo italiano (TMDB)
const _italianTitleCache = new Map();
async function fetchItalianTitle(imdbId, kind) {
  const ck = `${imdbId}:${kind}`;
  const hit = _italianTitleCache.get(ck);
  if (hit && Date.now() - hit.t < 24 * 60 * 60 * 1000) return hit.v;
  try {
    const r = await fetch(
      `${TMDB_API}/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id&language=it-IT`,
      { timeout: 6000 }
    );
    if (!r.ok) { _italianTitleCache.set(ck, { v: null, t: Date.now() }); return null; }
    const d = await r.json();
    const arr = kind === 'movie' ? d.movie_results : d.tv_results;
    if (!arr || !arr.length) { _italianTitleCache.set(ck, { v: null, t: Date.now() }); return null; }
    const t = kind === 'movie' ? arr[0].title : arr[0].name;
    _italianTitleCache.set(ck, { v: t || null, t: Date.now() });
    return t || null;
  } catch (_) { return null; }
}

// Map prefisso Stremio → campo query di ani.zip
// (ani.zip è il mapper più completo per anime; gestisce anche tmdb/imdb/tvdb)
const ID_TO_ANIZIP_FIELD = {
  mal: 'mal_id',
  myanimelist: 'mal_id',
  anilist: 'anilist_id',
  anidb: 'anidb_id',
  tmdb: 'themoviedb_id',
  themoviedb: 'themoviedb_id',
  tvdb: 'thetvdb_id',
  thetvdb: 'thetvdb_id',
};

// Cache mapping id 24h (mapping stabile per definizione)
const _mapCache = new Map();
async function _mapId(field, sourceId) {
  const ck = `${field}:${sourceId}`;
  const hit = _mapCache.get(ck);
  if (hit && Date.now() - hit.t < 24 * 60 * 60 * 1000) return hit.v;
  try {
    const r = await fetch(`${ANIZIP}?${field}=${encodeURIComponent(sourceId)}`, { timeout: 6000 });
    if (!r.ok) return null;
    const d = await r.json();
    const m = d?.mappings || null;
    _mapCache.set(ck, { v: m, t: Date.now() });
    return m;
  } catch (_) {
    return null;
  }
}

async function resolveTitle(type, id) {
  const r = await _resolveTitleInner(type, id);
  if (!r) return null;
  const { meta, sourceIds } = r;
  if (!meta) return null;
  // Arricchimento per anime: lookup slug AW/AS/AU via animemapping.realbestia.com
  // Fire-and-forget: kick off la richiesta ma NON aspettiamo. Il chiamante
  // (addon.js) ottiene la Promise e la awaita in parallelo con altre fetch
  // così resolveTitle non blocca per 2-3s ogni /stream di anime.
  if (meta.type === 'anime') {
    meta.providerSlugsPromise = animeMeta.getProviderSlugs(sourceIds || {})
      .then((slugs) => { if (slugs) meta.providerSlugs = slugs; return slugs; })
      .catch(() => null);
  }
  return meta;
}

// Inner: ritorna { meta, sourceIds } dove sourceIds raccoglie tutti gli ID
// alternative recuperati durante il resolve (utili per il mapping providerSlugs).
async function _resolveTitleInner(type, id) {
  if (!id) return null;
  if (id.startsWith('kitsu:')) {
    const parts = id.split(':');
    const kitsuId = parts[1];
    const tail = parts.slice(2).join(':'); // episode (absolute)
    // Recupero altri ID via ani.zip
    const m = await _mapId('kitsu_id', kitsuId).catch(() => null);
    const sourceIds = {
      kitsuId,
      malId: m?.mal_id,
      anilistId: m?.anilist_id,
      imdbId: m?.imdb_id,
      tmdbId: m?.themoviedb_id,
      tvdbId: m?.thetvdb_id,
      anidbId: m?.anidb_id,
    };
    // Provo prima il resolver Kitsu nativo
    let meta = await resolveKitsu(id).catch(() => null);
    // Fallback: se anime-kitsu addon è bloccato (403 da IP datacenter/VPN),
    // ricalo via IMDB (numerazione assoluta → S1)
    if (!meta && m?.imdb_id) {
      const newId = tail ? `${m.imdb_id}:1:${tail}` : m.imdb_id;
      meta = await resolveImdb(type, newId).catch(() => null);
      if (meta) meta._imdbResolved = m.imdb_id;
    }
    if (!meta) return null;
    if (m?.imdb_id) meta._imdbResolved = m.imdb_id;
    return { meta, sourceIds };
  }
  if (id.startsWith('tt')) {
    const meta = await resolveImdb(type, id);
    if (!meta) return null;
    const imdbId = id.split(':')[0];
    const m = await _mapId('imdb_id', imdbId).catch(() => null);
    const sourceIds = {
      imdbId,
      kitsuId: m?.kitsu_id,
      malId: m?.mal_id,
      anilistId: m?.anilist_id,
      tmdbId: m?.themoviedb_id,
      tvdbId: m?.thetvdb_id,
      anidbId: m?.anidb_id,
    };
    return { meta, sourceIds };
  }

  // Id non-Stremio (mal:, anilist:, tmdb:, tvdb:, anidb:, ecc.)
  const parts = id.split(':');
  const prefix = parts[0].toLowerCase();
  const sourceId = parts[1];
  const tail = parts.slice(2).join(':');

  const field = ID_TO_ANIZIP_FIELD[prefix];
  if (field && sourceId) {
    const m = await _mapId(field, sourceId);
    if (m) {
      const SINGLE_EP = new Set(['mal', 'myanimelist', 'anilist', 'anidb']);
      const isSingleEp = SINGLE_EP.has(prefix);
      // sourceIds raccoglie il mapping completo da ani.zip
      const sourceIds = {
        kitsuId: m.kitsu_id,
        malId: m.mal_id,
        anilistId: m.anilist_id,
        imdbId: m.imdb_id,
        tmdbId: m.themoviedb_id,
        tvdbId: m.thetvdb_id,
        anidbId: m.anidb_id,
      };

      if (isSingleEp) {
        if (m.kitsu_id) {
          const newId = `kitsu:${m.kitsu_id}${tail ? ':' + tail : ''}`;
          const meta = await resolveKitsu(newId);
          if (meta) { if (m.imdb_id) meta._imdbResolved = m.imdb_id; return { meta, sourceIds }; }
        }
        if (m.imdb_id) {
          const newId = tail ? `${m.imdb_id}:1:${tail}` : m.imdb_id;
          const meta = await resolveImdb(type, newId);
          if (meta) { meta._imdbResolved = m.imdb_id; return { meta, sourceIds }; }
        }
      } else {
        if (m.imdb_id) {
          const newId = tail ? `${m.imdb_id}:${tail}` : m.imdb_id;
          const meta = await resolveImdb(type, newId);
          if (meta) { meta._imdbResolved = m.imdb_id; return { meta, sourceIds }; }
        }
        if (m.kitsu_id) {
          const newId = tail ? `kitsu:${m.kitsu_id}:${tail}` : `kitsu:${m.kitsu_id}`;
          const meta = await resolveKitsu(newId);
          if (meta) { if (m.imdb_id) meta._imdbResolved = m.imdb_id; return { meta, sourceIds }; }
        }
      }
    }
  }

  // Fallback TMDB diretto: se ani.zip non ha mapping
  if (prefix === 'tmdb' || prefix === 'themoviedb') {
    try {
      const kind = type === 'series' ? 'tv' : 'movie';
      const r = await fetch(`${TMDB_API}/${kind}/${sourceId}/external_ids?api_key=${TMDB_KEY}`, { timeout: 6000 });
      if (r.ok) {
        const data = await r.json();
        if (data.imdb_id) {
          const newId = tail ? `${data.imdb_id}:${tail}` : data.imdb_id;
          const meta = await resolveImdb(type, newId);
          if (meta) {
            meta._imdbResolved = data.imdb_id;
            return { meta, sourceIds: { tmdbId: sourceId, imdbId: data.imdb_id, tvdbId: data.tvdb_id } };
          }
        }
      }
    } catch (_) {}
  }

  return null;
}

// Anime detection: serie con genere "Animation" + country giapponese (o country
// mancante). Esclude esplicitamente cartoon US/UK (BoJack, Bluey, Family Guy, ecc.).
function detectAnime(meta) {
  const genres = meta.genres || [];
  if (!genres.some((g) => /animation|anime/i.test(g))) return false;
  const country = (meta.country || '').toLowerCase();
  // Se Cinemeta sa che è non-Japan, NON è anime
  if (country && !/japan/i.test(country)) return false;
  return true;
}

async function resolveImdb(type, id) {
  const [imdb, season, episode] = id.split(':');
  const metaType = type === 'series' ? 'series' : 'movie';
  const res = await fetch(`${CINEMETA}/meta/${metaType}/${imdb}.json`);
  if (!res.ok) return null;
  const { meta } = await res.json();
  if (!meta) return null;
  const isAnime = metaType === 'series' && detectAnime(meta);
  // Offset broadcast vs Cinemeta count per anime con disallineamento noto.
  // Per One Piece il broadcast count è +1 rispetto alla somma Cinemeta delle stagioni.
  const ABSOLUTE_OFFSET = {
    tt0388629: 1, // One Piece
  };
  let absoluteEpisode = null;
  if (isAnime && season != null && episode != null) {
    const targetS = parseInt(season, 10);
    const targetE = parseInt(episode, 10);
    const videos = (meta.videos || []).filter((v) => Number(v.season) > 0);
    const previous = videos.filter((v) => Number(v.season) < targetS).length;
    const offset = ABSOLUTE_OFFSET[imdb] || 0;
    absoluteEpisode = previous + targetE + offset;
  }
  // Nome dell'episodio (se serie + S/E specificati)
  let episodeTitle = null;
  if (metaType === 'series' && season != null && episode != null) {
    const ep = (meta.videos || []).find(
      (v) => Number(v.season) === parseInt(season, 10) && Number(v.episode) === parseInt(episode, 10)
    );
    if (ep && ep.name) episodeTitle = ep.name;
  }
  // Titolo italiano via TMDB (cache 24h)
  const italianTitle = await fetchItalianTitle(imdb, metaType);
  // Per anime: aliases romaji/english/native (providerSlugs viene aggiunto
  // dal wrapper resolveTitle dopo aver raccolto tutti gli ID).
  let animeAliases = [];
  if (isAnime) {
    try {
      const md = await animeMeta.getMetadata(meta.name, imdb);
      animeAliases = md?.aliases || [];
    } catch (_) {}
  }
  return {
    title: meta.name,
    italianTitle: italianTitle || meta.name,
    year: meta.year ? String(meta.year).slice(0, 4) : null,
    type: isAnime ? 'anime' : metaType,
    season: season ? parseInt(season, 10) : null,
    episode: episode ? parseInt(episode, 10) : null,
    absoluteEpisode,
    episodeTitle,
    animeAliases,
    imdbId: imdb,
  };
}

async function resolveKitsu(id) {
  const parts = id.split(':');
  const kitsuId = parts[1];
  const episode = parts[2] ? parseInt(parts[2], 10) : null;
  const res = await fetch(`${KITSU}/meta/series/kitsu:${kitsuId}.json`);
  if (!res.ok) return null;
  const { meta } = await res.json();
  if (!meta) return null;
  return {
    title: meta.name,
    italianTitle: meta.name, // Kitsu non ha titoli IT, manteniamo l'originale
    year: meta.year ? String(meta.year).slice(0, 4) : null,
    type: 'anime',
    season: null,
    episode,
  };
}

module.exports = { resolveTitle };
