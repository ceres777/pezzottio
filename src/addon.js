const { addonBuilder } = require('stremio-addon-sdk');
const { getConfig } = require('./config');
const { resolveTitle } = require('./cinemeta');
const { searchTorrents, distributeByQuality } = require('./search');
const { isHDR } = require('./parse');
const { getCurrentUserConfig, encodeConfig } = require('./config');
const debrid = require('./debrid');
const animeworld = require('./providers/animeworld');
const animesaturn = require('./providers/animesaturn');
const animeunity = require('./providers/animeunity');
const animeMeta = require('./anime-meta');
const kitsu = require('./kitsu');
const vidxgo = require('./providers/vidxgo');
const vixsrc = require('./providers/vixsrc');
const external = require('./providers/external');
const { findFileForEpisode } = require('./parse');

const PUBLIC_HOST = process.env.PUBLIC_HOST || 'https://pezz8io.dpdns.org';

// Generi Kitsu (selezione: i più usati). Permette filter dropdown in Stremio.
const KITSU_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Sci-Fi', 'Mystery', 'Magic',
  'Supernatural', 'Fantasy', 'Romance', 'Horror', 'Psychological', 'Thriller',
  'Martial Arts', 'School', 'Sports', 'Historical', 'Mecha', 'Music',
  'Slice of Life', 'Ecchi', 'Harem', 'Demons', 'Samurai', 'Game', 'Police',
  'Military', 'Vampire',
];

const manifest = {
  id: 'org.pezzottio.addon',
  version: require('../package.json').version,
  name: 'PEZZOTTIO',
  description: 'Lo streaming italiano senza menate. Cerca film, serie e anime su 30+ tracker e mette sempre in cima l\'audio italiano. Integrazione con Torbox per riproduzione istantanea. Proxy HLS integrato server-side: niente MediaFlowProxy, niente Docker, niente VPS da configurare. Setup in 30 secondi.',
  logo: `${PUBLIC_HOST}/logo.png`,
  background: `${PUBLIC_HOST}/background.png`,
  resources: ['stream', 'catalog', 'meta'],
  types: ['movie', 'series', 'anime'],
  // Tutti i prefissi id che gestiamo. Per quelli non-Stremio (mal/anilist/tmdb/tvdb/cr)
  // cinemeta.js mappa via api.ani.zip → kitsu o imdb prima di proseguire.
  // Per cr: e id sconosciuti, l'addon prova comunque a chiedere agli external addon.
  idPrefixes: ['tt', 'kitsu', 'mal', 'anilist', 'anidb', 'tmdb', 'themoviedb', 'tvdb', 'thetvdb', 'cr', 'crunchyroll'],
  // Cataloghi anime backed da Kitsu API. Search via filter[text]= con relevance
  // sort lato Kitsu. Metadata (lista episodi) proxata a anime-kitsu.strem.fun.
  catalogs: [
    // Search catalog DUPLICATO su 3 type: anime/series/movie.
    // Stremio invoca la ricerca globale SOLO sui catalog di type 'movie' o
    // 'series' — i catalog 'anime' sono ignorati dalla search bar (vengono
    // mostrati solo in browse). Per essere trovabili da "cerca naruto" servono
    // anche le varianti series + movie. Il handler filtra i meta per type
    // così ogni catalog ritorna solo gli anime del suo tipo.
    {
      id: 'pezzottio-anime-search',
      type: 'anime',
      name: 'Pezzottio Anime',
      extra: [{ name: 'search', isRequired: true }],
    },
    {
      id: 'pezzottio-anime-search-series',
      type: 'series',
      name: 'Pezzottio Anime',
      extra: [{ name: 'search', isRequired: true }],
    },
    {
      id: 'pezzottio-anime-search-movie',
      type: 'movie',
      name: 'Pezzottio Anime',
      extra: [{ name: 'search', isRequired: true }],
    },
    {
      id: 'pezzottio-anime-airing',
      type: 'anime',
      name: 'Pezzottio Anime — In Onda',
      extra: [
        { name: 'genre', options: KITSU_GENRES, isRequired: false },
        { name: 'skip', isRequired: false },
      ],
    },
    {
      id: 'pezzottio-anime-popular',
      type: 'anime',
      name: 'Pezzottio Anime — Più Popolari',
      extra: [
        { name: 'genre', options: KITSU_GENRES, isRequired: false },
        { name: 'skip', isRequired: false },
      ],
    },
    {
      id: 'pezzottio-anime-rating',
      type: 'anime',
      name: 'Pezzottio Anime — Top Rated',
      extra: [
        { name: 'genre', options: KITSU_GENRES, isRequired: false },
        { name: 'skip', isRequired: false },
      ],
    },
    {
      id: 'pezzottio-anime-newest',
      type: 'anime',
      name: 'Pezzottio Anime — Nuovi',
      extra: [
        { name: 'genre', options: KITSU_GENRES, isRequired: false },
        { name: 'skip', isRequired: false },
      ],
    },
  ],
  behaviorHints: { configurable: true, configurationRequired: false },
  // Claim ownership su stremio-addons.net
  stremioAddonsConfig: {
    issuer: 'https://stremio-addons.net',
    signature: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..3fIQWfqwbzHGL6P9UvAngA.LcudAJW7FwNDl521fQkod87KxlHviVTdqpQ7zMrnYkW2YgSqru0K_onYgVKA_IwQ4AmUWFkCaEXVTjAFbmidASTtFrCp5-1NdzUL7GyHV3I2keOrEv8VC0LeZ47B8YMp.__902l7Gg0XjYisQjoX9Iw',
  },
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
  try {
    const meta = await resolveTitle(type, id);
    // Stremio id completo (tt0903747:1:1 / kitsu:45398:1 / tmdb:30983:1:1 ecc.) —
    // serve agli addon esterni che capiscono i loro formati nativi.
    const fullStremioId = id;

    // Anche se la nostra resolveTitle fallisce (es. cr: / id sconosciuti),
    // proviamo comunque a chiedere agli addon esterni — capiranno loro l'id.
    if (!meta) {
      const externalOnly = await external.searchExternal(type, fullStremioId).catch(() => []);
      if (!externalOnly.length) return { streams: [] };
      // Formatto come torrent stream basico
      const streams = externalOnly.slice(0, getConfig().maxResults).map((t) => ({
        name: `Pezzottio ${t.provider}\n${t.quality || 'SD'}`,
        title: `${t.title}\n👤 ${t.seeds ?? 0}  💾 ${t.sizeText || '?'}  ⚙️ ${t.provider}`,
        infoHash: t.infoHash,
        sources: t.trackers || [],
        behaviorHints: {},
      }));
      return { streams, cacheMaxAge: 5 * 60 };
    }

    // IMDb id per i provider HTTP (VidXgo/VixSrc usano tt direttamente).
    // Se l'id non è tt ma resolveTitle ha trovato un mapping (es. tmdb:30983 →
    // tt0131179 internamente), proviamo a recuperare l'imdb dal meta originale.
    let imdbId = id.startsWith('tt') ? id.split(':')[0] : null;
    if (!imdbId && meta._imdbResolved) imdbId = meta._imdbResolved;

    const isAnime = meta.type === 'anime';
    const isMovie = type === 'movie';
    const httpProviderArgs = [meta.title, meta.season, meta.episode, meta.absoluteEpisode, meta.animeAliases || [], meta.imdbId || imdbId, meta.providerSlugs];

    // Master timeout per ogni fetch. 2-3s per TUTTO. Per anime gli stream HTTP
    // arrivano come "lazy URL placeholder" (vedi sotto): zero attesa per la
    // chain di fetch, la risoluzione avviene SOLO al click utente su /resolve.
    const CAP_MS = isAnime ? 3000 : 2000;
    const raceTimeout = (p, def) => Promise.race([
      p,
      new Promise((r) => setTimeout(() => r(def), CAP_MS)),
    ]);

    // providerSlugsPromise è kick-startato in resolveTitle ma non awaited
    // (fire-and-forget): lo awaiteremo in parallelo con torrent/external/etc.
    // Cap 2.5s sul wait: se animemapping è lento, falliamo open (= fallback
    // a findStreams classico per i provider mancanti).
    const slugsPromise = isAnime
      ? Promise.race([
          meta.providerSlugsPromise || Promise.resolve(null),
          new Promise((r) => setTimeout(() => r(null), 2500)),
        ]).then((s) => s || meta.providerSlugs || null)
      : Promise.resolve(null);

    // Risultati paralleli: torrent + external + slugs animemapping
    const [torrentsRaw, externalStreams, vxStream, scStream, slugsResult] = await Promise.all([
      raceTimeout(searchTorrents(meta, type, imdbId), []),
      raceTimeout(external.searchExternal(type, fullStremioId).catch(() => []), []),
      (!isAnime && imdbId)
        ? raceTimeout(vidxgo.findStream(imdbId, meta.season, meta.episode, isMovie).catch(() => null), null)
        : Promise.resolve(null),
      (!isAnime && imdbId)
        ? raceTimeout(vixsrc.findStream(imdbId, meta.season, meta.episode, isMovie).catch(() => null), null)
        : Promise.resolve(null),
      slugsPromise,
    ]);

    const publicHost = process.env.PUBLIC_HOST || `http://${getConfig().host}:${getConfig().port}`;
    const httpStreams = [];

    // === LAZY HTTP STREAMS (anime) ===
    // Se animemapping conosce gli slug AW/AS/AU per questo anime, emetto
    // placeholder INSTANT (zero chain di fetch). La URL è il nostro endpoint
    // /resolve/{prov}/... che fa la chain solo AL CLICK dell'utente.
    // Per AU usiamo la URL diretta /hls/au/* (già lazy via proxy HLS).
    const ranked = {
      aw: (slugsResult && slugsResult.aw) ? animeMeta.rankSlugs(slugsResult.aw) : [],
      as: (slugsResult && slugsResult.as) ? animeMeta.rankSlugs(slugsResult.as) : [],
      au: (slugsResult && slugsResult.au) ? animeMeta.rankSlugs(slugsResult.au) : [],
    };
    const epNum = meta.episode || meta.absoluteEpisode;
    const absParam = meta.absoluteEpisode ? `?abs=${meta.absoluteEpisode}` : '';

    if (isAnime && ranked.aw.length) {
      const top = ranked.aw[0]; // /play/SLUG
      const m = top.match(/^\/play\/(.+)$/);
      if (m && epNum) {
        const slugEnc = Buffer.from(m[1], 'utf8').toString('base64url');
        const isAudioIta = /-ita\b/.test(m[1]);
        httpStreams.push({
          provider: 'AW',
          url: `${publicHost}/resolve/aw/${slugEnc}/${epNum}${absParam}`,
          italian: isAudioIta,
          italianSub: !isAudioIta,
          quality: null,
        });
      }
    }
    if (isAnime && ranked.as.length) {
      const top = ranked.as[0]; // /anime/SLUG
      const m = top.match(/^\/anime\/(.+)$/);
      if (m && epNum) {
        const slugEnc = Buffer.from(m[1], 'utf8').toString('base64url');
        const isAudioIta = /-ita(?:\b|$)/i.test(m[1]);
        httpStreams.push({
          provider: 'AS',
          url: `${publicHost}/resolve/as/${slugEnc}/${epNum}${absParam}`,
          italian: isAudioIta,
          italianSub: !isAudioIta,
          quality: null,
        });
      }
    }
    if (isAnime && ranked.au.length) {
      const top = ranked.au[0]; // /anime/ID-SLUG
      const m = top.match(/^\/anime\/(\d+)-(.+)$/);
      if (m && epNum) {
        const auId = m[1];
        const slug = m[2];
        const isAudioIta = /-ita$/.test(slug);
        httpStreams.push({
          provider: 'AU',
          url: `${publicHost}/hls/au/${auId}/1/${epNum}/master.m3u8`,
          italian: isAudioIta,
          italianSub: !isAudioIta,
          quality: null,
        });
      }
    }

    // === FALLBACK findStreams (provider SENZA slug in animemapping) ===
    // Se animemapping non ha lo slug per un provider, fallback al vecchio
    // findStreams (search dinamica + chain), in parallelo con cap 3s.
    // Anime NON mappati: tentiamo comunque AW/AS/AU via search.
    const needFallbackAW = isAnime && !ranked.aw.length;
    const needFallbackAS = isAnime && !ranked.as.length;
    const needFallbackAU = isAnime && !ranked.au.length;
    if (needFallbackAW || needFallbackAS || needFallbackAU) {
      const [awFb, asFb, auFb] = await Promise.all([
        needFallbackAW ? raceTimeout(animeworld.findStreams(...httpProviderArgs).catch(() => []), []) : Promise.resolve([]),
        needFallbackAS ? raceTimeout(animesaturn.findStreams(...httpProviderArgs).catch(() => []), []) : Promise.resolve([]),
        needFallbackAU ? raceTimeout(animeunity.findStreams(...httpProviderArgs).catch(() => []), []) : Promise.resolve([]),
      ]);
      httpStreams.push(...awFb, ...asFb, ...auFb.map((s) => ({
        ...s,
        url: `${publicHost}/hls/au/${s.animeId}/1/${s.episodeNum}/master.m3u8`,
      })));
    }
    // VidXgo: il CDN ha session/IP pinning sul token (token risolto da IP X
    // funziona solo se richiesto dallo stesso IP). Bypass non praticabile →
    // proxy URL come prima. ~half della banda HLS resta sul server.
    if (vxStream) {
      const s = vxStream.isMovie ? 'movie' : vxStream.season;
      const e = vxStream.isMovie ? 'movie' : vxStream.episode;
      const proxyUrl = `${publicHost}/hls/vx/${vxStream.numericId}/${s}/${e}/master.m3u8`;
      httpStreams.push({
        provider: 'GS',
        url: proxyUrl,
        name: meta.title,
        italian: true,
        italianSub: false,
        quality: null,
      });
    }
    // VixSrc: proxy via /hls/sc/* (ripristinato dopo cambi server-side di
     // vixsrc.to che hanno rotto l'emit diretto del playlist URL).
    if (scStream) {
      const s = scStream.isMovie ? 'movie' : scStream.season;
      const e = scStream.isMovie ? 'movie' : scStream.episode;
      const proxyUrl = `${publicHost}/hls/sc/${scStream.tmdbId}/${s}/${e}/master.m3u8`;
      httpStreams.push({
        provider: 'SC',
        url: proxyUrl,
        name: meta.title,
        italian: true,
        italianSub: false,
        quality: null,
      });
    }
    // Merge torrent scraper interni + risultati addon esterni (Torrentio ecc.)
    // Dedupe per infoHash. Riordino per tier ITA → quality → seeds (come fa search.js).
    const QUALITY_RANK = { '4K': 5, '1080p': 4, '720p': 3, '480p': 2, CAM: 1 };
    const qrank = (q) => QUALITY_RANK[q] || 0;
    const tier = (r) => (r.italian ? 0 : r.italianSub ? 1 : 2);
    function mergeTorrents(...lists) {
      const seen = new Set();
      const out = [];
      for (const list of lists) {
        for (const r of list) {
          if (!r || !r.infoHash || seen.has(r.infoHash)) continue;
          seen.add(r.infoHash);
          out.push(r);
        }
      }
      out.sort((a, b) => {
        const td = tier(a) - tier(b);
        if (td !== 0) return td;
        const qd = qrank(b.quality) - qrank(a.quality);
        if (qd !== 0) return qd;
        return (b.seeds || 0) - (a.seeds || 0);
      });
      return out;
    }
    let torrents = mergeTorrents(torrentsRaw, externalStreams);
    if (!torrents.length && !httpStreams.length) return { streams: [] };

    // Filtri specifici per singoli anime (no-4K, ecc.)
    // One Piece: i 4K BILI sono upscale senza sub, sempre. Toglili.
    const NO_4K_IDS = new Set(['tt0388629']);
    if (imdbId && NO_4K_IDS.has(imdbId)) {
      torrents = torrents.filter((t) => t.quality !== '4K');
    }

    const providers = debrid.activeProviders();
    const provider = providers[0] || null; // primo, per backward compat (poolSize)
    const maxResults = getConfig().maxResults;
    const poolSize = !providers.length ? maxResults : 150;
    // Full ITA: filtra il pool torrent per audio italiano (esclude sub ITA e
    // release senza marker). Vedi anche il filtro su httpStreams sotto.
    const _userCfg = getCurrentUserConfig() || {};
    const _fullIta = _userCfg.fullIta === true || _userCfg.fullIta === 'true';
    const torrentsForPool = _fullIta ? torrents.filter((t) => t.italian) : torrents;
    const candidates = distributeByQuality(torrentsForPool, poolSize);

    // Filename hint per Stremio: nei pack/multi-file aiuta a scegliere il file giusto
    function buildFilenameHint() {
      if (!meta.season || !meta.episode) return null;
      const s = String(meta.season).padStart(2, '0');
      const e = String(meta.episode).padStart(2, '0');
      const parts = [`S${s}E${e}`];
      if (meta.absoluteEpisode) {
        parts.push(`- ${String(meta.absoluteEpisode).padStart(2, '0')}`);
        parts.push(`- ${meta.absoluteEpisode}`);
      }
      return parts.join('|');
    }
    const filenameHint = buildFilenameHint();
    const bingeGroup = imdbId ? `pezzottio-${imdbId}` : null;

    // === RENDERING "PREMIUM" ===
    // Estrae i badge tecnici (source / codec / HDR / audio) dal nome del torrent.
    // Vanno su una riga dedicata sotto il titolo per scansione veloce.
    function extractBadges(name) {
      const out = [];
      // Source
      if (/\bremux\b/i.test(name)) out.push('REMUX');
      if (/\bblu-?ray\b|\bbdrip\b|\bbrrip\b/i.test(name)) out.push('BluRay');
      else if (/\bweb[-.\s]?dl\b/i.test(name)) out.push('WEB-DL');
      else if (/\bwebrip\b/i.test(name)) out.push('WEBRip');
      else if (/\bhdtv\b/i.test(name)) out.push('HDTV');
      else if (/\bdvdrip\b/i.test(name)) out.push('DVDRip');
      // Codec
      if (/\bav1\b/i.test(name)) out.push('AV1');
      else if (/\bhevc|h\.?265|x265\b/i.test(name)) out.push('HEVC');
      else if (/\bx264|h\.?264|avc\b/i.test(name)) out.push('AVC');
      // HDR
      if (/\bdolby[\s._-]?vision|\bdv\b/i.test(name)) out.push('DV');
      if (/\bhdr10\+|\bhdr10plus/i.test(name)) out.push('HDR10+');
      else if (/\bhdr\b/i.test(name)) out.push('HDR');
      // Audio
      if (/\batmos\b/i.test(name)) out.push('Atmos');
      else if (/\btruehd\b/i.test(name)) out.push('TrueHD');
      else if (/\bdts[-.\s]?hd\b/i.test(name)) out.push('DTS-HD');
      return out;
    }

    // Rimuove i tag [Provider] ridondanti dal nome (compaiono già in ⚙️)
    const PROVIDER_BRACKETS_RE = /\s*\[(TPB|YTS|EZTV|Nyaa|Knaben|Solid|BS|CSR|MediaFusion|Comet|StremThru|Torrentio)\]\s*/gi;

    // Costruisco la prima riga del title: titolo italiano + (anno) o + S/E
    const displayTitle = meta.italianTitle || meta.title;
    function buildTitleHeader() {
      if (type === 'series' && meta.season && meta.episode) {
        const s = String(meta.season).padStart(2, '0');
        const e = String(meta.episode).padStart(2, '0');
        const sxe = `S${s}E${e}`;
        const epPart = meta.episodeTitle ? `${sxe} · ${meta.episodeTitle}` : sxe;
        return `${displayTitle}\n${epPart}`;
      }
      return meta.year ? `${displayTitle} (${meta.year})` : displayTitle;
    }
    const titleHeader = buildTitleHeader();

    // 3 stili di formattazione selezionabili dall'utente in /configure:
    //   - default 'pezzottio': layout proprietario Netflix-style
    //   - 'aios': formato standard parsabile da AIOStreams e simili
    //   - 'torrentio': layout classico stile Torrentio (utenti Stremio storici)
    const aiosFormatter = require('./aiostreams-formatter');
    const torrentioFormatter = require('./torrentio-formatter');
    const userCfgEarly = getCurrentUserConfig() || {};
    // Backward compat: 'aios:true' legacy = stile aios
    let formatStyle = userCfgEarly.style || 'pezzottio';
    if (userCfgEarly.aios === true || userCfgEarly.aios === 'true') formatStyle = 'aios';

    function svcFromLabel(label) {
      if (label === 'TB') return 'torbox';
      if (label === 'RD') return 'realdebrid';
      return 'p2p';
    }
    function langsArr(t) {
      const out = [];
      if (t.italian) out.push('italian');
      else if (t.italianSub) out.push('italian'); // sub ITA mostriamo comunque bandiera IT
      return out;
    }

    function formatStream(t, provLabel, url) {
      const quality = t.quality || 'SD';
      const hasHdr = isHDR(t.title);
      const qualityLabel = `${quality}${hasHdr ? ' HDR' : ''}`;
      const langSingle = t.italian ? 'ITA' : t.italianSub ? 'Sub ITA' : null;

      const behaviorHints = {};
      if (bingeGroup) behaviorHints.bingeGroup = bingeGroup;
      if (filenameHint) behaviorHints.filename = filenameHint;
      if (url) behaviorHints.notWebReady = true;

      let name, title;
      if (formatStyle === 'aios') {
        const service = provLabel ? svcFromLabel(provLabel) : 'p2p';
        name = aiosFormatter.formatName({
          addonName: 'Pezzottio', service, cached: !!url, quality: qualityLabel,
        });
        title = aiosFormatter.formatTitle({
          title: t.title || titleHeader,
          size: t.sizeText,
          language: langSingle,
          source: t.provider,
          seeders: t.seeds,
          isPack: !!t.seasonPack,
        });
      } else if (formatStyle === 'torrentio') {
        const service = provLabel ? svcFromLabel(provLabel) : 'p2p';
        name = torrentioFormatter.formatName({
          addonName: 'Pezzottio', service, cached: !!url, quality: qualityLabel,
        });
        title = torrentioFormatter.formatTitle({
          filename: t.title || titleHeader,
          size: t.sizeText,
          seeders: t.seeds,
          languages: langsArr(t),
          isPack: !!t.seasonPack,
          packName: t.seasonPack ? t.title : null,
        });
      } else {
        // pezzottio default
        name = provLabel
          ? `Pezzottio ${provLabel}\n📺 ${qualityLabel}`
          : `Pezzottio\n📺 ${qualityLabel}`;
        const lines = [titleHeader];
        if (t.italian) lines.push('🇮🇹  Audio ITA');
        else if (t.italianSub) lines.push('📝  SUB ITA');
        title = lines.join('\n');
      }

      const out = { name, title, behaviorHints };
      if (url) out.url = url;
      else { out.infoHash = t.infoHash; out.sources = t.trackers; }
      return out;
    }

    const cacheHints = { cacheMaxAge: 10 * 60, staleRevalidate: 60, staleError: 60 * 60 };

    // Stream HTTP diretti. Vanno in cima.
    const PROVIDER_LABELS = { AW: 'AnimeWorld', AS: 'AnimeSaturn', GS: 'GuardaSerie', SC: 'StreamingCommunity' };
    function formatHttpStream(s) {
      const langSingle = s.italian ? 'ITA' : s.italianSub ? 'Sub ITA' : null;
      const providerFull = PROVIDER_LABELS[s.provider] || s.provider;

      const behaviorHints = { notWebReady: true };
      if (bingeGroup) behaviorHints.bingeGroup = bingeGroup;
      if (s.proxyHeaders) behaviorHints.proxyHeaders = { request: s.proxyHeaders };
      else if (s.referer) behaviorHints.proxyHeaders = { request: { Referer: s.referer } };

      let name, title;
      if (formatStyle === 'aios') {
        name = aiosFormatter.formatName({
          addonName: 'Pezzottio', service: 'http', quality: s.quality || 'Direct',
        });
        title = aiosFormatter.formatTitle({
          title: meta.italianTitle || meta.title,
          language: langSingle,
          source: providerFull,
        });
      } else if (formatStyle === 'torrentio') {
        name = torrentioFormatter.formatName({
          addonName: 'Pezzottio', service: 'http', quality: s.quality || 'Direct',
        });
        title = torrentioFormatter.formatTitle({
          filename: `${meta.italianTitle || meta.title} (${providerFull})`,
          languages: langsArr(s),
        });
      } else {
        name = `Pezzottio ${s.provider}\n📺 HTTP`;
        const lines = [titleHeader];
        if (s.italian) lines.push('🇮🇹  Audio ITA');
        else if (s.italianSub) lines.push('📝  SUB ITA');
        title = lines.join('\n');
      }

      return { name, title, url: s.url, behaviorHints };
    }
    // Filter mode è SPECIFICO per film/serie: 'all' | 'torrent' | 'http'.
    // Per anime invece c'è il toggle dedicato httpAnime (catalogo+HTTP insieme).
    // Backward compat: vecchio onlyTorrent:true → filter='torrent'
    let filterMode = userCfgEarly.filter || 'all';
    if (userCfgEarly.onlyTorrent === true || userCfgEarly.onlyTorrent === 'true') filterMode = 'torrent';
    const fullIta = userCfgEarly.fullIta === true || userCfgEarly.fullIta === 'true';
    const httpAnimeOn = !(userCfgEarly.httpAnime === false || userCfgEarly.httpAnime === 'false');

    const ANIME_PROVS = new Set(['AW', 'AS', 'AU']);
    const FILM_PROVS = new Set(['GS', 'SC']);

    // Hide flags content-type aware:
    //  - ANIME:   torrent sempre on, HTTP segue httpAnime, filterMode ignorato
    //  - FILM/S:  filterMode controlla hideHttp + hideTorrent
    const hideTorrent = !isAnime && filterMode === 'http';
    const hideFilmHttp = !isAnime && filterMode === 'torrent';

    let httpStreamsFiltered = fullIta ? httpStreams.filter((s) => s.italian) : httpStreams;
    httpStreamsFiltered = httpStreamsFiltered.filter((s) => {
      if (ANIME_PROVS.has(s.provider)) return isAnime && httpAnimeOn;
      if (FILM_PROVS.has(s.provider)) return !isAnime && !hideFilmHttp;
      return true;
    });
    const awFormattedStreams = httpStreamsFiltered.map(formatHttpStream);

    // Senza debrid: magnet diretti + HTTP in cima.
    if (!providers.length) {
      const torrentStreams = hideTorrent ? [] : candidates.map((t) => formatStream(t, null, null));
      const streams = [...awFormattedStreams, ...torrentStreams];
      return { streams, ...cacheHints };
    }

    const sePart = (type === 'series' && meta.season && meta.episode)
      ? `?s=${meta.season}&e=${meta.episode}`
      : '';
    // imdbId nel link /play serve all'auto-prefetch del prossimo episodio
    // (per ricostruire l'id Stremio del next ep e fare lookup nel pool).
    const iPart = imdbId ? `${sePart ? '&' : '?'}i=${imdbId}` : '';
    const userCfg = getCurrentUserConfig() || {};
    const cfgB64 = encodeConfig(userCfg);
    // publicHost già dichiarato in cima al handler (per gli HTTP stream URL)

    // Resolver per Torbox: batch checkcached (1 request) → URL lazy /play.
    async function resolveTorbox(prov) {
      const hashes = candidates.map((c) => c.infoHash);
      const cachedMap = await prov.checkCachedBatch(hashes).catch(() => new Map());
      const out = [];
      for (const c of candidates) {
        if (out.length >= maxResults) break;
        const cached = cachedMap.get(c.infoHash);
        if (!cached) continue;
        if (c.seasonPack && meta.season && meta.episode) {
          const fileMatch = findFileForEpisode(cached.files || [], meta.season, meta.episode);
          if (!fileMatch) continue;
        }
        const url = `${publicHost}/${cfgB64}/play/${c.infoHash}${sePart}${iPart}`;
        out.push(formatStream(c, prov.name, url));
      }
      return out;
    }

    // Resolver per RealDebrid: usa /torrents (mylist utente) come "cache check"
    // gratis. Solo i torrent GIÀ scaricati dall'utente vengono mostrati — questi
    // sono garantiti play-funzionanti, niente "loading failed".
    // Trade-off: mostriamo meno risultati (limitato a quello che l'utente ha già
    // usato), ma TUTTI funzionano. instantAvailability deprecato da RD 2024 non
    // ci lascia alternative senza sforare il rate limit.
    async function resolveRealDebrid(prov) {
      // VERIFY OBBLIGATORIO: tutti i cached confermati al 100% prima di emettere.
      // Niente trust [RD+] blind: gli aggregator hanno cache stale che causa
      // loading failed.
      // Priority: hash con rdCached tag in cima così verify foreground li testa
      // per primi (più probabilità di cached confirm). Per i pool con molti
      // [RD+] tag, allarghiamo il VERIFY_LIMIT lato checkCachedBatch (param).
      const candidatesRD = [...candidates].sort(
        (a, b) => (b.rdCached ? 1 : 0) - (a.rdCached ? 1 : 0),
      );
      const hashes = candidatesRD.map((c) => c.infoHash);
      const hashWithMagnets = new Map();
      for (const c of candidatesRD) {
        if (c.magnet) hashWithMagnets.set(c.infoHash, c.magnet);
      }
      // Verify limit ridotto: l'utente vuole /stream <3s totali.
      // Con gap addMagnet 1.5s, 1 verify = ~3s, 2 verify in parallelo = ~3s.
      // Skippo verify se troppi/zero tag aggregator → il /stream esce veloce.
      const rdTagCount = candidatesRD.filter((c) => c.rdCached).length;
      const verifyLimit = rdTagCount >= 1 ? 2 : 0;
      // Master timeout 2.5s: oltre, ritorna quello che ha (gcache+mylist sono
      // veloci; verify foreground può essere troncato senza problemi).
      const cachedMap = await Promise.race([
        prov.checkCachedBatch(hashes, hashWithMagnets, meta.season, meta.episode, verifyLimit).catch(() => new Map()),
        new Promise((r) => setTimeout(() => r(new Map()), 2500)),
      ]);
      const out = [];
      for (const c of candidatesRD) {
        if (out.length >= maxResults) break;
        if (!cachedMap.has(c.infoHash)) continue;
        const url = `${publicHost}/${cfgB64}/play/${c.infoHash}${sePart}${sePart ? '&' : '?'}p=rd${imdbId ? `&i=${imdbId}` : ''}`;
        out.push(formatStream(c, prov.name, url));
      }
      console.log(`[RD] resolve emitted ${out.length} stream (rdTagCount=${rdTagCount} verifyLimit=${verifyLimit})`);
      return out;
    }

    // Chiamo TUTTI i provider configurati in parallelo e fondo i risultati.
    // L'utente che ha sia RD che TB vede risultati da entrambi.
    const providerResults = await Promise.all(providers.map((prov) => {
      if (prov.name === 'TB') return resolveTorbox(prov).catch(() => []);
      if (prov.name === 'RD') return resolveRealDebrid(prov).catch(() => []);
      return Promise.resolve([]);
    }));

    // Merge: dedupe per URL (NON per infoHash). Lo stesso torrent può uscire
    // da TB cached (URL /play/HASH) e da RD lazy (URL /play/HASH?p=rd) — sono
    // due opzioni distinte: TB istantaneo, RD fallback se TB non funziona.
    // Mostriamo entrambe così l'utente può scegliere quale debrid usare.
    const seen = new Set();
    const debridStreams = [];
    for (const list of providerResults) {
      for (const s of list) {
        if (s.url && seen.has(s.url)) continue;
        if (s.url) seen.add(s.url);
        debridStreams.push(s);
      }
    }

    // Con 2 provider configurati la lista può raddoppiare. Allargo il cap per
    // mostrare risultati da entrambi (es. 25 TB + 25 RD = 50).
    const debridCap = providers.length > 1 ? maxResults * 2 : maxResults;
    // Filter 'solo HTTP': nasconde tutti i debrid (TB/RD)
    const slicedDebrid = hideTorrent ? [] : debridStreams.slice(0, debridCap);
    // Ordine streams configurabile dall'utente:
    //   'smart' (default): HTTP prima per anime, debrid prima per film/serie
    //   'http':            HTTP sempre prima
    //   'tb':              debrid sempre prima
    const order = (userCfg && userCfg.order) || 'smart';
    let streams;
    if (order === 'tb') {
      streams = [...slicedDebrid, ...awFormattedStreams];
    } else if (order === 'http') {
      streams = [...awFormattedStreams, ...slicedDebrid];
    } else {
      // smart: per anime HTTP prima (AnimeWorld/Saturn dominano), altrimenti debrid prima
      streams = isAnime
        ? [...awFormattedStreams, ...slicedDebrid]
        : [...slicedDebrid, ...awFormattedStreams];
    }
    return { streams, ...cacheHints };
  } catch (err) {
    console.error('[stream handler]', err);
    return { streams: [] };
  }
});

// === CATALOG HANDLER ===
// Cataloghi anime backed da Kitsu API. ID format: pezzottio-anime-<key>.
// Search: usa il catalog 'pezzottio-anime-search' con extra.search=QUERY.
// Liste: airing | popular | rating | newest, paginate via extra.skip, filtrate
// da extra.genre.
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  try {
    const skip = extra?.skip ? Number(extra.skip) : 0;
    const genre = extra?.genre || null;
    const search = extra?.search || null;

    let metas = [];
    const isSearch = id.startsWith('pezzottio-anime-search');
    if (isSearch) {
      if (!search) return { metas: [], cacheMaxAge: 60 };
      metas = await kitsu.search(search, { skip });
      // Filtra per type richiesto: il catalog di type 'series' deve ritornare
      // solo anime serie, il 'movie' solo anime film. Il catalog 'anime'
      // ritorna tutto (per chi naviga il catalog direttamente).
      if (type === 'series' || type === 'movie') {
        metas = metas.filter((m) => m.type === type);
      }
    } else if (id.startsWith('pezzottio-anime-')) {
      const key = id.replace('pezzottio-anime-', ''); // airing|popular|rating|newest
      metas = await kitsu.getCatalog(key, { skip, genre });
    } else {
      return { metas: [] };
    }
    // Cache: search 1h, liste 4h.
    const cacheMaxAge = isSearch ? 60 * 60 : 4 * 60 * 60;
    return { metas, cacheMaxAge, staleRevalidate: 60 * 60, staleError: 24 * 60 * 60 };
  } catch (err) {
    console.error('[catalog handler]', err);
    return { metas: [] };
  }
});

// === META HANDLER ===
// Per i kitsu: ids (provenienti dai nostri cataloghi), proxy a anime-kitsu.strem.fun
// che restituisce videos[] completi con thumbnail/numero corretti. Cache 24h.
// Altri prefissi (tt, mal, anilist...) li lasciamo a Cinemeta/altri addon: Stremio
// li chiamerà comunque in parallelo e prenderà la prima risposta utile.
builder.defineMetaHandler(async ({ type, id }) => {
  try {
    if (id && id.startsWith('kitsu:')) {
      const data = await kitsu.getMeta(type, id);
      if (data && data.meta) {
        return { meta: data.meta, cacheMaxAge: 24 * 60 * 60, staleRevalidate: 6 * 60 * 60, staleError: 7 * 24 * 60 * 60 };
      }
    }
    return { meta: null };
  } catch (err) {
    console.error('[meta handler]', err);
    return { meta: null };
  }
});

module.exports = builder.getInterface();
