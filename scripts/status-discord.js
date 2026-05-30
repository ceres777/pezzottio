#!/usr/bin/env node
/**
 * status-discord.js — pubblica/aggiorna una "status card" live nel canale Discord
 * con lo stato della VPS + di tutti i servizi (ICV, StremThru, Comet, MediaFusion,
 * Meteor, Torrentio, provider HTTP, scraper).
 *
 * Riusa l'endpoint /api/status già esposto da Pezzottio (niente probe duplicati).
 * Edita SEMPRE lo stesso messaggio (status-page style) → niente spam nel canale.
 *
 * Setup (una volta):
 *   1. Webhook del canale #status: Discord → impostazioni canale → Integrazioni → Webhook
 *   2. In .env:  DISCORD_STATUS_WEBHOOK=https://discord.com/api/webhooks/....
 *
 * Uso:
 *   node scripts/status-discord.js          # un check (posta la 1ª volta, poi edita)
 *   node scripts/status-discord.js --reset   # forza un nuovo messaggio (scarta l'id salvato)
 *
 * Schedulazione: cron ogni 5 min (vedi istruzioni in fondo / README).
 */

const fs = require('fs');
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const WEBHOOK = process.env.DISCORD_STATUS_WEBHOOK || '';
const API = process.env.STATUS_API || 'http://127.0.0.1:7001/api/status';
const STATE_PATH = path.join(__dirname, '.status-message-id.json');
const RESET = process.argv.includes('--reset');

// Raggruppamento + label dei servizi (nomi siti abbreviati per ToS Discord).
const GROUPS = [
  { title: '💾 Debrid cache', names: ['IlCorsaroViola', 'StremThru', 'Comet', 'MediaFusion', 'Meteor', 'Torrentio'] },
  { title: '📺 Streaming HTTP', names: ['StreamingCommunity', 'GuardaSerie', 'AnimeWorld', 'AnimeSaturn', 'AnimeUnity'] },
  { title: '🧲 Scraper torrent', names: ['Nyaa', 'apibay', 'Bitsearch', 'Solid', 'Knaben', 'TokyoTosho'] },
];
const LABEL = {
  IlCorsaroViola: 'ICV', StreamingCommunity: 'SC', GuardaSerie: 'GS',
  AnimeWorld: 'AW', AnimeSaturn: 'AS', AnimeUnity: 'AU',
  // gli addon (StremThru/Comet/MediaFusion/Meteor/Torrentio) restano col loro nome
};

function loadMsgId() { try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')).id || null; } catch (_) { return null; } }
function saveMsgId(id) { fs.writeFileSync(STATE_PATH, JSON.stringify({ id })); }

function fmtBytes(b) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let n = Number(b) || 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i >= 3 ? 1 : 0)} ${u[i]}`;
}
function fmtUptime(sec) {
  sec = Math.floor(sec);
  const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600); const m = Math.floor((sec % 3600) / 60);
  return [d ? `${d}d` : '', h ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ');
}

// Stat di sistema lette da /proc + fs.statfsSync (Node ≥18).
function systemStats() {
  const out = {};
  try {
    const mi = fs.readFileSync('/proc/meminfo', 'utf8');
    const get = (k) => { const m = mi.match(new RegExp(`${k}:\\s+(\\d+)`)); return m ? parseInt(m[1], 10) * 1024 : 0; };
    const total = get('MemTotal'); const avail = get('MemAvailable');
    out.memTotal = total; out.memUsed = total - avail; out.memPct = total ? Math.round((total - avail) / total * 100) : 0;
    const st = get('SwapTotal'); const sf = get('SwapFree');
    out.swapTotal = st; out.swapUsed = st - sf;
  } catch (_) {}
  try {
    const la = fs.readFileSync('/proc/loadavg', 'utf8').split(' ');
    out.load = `${la[0]} ${la[1]} ${la[2]}`;
  } catch (_) {}
  try { out.uptime = parseFloat(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]); } catch (_) {}
  try {
    const s = fs.statfsSync('/');
    const total = s.blocks * s.bsize; const free = s.bfree * s.bsize;
    out.diskTotal = total; out.diskUsed = total - free; out.diskPct = total ? Math.round((total - free) / total * 100) : 0;
  } catch (_) {}
  return out;
}

async function fetchStatus() {
  const r = await fetch(API, { headers: { 'User-Agent': 'pezzottio-status' } });
  if (!r.ok) throw new Error(`/api/status HTTP ${r.status}`);
  return r.json();
}

function buildEmbed(status, sys) {
  const provById = {};
  for (const p of (status.providers || [])) provById[p.name] = p;

  let down = 0; let totalTracked = 0;
  const fields = GROUPS.map((g) => {
    const cells = g.names.map((name) => {
      const p = provById[name];
      const label = LABEL[name] || name;
      if (!p) return `⚪ ${label}`;
      totalTracked++;
      if (!p.ok) down++;
      const dot = p.ok ? '🟢' : '🔴';
      const ms = p.ok && p.ms != null ? ` \`${p.ms}ms\`` : '';
      return `${dot} ${label}${ms}`;
    });
    return { name: g.title, value: cells.join('\n') || '—', inline: true };
  });

  // Riga VPS
  const vpsParts = [];
  if (sys.memTotal) vpsParts.push(`🧠 RAM ${fmtBytes(sys.memUsed)}/${fmtBytes(sys.memTotal)} (${sys.memPct}%)`);
  if (sys.swapTotal) vpsParts.push(`💤 Swap ${fmtBytes(sys.swapUsed)}/${fmtBytes(sys.swapTotal)}`);
  if (sys.diskTotal) vpsParts.push(`💽 Disk ${fmtBytes(sys.diskUsed)}/${fmtBytes(sys.diskTotal)} (${sys.diskPct}%)`);
  if (sys.load) vpsParts.push(`📊 Load ${sys.load}`);
  if (sys.uptime) vpsParts.push(`⏱️ Uptime ${fmtUptime(sys.uptime)}`);
  fields.unshift({ name: '🖥️ VPS', value: vpsParts.join('\n') || '—', inline: false });

  // Stato globale + colore
  let title; let color;
  if (down === 0) { title = '🟢 All systems operational'; color = 0x22c55e; }
  else if (down <= 2) { title = '🟡 Partial degradation'; color = 0xf59e0b; }
  else { title = '🔴 Multiple services down'; color = 0xef4444; }

  return {
    title,
    description: `**${totalTracked - down}/${totalTracked}** services online`,
    color,
    fields,
    footer: { text: 'Pezzottio Status · auto-updates every 5 min' },
    timestamp: new Date().toISOString(),
  };
}

async function postOrEdit(embed) {
  const payload = { username: 'Pezzottio Status', embeds: [embed] };
  const msgId = RESET ? null : loadMsgId();

  if (msgId) {
    const r = await fetch(`${WEBHOOK}/messages/${msgId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (r.ok) { console.log('✅ status aggiornato (edit)'); return; }
    if (r.status !== 404) { console.error(`PATCH HTTP ${r.status}`); return; }
    // 404 → messaggio cancellato, ne creo uno nuovo sotto.
    console.log('messaggio precedente non trovato, ne creo uno nuovo');
  }

  const r = await fetch(`${WEBHOOK}?wait=true`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!r.ok) { console.error(`POST HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`); return; }
  const j = await r.json();
  if (j.id) { saveMsgId(j.id); console.log(`✅ status pubblicato (nuovo messaggio ${j.id})`); }
}

async function main() {
  if (!WEBHOOK) { console.error('❌ DISCORD_STATUS_WEBHOOK non impostato (vedi .env).'); process.exit(1); }
  const sys = systemStats();
  let status;
  try {
    status = await fetchStatus();
  } catch (e) {
    // Pezzottio /api/status irraggiungibile → la card mostra Pezzottio DOWN.
    console.error('status fetch err:', e.message);
    const embed = {
      title: '🔴 Pezzottio API unreachable',
      description: '`/api/status` non risponde — l\'addon potrebbe essere giù.',
      color: 0xef4444,
      fields: [{
        name: '🖥️ VPS',
        value: [
          sys.memTotal ? `🧠 RAM ${fmtBytes(sys.memUsed)}/${fmtBytes(sys.memTotal)} (${sys.memPct}%)` : '',
          sys.uptime ? `⏱️ Uptime ${fmtUptime(sys.uptime)}` : '',
        ].filter(Boolean).join('\n') || '—',
        inline: false,
      }],
      footer: { text: 'Pezzottio Status · auto-updates every 5 min' },
      timestamp: new Date().toISOString(),
    };
    await postOrEdit(embed);
    return;
  }
  await postOrEdit(buildEmbed(status, sys));
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
