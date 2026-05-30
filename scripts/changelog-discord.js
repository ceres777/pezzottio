#!/usr/bin/env node
/**
 * changelog-discord.js — posta le nuove entry di assets/changelog.json
 * nel canale Discord via webhook (no bot, no token, no processo persistente).
 *
 * Setup (una volta):
 *   1. Discord → impostazioni del canale → Integrazioni → Webhook → Nuovo webhook
 *   2. Copia l'URL del webhook
 *   3. Mettilo in .env:  DISCORD_CHANGELOG_WEBHOOK=https://discord.com/api/webhooks/....
 *
 * Uso:
 *   node scripts/changelog-discord.js            # posta le entry non ancora postate (vecchie→nuove)
 *   node scripts/changelog-discord.js --dry-run  # mostra cosa posterebbe, senza inviare
 *   node scripts/changelog-discord.js --latest   # forza il SOLO gruppo più recente (ignora lo stato)
 *   node scripts/changelog-discord.js --all      # ri-posta TUTTO (reset stato) — attenzione allo spam
 *
 * Lingua: CHANGELOG_LANG=en|it|both  (default: en)
 *
 * Stato: scripts/.changelog-posted.json tiene le date già postate per non duplicare.
 */

const fs = require('fs');
const path = require('path');

// .env (se presente) — riusa dotenv del progetto.
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const WEBHOOK = process.env.DISCORD_CHANGELOG_WEBHOOK || '';
const LANG = (process.env.CHANGELOG_LANG || 'en').toLowerCase(); // en | it | both
const SITE = process.env.PUBLIC_HOST || 'https://pezz8io.dpdns.org';
const AVATAR = `${SITE.replace(/\/$/, '')}/logo.png`;

const CHANGELOG_PATH = path.join(__dirname, '..', 'assets', 'changelog.json');
const STATE_PATH = path.join(__dirname, '.changelog-posted.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const LATEST_ONLY = args.includes('--latest');
const ALL = args.includes('--all');

// Etichette + colori per tipo (allineati alla pagina /changelog del sito).
const TYPE_META = {
  feat:     { it: '✨ Novità',   en: '✨ New',      color: 0x22c55e },
  fix:      { it: '🛠️ Fix',      en: '🛠️ Fix',     color: 0x3b82f6 },
  config:   { it: '⚙️ Setup',    en: '⚙️ Setup',    color: 0xa855f7 },
  perf:     { it: '🚀 Perf',     en: '🚀 Perf',     color: 0xf59e0b },
  breaking: { it: '🚨 Breaking', en: '🚨 Breaking', color: 0xef4444 },
};
const BRAND_COLOR = 0xe50914;

// Sanitizer Discord: abbrevia i nomi dei siti streaming/download per esteso
// → solo abbreviazioni nel post (coerente con la regola del server "no nomi
// per esteso, pena mute"). Riduce il rischio di flag/ban del canale.
// Gli ADDON (Torrentio/Comet/MediaFusion/StremThru/Meteor) NON vengono toccati:
// sono crediti a software open-source, non siti.
const SITE_ABBREV = [
  [/StreamingCommunity/gi, 'SC'],
  [/GuardaSerie/gi, 'GS'],
  [/AnimeWorld/gi, 'AW'],
  [/AnimeSaturn/gi, 'AS'],
  [/AnimeUnity/gi, 'AU'],
  [/AnimePahe/gi, 'AP'],
  [/VidXgo/gi, 'VX'],
  [/ilCorsaroNero/gi, 'ICN'],
  [/\bNyaa\b/gi, 'Ny'],
  [/\bYTS\b/gi, 'Y'],
  [/\bEZTV\b/gi, 'EZ'],
  [/\b1337x\b/gi, '13x'],
];
function sanitize(text) {
  let out = String(text || '');
  for (const [re, rep] of SITE_ABBREV) out = out.replace(re, rep);
  return out;
}

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; }
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function fmtDate(dateStr, lang) {
  const locale = lang === 'it' ? 'it-IT' : 'en-US';
  try {
    return new Date(dateStr + 'T00:00:00Z').toLocaleDateString(locale, {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  } catch (_) { return dateStr; }
}

// Costruisce la description di un embed da un gruppo (data + items).
// Per lang='both' impila EN poi IT separati da una riga.
function buildDescription(group, lang) {
  function lineFor(it, l) {
    const meta = TYPE_META[it.type] || TYPE_META.feat;
    const label = l === 'it' ? meta.it : meta.en;
    const msgRaw = l === 'it' ? (it.msg || it.msg_en || '') : (it.msg_en || it.msg || '');
    const msg = sanitize(msgRaw); // abbrevia nomi siti per il post Discord
    // Cap per item per non sforare i 4096 char dell'embed.
    const capped = msg.length > 300 ? msg.slice(0, 297) + '…' : msg;
    return `**${label}** — ${capped}`;
  }
  const items = group.items || [];
  if (lang === 'both') {
    const en = items.map((i) => lineFor(i, 'en')).join('\n');
    const it = items.map((i) => lineFor(i, 'it')).join('\n');
    let out = `🇬🇧\n${en}\n\n🇮🇹\n${it}`;
    if (out.length > 4000) out = out.slice(0, 3997) + '…';
    return out;
  }
  let out = items.map((i) => lineFor(i, lang)).join('\n');
  if (out.length > 4000) out = out.slice(0, 3997) + '…';
  return out;
}

function buildEmbed(group, lang) {
  // Colore: se c'è una breaking nel gruppo usa rosso breaking, altrimenti brand.
  const hasBreaking = (group.items || []).some((i) => i.type === 'breaking');
  const titleLang = lang === 'it' ? 'it' : 'en';
  const title = lang === 'both'
    ? `📅 ${fmtDate(group.date, 'en')}`
    : `📅 ${fmtDate(group.date, titleLang)}`;
  return {
    title,
    url: `${SITE.replace(/\/$/, '')}/changelog${lang === 'it' ? '' : '?lang=en'}`,
    description: buildDescription(group, lang),
    color: hasBreaking ? TYPE_META.breaking.color : BRAND_COLOR,
    footer: { text: 'Pezzottio Changelog' },
    timestamp: new Date(group.date + 'T12:00:00Z').toISOString(),
  };
}

async function postEmbed(embed) {
  const payload = {
    username: 'Pezzottio',
    avatar_url: AVATAR,
    embeds: [embed],
  };
  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`webhook HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  if (!WEBHOOK) {
    console.error('❌ DISCORD_CHANGELOG_WEBHOOK non impostato (vedi .env).');
    process.exit(1);
  }
  const log = loadJson(CHANGELOG_PATH, []);
  if (!Array.isArray(log) || !log.length) {
    console.error('❌ changelog.json vuoto o non valido:', CHANGELOG_PATH);
    process.exit(1);
  }

  const state = ALL ? { posted: [] } : loadJson(STATE_PATH, { posted: [] });
  const posted = new Set(state.posted || []);

  // Determina quali gruppi postare.
  // - default: tutti i non-postati, ordine cronologico (vecchio→nuovo)
  // - --latest: solo il gruppo con la data più recente (il primo dell'array)
  // - --all: tutti, dal più vecchio (stato resettato sopra)
  let toPost;
  if (LATEST_ONLY) {
    toPost = [log[0]]; // changelog.json ha il più recente in cima
  } else {
    // Ordine cronologico crescente per postare in ordine sensato.
    toPost = [...log].reverse().filter((g) => ALL || !posted.has(g.date));
  }

  if (!toPost.length) {
    console.log('✅ Nessuna nuova entry da postare. Tutto già pubblicato.');
    return;
  }

  console.log(`${DRY ? '[DRY-RUN] ' : ''}Da postare: ${toPost.length} gruppo/i (lang=${LANG})`);
  for (const group of toPost) {
    const embed = buildEmbed(group, LANG);
    if (DRY) {
      console.log('\n──────────────────────────────');
      console.log(`TITLE: ${embed.title}`);
      console.log(embed.description);
      continue;
    }
    try {
      await postEmbed(embed);
      posted.add(group.date);
      saveState({ posted: [...posted] });
      console.log(`✅ Postato: ${group.date}`);
      await sleep(1200); // gentile col rate-limit Discord
    } catch (e) {
      console.error(`❌ Errore su ${group.date}:`, e.message);
      // Non marcare come postato → ritenta al prossimo run.
      break;
    }
  }
  if (!DRY) console.log('\nFatto.');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
