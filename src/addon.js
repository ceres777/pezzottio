const { addonBuilder } = require('stremio-addon-sdk');
const { getConfig } = require('./config');
const { resolveTitle } = require('./cinemeta');
const { searchTorrents, distributeByQuality } = require('./search');
const { isHDR, isItalian, hasItalianSub, isEnglish, hasEnglishSub, parseQuality, formatSize } = require('./parse');
const { getCurrentUserConfig, encodeConfig } = require('./config');
const debrid = require('./debrid');
const animeworld = require('./providers/animeworld');
const animesaturn = require('./providers/animesaturn');
const animeunity = require('./providers/animeunity');
const animeMeta = require('./anime-meta');
const kitsu = require('./kitsu');
const vidxgo = require('./providers/vidxgo');
const streamingcommunity = require('./providers/streamingcommunity');
const animepahe = require('./providers/animepahe');
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
  description: 'Lo streaming italiano senza menate. Cerca film, serie e anime su 30+ tracker e mette sempre in cima l\'audio italiano. Integrazione con Torbox per riproduzione istantanea. Proxy HLS integrato server-side: niente MediaFlowProxy, niente Docker, niente VPS da configurare. Setup in 30 secondi. Powered by community Stremio addons (StremThru by Munif, Comet by Goldy, MediaFusion & Meteor by Midnight) — full credits in the GitHub README.',
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

    // IMDb id per i provider HTTP (GuardaSerie/StreamingCommunity usano tt direttamente).
    // Se l'id non è tt ma resolveTitle ha trovato un mapping (es. tmdb:30983 →
    // tt0131179 internamente), proviamo a recuperare l'imdb dal meta originale.
    let imdbId = id.startsWith('tt') ? id.split(':')[0] : null;
    if (!imdbId && meta._imdbResolved) imdbId = meta._imdbResolved;

    const isAnime = meta.type === 'anime';
    const isMovie = type === 'movie';
    const httpProviderArgs = [meta.title, meta.season, meta.episode, meta.absoluteEpisode, meta.animeAliases || [], meta.imdbId || imdbId, meta.providerSlugs];

    // Lingua content scelta dall'utente nel /configure (default 'it' per backward
    // compat: tutti i link esistenti non hanno il campo `lang` → cadono in 'it' →
    // comportamento identico a oggi). Usata sotto per skippare i provider IT-only
    // quando l'utente vuole solo contenuti EN.
    const lang = getConfig().lang;
    const wantIT = lang !== 'en';   // 'it' o 'mixed' o undefined
    const wantEN = lang !== 'it';   // 'en' o 'mixed'

    // Master timeout per ogni fetch. 2-3s per provider INTERNI (TB/SC/AU + HTTP)
    // → /stream apre veloce, gli stream HTTP arrivano come "lazy URL placeholder"
    // (vedi sotto): zero attesa per la chain di fetch, la risoluzione avviene
    // SOLO al click utente su /resolve.
    //
    // EXTERNAL addon (Torrentio, Comet, MediaFusion, StremThru, Meteor) hanno
    // cap separato più lungo (4-5s): upstream lenti su titoli con pool grande
    // (~24 stream Grey's Anatomy, ~30 One Piece) o cold call dopo restart
    // possono passare il cap di 2s anche se il vero fetch impiega 300-500ms.
    // Worst-case /stream latency: max(CAP_MS, CAP_MS_EXTERNAL) = 4s; in cache
    // hit (~5min TTL) torna istantaneo.
    const CAP_MS = isAnime ? 3000 : 2000;
    const CAP_MS_EXTERNAL = isAnime ? 5000 : 4000;
    const raceTimeout = (p, def, cap = CAP_MS) => Promise.race([
      p,
      new Promise((r) => setTimeout(() => r(def), cap)),
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

    // Risultati paralleli: torrent + external + slugs animemapping.
    // VidXgo (GS) è IT-only → skippato se wantIT=false. SC ha multi-audio
    // ITA+ENG → sempre chiamato (defaultAudio gestito a livello di proxy master).
    const [torrentsRaw, externalStreams, vxStream, scStream, slugsResult] = await Promise.all([
      raceTimeout(searchTorrents(meta, type, imdbId), []),
      raceTimeout(external.searchExternal(type, fullStremioId).catch(() => []), [], CAP_MS_EXTERNAL),
      (!isAnime && imdbId && wantIT)
        ? raceTimeout(vidxgo.findStream(imdbId, meta.season, meta.episode, isMovie).catch(() => null), null)
        : Promise.resolve(null),
      (!isAnime && imdbId)
        ? raceTimeout(streamingcommunity.findStream(imdbId, meta.season, meta.episode, isMovie).catch(() => null), null)
        : Promise.resolve(null),
      slugsPromise,
    ]);

    // Priorità: 1) publicHost iniettato per-request dal middleware (req-based),
    // 2) PUBLIC_HOST env (legacy), 3) fallback localhost:port (dev locale).
    const publicHost = getConfig().publicHost
      || process.env.PUBLIC_HOST
      || `http://${getConfig().host}:${getConfig().port}`;
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

    if (isAnime && wantIT && ranked.aw.length) {
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
    if (isAnime && wantIT && ranked.as.length) {
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
    if (isAnime && wantIT && ranked.au.length) {
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
    const needFallbackAW = isAnime && wantIT && !ranked.aw.length;
    const needFallbackAS = isAnime && wantIT && !ranked.as.length;
    const needFallbackAU = isAnime && wantIT && !ranked.au.length;
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

    // Animepahe (anime HTTP EN sub/dub): equivalente di AW/AS/AU per utenti EN.
    // Scraper diretto su animepahe.ru, stesso pattern dei provider IT (no API
    // esterne). Quando wantEN per un anime, chiediamo i suoi stream.
    if (isAnime && wantEN) {
      const apStreams = await raceTimeout(animepahe.findStreams(...httpProviderArgs).catch(() => []), []);
      httpStreams.push(...apStreams);
    }
    // VidXgo: il CDN ha session/IP pinning sul token (token risolto da IP X
    // funziona solo se richiesto dallo stesso IP). Bypass non praticabile →
    // proxy URL come prima. ~half della banda HLS resta sul server.
    if (vxStream && wantIT) {
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
    // StreamingCommunity: proxy via /hls/sc/* (ripristinato dopo cambi
    // server-side dell'upstream che hanno rotto l'emit diretto del playlist URL).
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
    // Dedupe per infoHash. Riordino per tier lingua → quality → seeds.
    //
    // Tier scelto in base a config.lang:
    //   - 'it' (default): italian > italianSub > resto (logica storica invariata)
    //   - 'en':            english > englishSub > resto (i flag .english/.englishSub
    //                      vengono enriciti sotto su ogni torrent)
    const QUALITY_RANK = { '4K': 5, '1080p': 4, '720p': 3, '480p': 2, CAM: 1 };
    const qrank = (q) => QUALITY_RANK[q] || 0;
    // Tier sort: per ANIME in EN, JP+sub-EN è standard mondiale → pari priorità
    // con dub EN. Per film/serie EN, dub > sub (l'utente EN guarda dub di solito).
    // Per IT (default), invariato: ITA > sub ITA > resto.
    const tier = lang === 'en'
      ? (isAnime
          ? (r) => (r.english || r.englishSub) ? 0 : 1
          : (r) => (r.english ? 0 : r.englishSub ? 1 : 2))
      : (r) => (r.italian ? 0 : r.italianSub ? 1 : 2);
    function mergeTorrents(...lists) {
      const seen = new Set();
      const out = [];
      for (const list of lists) {
        for (const r of list) {
          if (!r || !r.infoHash || seen.has(r.infoHash)) continue;
          seen.add(r.infoHash);
          // Per lang='en': arricchisco con .english/.englishSub dai filename.
          // I scraper IT non popolano questi flag (solo .italian/.italianSub) →
          // detection on-demand al merge per non toccare search.js.
          if (lang === 'en' && r.english === undefined) {
            const fn = r.filename || r.title || '';
            r.english = isEnglish(fn);
            r.englishSub = !r.english && hasEnglishSub(fn);
          }
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

    // Costruisco la prima riga del title: lang-aware.
    // - lang='it' (default): preferisce italianTitle (es. "Cinquanta sfumature di grigio")
    // - lang='en' / 'mixed': preferisce il titolo originale/inglese (es. "Fifty Shades of Grey")
    // Backward-compat: utenti IT esistenti vedono esattamente come prima.
    const displayTitle = lang === 'en'
      ? (meta.title || meta.italianTitle)
      : (meta.italianTitle || meta.title);
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
      if (lang === 'en') {
        if (t.english) out.push('english');
        else if (t.englishSub) out.push('english');
      } else {
        if (t.italian) out.push('italian');
        else if (t.italianSub) out.push('italian'); // sub ITA mostriamo comunque bandiera IT
      }
      return out;
    }

    function formatStream(t, provLabel, url) {
      const quality = t.quality || 'SD';
      const hasHdr = isHDR(t.title);
      const qualityLabel = `${quality}${hasHdr ? ' HDR' : ''}`;
      const langSingle = lang === 'en'
        ? (t.english ? 'ENG' : t.englishSub ? 'Sub ENG' : null)
        : (t.italian ? 'ITA' : t.italianSub ? 'Sub ITA' : null);

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
        // Filename: quando lo stream è debrid (url set) devo differenziare
        // le N varianti, altrimenti tutti i candidati hanno stesso (name,title)
        // e Stremio li dedupplica → utente vede 0 stream. Per i torrent P2P
        // puri (senza url) lascio invariato per backward compat IT.
        const rawFilename = t.filename || t.title || '';
        // Rimuovo il tag "[Torrentio]" / "[Comet]" finale aggiunto da external.js
        const cleanFn = rawFilename.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
        const headerFirstLine = titleHeader.split('\n')[0];
        if (url && cleanFn && cleanFn !== headerFirstLine) {
          // Tronco a ~90 char per non sfondare il layout Stremio
          const fn = cleanFn.length > 90 ? cleanFn.slice(0, 87) + '...' : cleanFn;
          lines.push(fn);
        }
        if (lang === 'en') {
          if (t.english) lines.push('🇺🇸  Audio ENG');
          else if (t.englishSub) lines.push('🇬🇧  SUB ENG');
          // Default per EN: se non c'è marker italian esplicito, presumiamo
          // audio EN (la maggior parte dei torrent per film/serie USA non
          // tagga "english" perché è implicito — solo "ITA" viene marcato
          // esplicitamente nelle release internazionali).
          else if (!t.italian && !t.italianSub) lines.push('🇺🇸  Audio ENG');
        } else {
          if (t.italian) lines.push('🇮🇹  Audio ITA');
          else if (t.italianSub) lines.push('📝  SUB ITA');
        }
        // Riga meta per stream debrid: 💾 size · 👥 seeds · 🗂 source
        if (url) {
          const metaParts = [];
          if (t.sizeText) metaParts.push(`💾 ${t.sizeText}`);
          if (typeof t.seeds === 'number' && t.seeds > 0) metaParts.push(`👥 ${t.seeds}`);
          if (t.provider) metaParts.push(`🗂 ${t.provider}`);
          if (metaParts.length) lines.push(metaParts.join(' · '));
        }
        title = lines.join('\n');
      }

      const out = { name, title, behaviorHints };
      if (url) out.url = url;
      else { out.infoHash = t.infoHash; out.sources = t.trackers; }
      return out;
    }

    const cacheHints = { cacheMaxAge: 10 * 60, staleRevalidate: 60, staleError: 60 * 60 };

    // Stream HTTP diretti. Vanno in cima.
    const PROVIDER_LABELS = { AW: 'AnimeWorld', AS: 'AnimeSaturn', AU: 'AnimeUnity', GS: 'GuardaSerie', SC: 'StreamingCommunity' };
    function formatHttpStream(s) {
      const langSingle = lang === 'en'
        ? (s.english ? 'ENG' : s.englishSub ? 'Sub ENG' : null)
        : (s.italian ? 'ITA' : s.italianSub ? 'Sub ITA' : null);
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
          title: displayTitle,
          language: langSingle,
          source: providerFull,
        });
      } else if (formatStyle === 'torrentio') {
        // Service = sigla provider (aw/as/au/gs/sc) → tag esplicito nel name:
        // "[AW] Pezzottio HTTP", "[SC] Pezzottio HTTP", ecc.
        const svcKey = (s.provider || 'http').toLowerCase();
        name = torrentioFormatter.formatName({
          addonName: 'Pezzottio', service: svcKey, quality: s.quality || 'HTTP',
        });
        // Filename: prova estrazione dall'URL stream (utile per AW MP4 diretto
        // come "Naruto_Ep_001_ITA.mp4"). Fallback: titolo + sorgente.
        const realFilename = torrentioFormatter.extractFilename(s.url);
        const epSuffix = (meta.season && meta.episode)
          ? ` S${String(meta.season).padStart(2,'0')}E${String(meta.episode).padStart(2,'0')}`
          : '';
        const fileLine = realFilename
          || `${displayTitle}${epSuffix} · ${providerFull}`;
        title = torrentioFormatter.formatTitle({
          filename: fileLine,
          languages: langsArr(s),
        });
      } else {
        name = `Pezzottio ${s.provider}\n📺 HTTP`;
        const lines = [titleHeader];
        if (lang === 'en') {
          if (s.english) lines.push('🇺🇸  Audio ENG');
          else if (s.englishSub) lines.push('🇬🇧  SUB ENG');
          // Default per EN: presumiamo audio EN se nessun marker italian.
          else if (!s.italian && !s.italianSub) lines.push('🇺🇸  Audio ENG');
        } else {
          if (s.italian) lines.push('🇮🇹  Audio ITA');
          else if (s.italianSub) lines.push('📝  SUB ITA');
        }
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
          // Per anime via Kitsu (season=1, episode=absolute), passa anche meta.episode
          // come absoluteEpisode → match pattern "One Piece - 1163.mkv" nei pack.
          const absFallback = (isAnime && (meta.season == null || meta.season <= 1)) ? meta.episode : meta.absoluteEpisode;
          const fileMatch = findFileForEpisode(cached.files || [], meta.season, meta.episode, absFallback);
          if (!fileMatch) continue;
        }
        const url = `${publicHost}/${cfgB64}/play/${c.infoHash}${sePart}${iPart}`;
        out.push(formatStream(c, prov.name, url));
      }
      return out;
    }

    // Resolver per RealDebrid (fast path): chiama l'API esterna di cache check
    // che ritorna torrent CACHED-RD pre-computati, con file_index + rd_link_index
    // pre-mappati per le serie. Skip totale del flusso mylist/instantAvailability.
    //
    // Pipeline: TMDB lookup (~200ms) → /movie|/tv?tmdb_id=... (~400ms) → emit URLs
    // Latency totale /stream lato RD: ~600ms vs ~2.5s del vecchio path.
    async function resolveRealDebrid(prov) {
      const isMovieKind = isMovie;
      console.log(`[RD] called: imdbId=${imdbId} isMovie=${isMovieKind} s=${meta.season} e=${meta.episode}`);
      // Mapping IMDB → TMDB usando l'helper già esistente in streamingcommunity.
      let tmdbId = null;
      try {
        if (imdbId) {
          const sc = require('./providers/streamingcommunity');
          tmdbId = await Promise.race([
            sc.imdbToTmdb(imdbId, isMovieKind ? 'movie' : 'tv').catch((e) => { console.error('[RD] imdbToTmdb err:', e.message); return null; }),
            new Promise((r) => setTimeout(() => r('TIMEOUT'), 1500)),
          ]);
          if (tmdbId === 'TIMEOUT') { console.error('[RD] imdbToTmdb TIMEOUT 1.5s'); tmdbId = null; }
        } else {
          console.log('[RD] no imdbId, skip');
        }
      } catch (e) {
        console.error('[RD] tmdb try err:', e.message);
      }
      console.log(`[RD] tmdbId resolved = ${tmdbId}`);
      if (!tmdbId) {
        console.log('[RD] no TMDB mapping, skip');
        return [];
      }
      // Traduzione episodio assoluto → S/E TMDB per anime via Kitsu.
      // Kitsu serve One Piece e altri long-running come lista flat: "ep 1163"
      // Kitsu = "S23E08" TMDB. L'API esterna vuole il formato TMDB strutturato.
      // Trigger: anime + season≤1 + episode≥30 (euristica safe per anime corti).
      let lookupSeason = meta.season;
      let lookupEpisode = meta.episode;
      if (isAnime && imdbId && (meta.season == null || meta.season <= 1) && meta.episode && meta.episode >= 30) {
        const translated = await prov.absoluteEpisodeToSE(imdbId, meta.episode, tmdbId).catch(() => null);
        if (translated) {
          lookupSeason = translated.season;
          lookupEpisode = translated.episode;
          console.log(`[RD] anime abs ep${meta.episode} → S${lookupSeason}E${lookupEpisode} (imdb=${imdbId})`);
        }
      }
      const cached = await Promise.race([
        prov.findCachedByTmdb(tmdbId, lookupSeason, lookupEpisode, isMovieKind).catch((e) => { console.error('[RD] findCached err:', e.message); return []; }),
        new Promise((r) => setTimeout(() => r('TIMEOUT'), 2000)),
      ]);
      if (cached === 'TIMEOUT') {
        console.error('[RD] findCachedByTmdb TIMEOUT 2s');
        return [];
      }
      console.log(`[RD] cached.length = ${cached.length}`);
      if (!cached.length) {
        console.log(`[RD] tmdb=${tmdbId} → 0 cached`);
        return [];
      }
      // Trasforma ogni cached entry in candidato Pezzottio-compatible
      const TRACKERS = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://tracker.openbittorrent.com:6969/announce',
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.torrent.eu.org:451/announce',
      ];
      const out = [];
      // Ordino per tier (IT o EN a seconda di lang) + qualità.
      // Detection lang-aware: detecto ENTRAMBI per popolare i flag che servono
      // a formatStream (label '🇺🇸 ENG' / '🇮🇹 ITA' + fallback default).
      const enriched = cached.map((c) => {
        const text = `${c.title || ''} ${(c.file && c.file.title) || ''}`;
        return {
          ...c,
          _text: text,
          _italian: isItalian(text),
          _italianSub: hasItalianSub(text),
          _english: isEnglish(text),
          _englishSub: hasEnglishSub(text),
          _quality: parseQuality(text),
        };
      });
      // Lang IT (default): audio ITA > sub ITA > resto.
      // Lang EN: audio EN > sub EN > resto.
      const tier = lang === 'en'
        ? (c) => (c._english ? 0 : c._englishSub ? 1 : 2)
        : (c) => (c._italian ? 0 : c._italianSub ? 1 : 2);
      const QR = { '4K': 5, '1080p': 4, '720p': 3, '480p': 2, CAM: 1 };
      enriched.sort((a, b) => {
        const td = tier(a) - tier(b);
        if (td !== 0) return td;
        return (QR[b._quality] || 0) - (QR[a._quality] || 0);
      });
      // Full-lang filter: esclude release senza marker della lingua scelta.
      // fullIta è il toggle esistente IT — per EN per ora lasciamo passare tutto
      // (la maggior parte dei torrent USA non ha marker "english" esplicito).
      const pool = (lang !== 'en' && fullIta) ? enriched.filter((c) => c._italian) : enriched;
      for (const c of pool) {
        if (out.length >= maxResults) break;
        const fi = (c.file && c.file.file_index != null) ? c.file.file_index : '';
        const rli = (c.file && c.file.rd_link_index != null) ? c.file.rd_link_index : '';
        // URL /play con indici file pre-mappati → resolver lato server salta
        // pickRdLink euristico e usa direttamente i valori dell'API
        const q = new URLSearchParams();
        if (meta.season) q.set('s', String(meta.season));
        if (meta.episode) q.set('e', String(meta.episode));
        q.set('p', 'rd');
        if (fi !== '') q.set('fi', String(fi));
        if (rli !== '') q.set('rli', String(rli));
        if (imdbId) q.set('i', imdbId);
        const url = `${publicHost}/${cfgB64}/play/${c.hash}?${q.toString()}`;
        const candidateLike = {
          title: c.title,
          infoHash: c.hash,
          sizeText: c.size ? formatSize(c.size) : null,
          seeds: c.seeders,
          italian: c._italian,
          italianSub: c._italianSub,
          english: c._english,
          englishSub: c._englishSub,
          quality: c._quality,
          seasonPack: c.isPack,
          trackers: TRACKERS,
        };
        out.push(formatStream(candidateLike, prov.name, url));
      }
      console.log(`[RD] tmdb=${tmdbId} → ${cached.length} cached, emitted ${out.length}`);

      // === ANIME: fallback su candidati Nyaa (ITA / sub ITA) ===
      // L'API esterna ha gap su anime recenti (One Piece S23, ecc.). Per gli
      // anime aggiungiamo i candidati ITA da Nyaa/searchTorrents controllati
      // contro RD via mylist+verify. Limit 5 verify per non rallentare /stream.
      if (isAnime && candidates.length && out.length < maxResults) {
        const seenHashes = new Set(out.map((s) => s._hash).filter(Boolean));
        // Ho perso il riferimento all'hash nei stream emessi (formatStream non
        // lo include esplicitamente). Riprendiamo dagli enriched.
        for (const c of pool) seenHashes.add(c.hash);
        const animeCandidates = candidates
          .filter((c) => (c.italian || c.italianSub) && !seenHashes.has(c.infoHash.toLowerCase()));
        if (animeCandidates.length) {
          console.log(`[RD] anime fallback: ${animeCandidates.length} candidati Nyaa/ITA da checkare`);
          const hashes = animeCandidates.map((c) => c.infoHash);
          const hashWithMagnets = new Map();
          for (const c of animeCandidates) if (c.magnet) hashWithMagnets.set(c.infoHash, c.magnet);
          const cachedMap = await Promise.race([
            prov.checkCachedBatch(hashes, hashWithMagnets, meta.season, meta.episode, 5).catch(() => new Map()),
            new Promise((r) => setTimeout(() => r(new Map()), 2500)),
          ]);
          let extraEmitted = 0;
          for (const c of animeCandidates) {
            if (out.length >= maxResults) break;
            if (!cachedMap.has(c.infoHash)) continue;
            // URL /play senza fi/rli — legacy path (mylist+pickRdLink euristico)
            const q = new URLSearchParams();
            if (meta.season) q.set('s', String(meta.season));
            if (meta.episode) q.set('e', String(meta.episode));
            q.set('p', 'rd');
            if (imdbId) q.set('i', imdbId);
            const url = `${publicHost}/${cfgB64}/play/${c.infoHash}?${q.toString()}`;
            out.push(formatStream(c, prov.name, url));
            extraEmitted++;
          }
          if (extraEmitted) console.log(`[RD] anime fallback emessi: +${extraEmitted}`);
        }
      }
      return out;
    }

    // Chiamo TUTTI i provider configurati in parallelo e fondo i risultati.
    // L'utente che ha sia RD che TB vede risultati da entrambi.
    console.log(`[debug] providers configured: ${providers.map((p) => p.name).join(',') || '(none)'}`);

    // Resolver RD per lang=en: il backend ICV (resolveRealDebrid) è italo-centrico
    // → pochi hash per film USA. Bypass: prendiamo i candidates già marcati
    // rdCached=true dagli external addons (Torrentio/Comet/MediaFusion/StremThru/
    // Meteor) che fanno cache check RD nativo via |realdebrid=KEY upstream.
    // Risultato: tutti gli stream RD-cached vengono mostrati come "Pezzottio RD".
    function resolveRealDebridEN() {
      const out = [];
      for (const c of candidates) {
        if (out.length >= maxResults) break;
        if (!c.rdCached) continue;
        const q = new URLSearchParams();
        if (meta.season) q.set('s', String(meta.season));
        if (meta.episode) q.set('e', String(meta.episode));
        q.set('p', 'rd');
        if (imdbId) q.set('i', imdbId);
        const url = `${publicHost}/${cfgB64}/play/${c.infoHash}?${q.toString()}`;
        out.push(formatStream(c, 'RD', url));
      }
      console.log(`[RD EN] ${imdbId || '?'} candidates ${candidates.length} → cached ${out.length}`);
      return out;
    }

    const providerResults = await Promise.all(providers.map((prov) => {
      if (prov.name === 'TB') return resolveTorbox(prov).catch((e) => { console.error('[TB] resolve threw:', e.message); return []; });
      if (prov.name === 'RD') {
        // EN: fonde external addons (rdCached) + backend ICV. ICV è italo-centrico
        // ma molti torrent multi-lingua hanno track EN; serve come fallback quando
        // gli external addons EN sono rate-limited (Comet 429, StremThru timeout).
        // Dedup successiva per URL elimina i doppioni.
        if (lang === 'en') {
          return Promise.all([
            Promise.resolve(resolveRealDebridEN()),
            resolveRealDebrid(prov).catch((e) => { console.error('[RD EN icv] threw:', e.message); return []; }),
          ]).then(([fromExternals, fromIcv]) => {
            const merged = [...fromExternals, ...fromIcv];
            console.log(`[RD EN merge] ${imdbId || '?'} external=${fromExternals.length} icv=${fromIcv.length} total=${merged.length}`);
            return merged;
          });
        }
        return resolveRealDebrid(prov).catch((e) => { console.error('[RD] resolve threw:', e.message, '\n', e.stack); return []; });
      }
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
//
// IMDB enrichment: aggiungiamo imdb_id al meta quando possibile (via ani.zip).
// Aiuta Stremio a NON confondere anime con live-action quando entrambi hanno
// lo stesso nome (es. One Piece anime tt0388629 vs live action tt11737520).
// Additive — non cambia il behavior IT (cinemeta italiano risolve uguale).
builder.defineMetaHandler(async ({ type, id }) => {
  try {
    if (id && id.startsWith('kitsu:')) {
      const data = await kitsu.getMeta(type, id);
      if (data && data.meta) {
        const enriched = { ...data.meta };
        // Lookup imdb via resolveTitle se il meta non l'ha già. Cache lato ani.zip.
        if (!enriched.imdb_id) {
          try {
            const resolved = await resolveTitle('series', id);
            if (resolved && (resolved.imdbId || resolved._imdbResolved)) {
              enriched.imdb_id = resolved.imdbId || resolved._imdbResolved;
            }
          } catch (_) { /* lookup opzionale, fallback silenzioso */ }
        }
        return { meta: enriched, cacheMaxAge: 24 * 60 * 60, staleRevalidate: 6 * 60 * 60, staleError: 7 * 24 * 60 * 60 };
      }
    }
    return { meta: null };
  } catch (err) {
    console.error('[meta handler]', err);
    return { meta: null };
  }
});

module.exports = builder.getInterface();
