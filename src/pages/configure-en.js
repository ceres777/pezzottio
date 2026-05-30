function render({ base, rd, tb, order, aios, style, onlyTorrent, filter, fullIta, prefetch, httpAnime }) {
  const ord = order || 'smart';
  // Backward compat: aios:true legacy → style='aios'
  const st = style || (aios === true || aios === 'true' ? 'aios' : 'pezzottio');
  // Backward compat: onlyTorrent:true legacy → filter='torrent'
  let flt = filter || 'all';
  if (onlyTorrent === true || onlyTorrent === 'true') flt = 'torrent';
  const ita = fullIta === true || fullIta === 'true';
  const pf = prefetch === true || prefetch === 'true';
  // Default ON: anime abilitato (catalogo Pezzottio Anime + stream HTTP AW/AS/AU)
  const animeOn = !(httpAnime === false || httpAnime === 'false');
  const hostOnly = String(base || '').replace(/^https?:\/\//i, '');
  const version = require('../../package.json').version;
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pezzottio · English Streaming</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='1.8'%3E%3Crect x='2.5' y='5' width='19' height='13' rx='2.5'/%3E%3Cpath d='M8 21h8M9 18v3M15 18v3' stroke-linecap='round'/%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Bebas+Neue&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #000000;
      --surface: #141414;
      --surface-2: #1f1f1f;
      --border: rgba(255,255,255,0.10);
      --border-strong: rgba(255,255,255,0.25);
      --text: #ffffff;
      --text-dim: #d4d4d4;
      --text-faint: #808080;
      --red: #e50914;
      --red-hover: #f6121d;
      --red-dim: #b81d24;
    }
    * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      letter-spacing: -0.005em;
    }
    .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

    /* Background Netflix: nero puro + sottile glow rosso in alto */
    .bg-fx { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; background: #000; }
    .bg-fx::before {
      content: ''; position: absolute; top: -20%; left: -10%; right: -10%; height: 70%;
      background:
        radial-gradient(50% 60% at 20% 30%, rgba(229,9,20,0.18) 0%, transparent 60%),
        radial-gradient(50% 60% at 80% 20%, rgba(229,9,20,0.10) 0%, transparent 60%);
      filter: blur(20px);
    }
    /* Vignette per dare profondità ai bordi */
    .bg-fx::after {
      content: ''; position: absolute; inset: 0;
      background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%);
    }

    /* Logo Pezzottio stile Netflix */
    .brand-wordmark {
      font-family: 'Bebas Neue', 'Inter', sans-serif;
      font-weight: 900;
      color: var(--red);
      letter-spacing: 0.02em;
      text-transform: uppercase;
      line-height: 1;
      text-shadow: 0 4px 24px rgba(229,9,20,0.4);
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
    }
    .card:hover { border-color: var(--border-strong); }

    /* Card hero — più grande e con border-left rosso */
    .card-rd { border-left: 3px solid var(--red); }
    .card-tb { border-left: 3px solid var(--red); }
    .card-install { border-left: 3px solid var(--red); }

    /* Stats Netflix: tutti bianchi grossi, label maiuscola */
    .stat-num { color: var(--text); font-feature-settings: "tnum" 1; }
    .stat-label { color: var(--text-faint); text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; font-weight: 600; }

    .btn-primary {
      background: var(--red);
      color: var(--text);
      transition: background 0.15s, transform 0.05s;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .btn-primary:hover { background: var(--red-hover); }
    .btn-primary:active { transform: scale(0.98); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .btn-stremio {
      background: var(--red);
      color: var(--text);
      border: none;
      font-weight: 700;
      letter-spacing: 0.02em;
      transition: background 0.15s, transform 0.05s;
    }
    .btn-stremio:hover { background: var(--red-hover); }
    .btn-stremio:active { transform: scale(0.98); }

    .btn-ghost {
      background: rgba(109,109,110,0.7);
      color: var(--text);
      border: none;
      font-weight: 600;
      transition: background 0.15s;
    }
    .btn-ghost:hover { background: rgba(109,109,110,0.4); }

    input::placeholder { color: var(--text-faint); }
    input { color: var(--text); }

    .input {
      background: #333;
      border: 1px solid transparent;
      transition: border-color 0.15s, background 0.15s;
    }
    .input:focus { outline: none; background: #454545; border-color: var(--red); }

    /* Section header con barra rossa */
    .section-bar {
      display: inline-block; width: 4px; height: 28px;
      background: var(--red); margin-right: 14px; vertical-align: middle;
      border-radius: 2px;
    }

    .pulse-dot { animation: pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

    .fade-in { animation: fadeIn 0.4s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    .valid-badge {
      position: absolute; right: 88px; top: 50%; transform: translateY(-50%);
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; padding: 4px 10px; border-radius: 6px;
      pointer-events: none;
    }
    .valid-badge.ok { background: rgba(34,197,94,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.25); }
    .valid-badge.err { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
    .valid-badge.loading { background: rgba(255,255,255,0.06); color: var(--text-dim); border: 1px solid var(--border); }
    .spinner {
      width: 10px; height: 10px; border: 1.5px solid rgba(255,255,255,0.3);
      border-top-color: white; border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Icone monocrome per le feature card */
    .icon-box {
      width: 36px; height: 36px;
      display: inline-flex; align-items: center; justify-content: center;
      background: rgba(192,132,252,0.08);
      border: 1px solid rgba(192,132,252,0.18);
      border-radius: 8px;
      color: var(--accent);
    }

    /* Numeri statistiche */
    .stat-num {
      font-feature-settings: "tnum" 1, "lnum" 1;
      font-variant-numeric: tabular-nums;
    }

    details > summary { list-style: none; }
    details > summary::-webkit-details-marker { display: none; }
    details[open] .chevron { transform: rotate(180deg); }
    .chevron { transition: transform 0.2s; }

    /* Selection */
    ::selection { background: rgba(229,9,20,0.4); }

    /* === MOCKUP STREAM LIST (showcase del prodotto in azione) === */
    .mockup {
      background: linear-gradient(180deg, #181818 0%, #0a0a0a 100%);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      overflow: hidden;
      box-shadow:
        0 50px 100px -20px rgba(229,9,20,0.25),
        0 30px 60px -30px rgba(0,0,0,0.8),
        0 0 0 1px rgba(255,255,255,0.04) inset;
    }
    .mockup-header {
      background: rgba(0,0,0,0.6); padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      display: flex; align-items: center; gap: 6px;
    }
    .mockup-dot { width: 10px; height: 10px; border-radius: 50%; }
    .mockup-row {
      display: grid; grid-template-columns: 80px 1fr;
      gap: 12px; padding: 12px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .mockup-row:last-child { border-bottom: 0; }
    .mockup-row:hover { background: rgba(255,255,255,0.02); }
    .mockup-name { font-size: 11px; line-height: 1.35; color: rgba(255,255,255,0.7); }
    .mockup-name .q { color: white; font-weight: 600; font-size: 12px; display: block; }
    .mockup-title { font-size: 11px; line-height: 1.45; color: rgba(255,255,255,0.85); }
    .mockup-title .t { color: white; font-weight: 600; font-size: 12px; display: block; margin-bottom: 2px; }
    .mockup-title .meta { color: rgba(255,255,255,0.45); font-size: 10px; }
    .mockup-flag { color: var(--red); font-weight: 700; font-size: 11px; }
    .mockup-sub { color: #f5a524; font-weight: 700; font-size: 11px; } /* SUB = ambra, distingue da audio ITA */

    /* === PROVIDER LOGOS STRIP === */
    .logo-pill {
      display: inline-flex; align-items: center;
      padding: 6px 14px; border-radius: 999px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.7);
      transition: all 0.2s;
    }
    .logo-pill:hover { background: rgba(229,9,20,0.08); border-color: rgba(229,9,20,0.25); color: white; }

    /* Step numbers — Netflix style */
    .step-num {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 48px; line-height: 0.9; font-weight: 900;
      background: linear-gradient(180deg, var(--red) 0%, transparent 120%);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    @media (min-width: 640px) { .step-num { font-size: 64px; } }

    /* FAQ */
    .faq-item { border-bottom: 1px solid rgba(255,255,255,0.08); }
    .faq-item:last-child { border-bottom: 0; }
    .faq-item summary {
      padding: 14px 0; cursor: pointer;
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      font-size: 15px; font-weight: 600; color: white;
    }
    @media (min-width: 640px) { .faq-item summary { padding: 18px 0; font-size: 16px; } }
    .faq-item summary:hover { color: var(--red); }
    .faq-item[open] summary { color: var(--red); }
    .faq-item .faq-body { padding: 0 0 14px 0; color: var(--text-dim); font-size: 13px; line-height: 1.6; }
    @media (min-width: 640px) { .faq-item .faq-body { padding: 0 0 18px 0; font-size: 14px; } }
    .faq-icon { transition: transform 0.2s; }
    .faq-item[open] .faq-icon { transform: rotate(45deg); }

    /* Badge "trust" */
    .trust-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 10px; border-radius: 6px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.85);
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .trust-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; }
  </style>
</head>
<body class="min-h-screen">
  <div class="bg-fx" aria-hidden="true"></div>

  <!-- Banner breaking change (visibile solo se /api/notice ritorna qualcosa, dismiss persistito in localStorage) -->
  <div id="notice-banner" class="hidden" style="background:linear-gradient(90deg,rgba(239,68,68,0.12),rgba(239,68,68,0.04));border-bottom:1px solid rgba(239,68,68,0.25)">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 text-sm">
      <span class="text-base">🚨</span>
      <div class="flex-1 text-zinc-200">
        <span class="font-semibold text-red-400 mr-2">Avviso:</span>
        <span id="notice-msg"></span>
      </div>
      <a href="/changelog" class="text-xs text-zinc-400 hover:text-white whitespace-nowrap">dettagli →</a>
      <button id="notice-close" class="text-zinc-500 hover:text-white text-xl leading-none ml-2" aria-label="Chiudi">×</button>
    </div>
  </div>

  <!-- NAV TOP -->
  <nav class="border-b border-white/[0.06]">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <img src="/pezzottio-logo.png" alt="PEZZOTTIO" class="h-7 md:h-8 select-none" draggable="false" />
        <span class="mono text-[10px] text-zinc-600 hidden md:inline">v${version}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="trust-badge"><span class="dot"></span> Online</span>
        <a href="https://t.me/Mbhere1" target="_blank" rel="noopener" class="text-xs text-zinc-400 hover:text-white transition flex items-center gap-1.5" title="Telegram support">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
          Support
        </a>
        <a href="https://github.com/ceres777/pezzottio" target="_blank" rel="noopener" class="text-xs text-zinc-400 hover:text-white transition flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-2.13c-3.2.7-3.87-1.36-3.87-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
          GitHub
        </a>
      </div>
    </div>
  </nav>

  <main class="max-w-6xl mx-auto px-4 sm:px-6">

    <!-- HERO SPLIT: text + mockup -->
    <header class="grid lg:grid-cols-[1.1fr_1fr] gap-8 md:gap-12 lg:gap-16 items-center pt-8 pb-12 md:pt-16 md:pb-20">
      <div class="text-center lg:text-left">
        <div class="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-5 md:mb-6">
          <div class="trust-badge">
            <span class="dot"></span> 100% free · Open source · Privacy first
          </div>
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] uppercase tracking-wider font-bold" style="background:rgba(229,9,20,0.12); border:1px solid rgba(229,9,20,0.35); color:#ff5260;">
            <span style="font-size:9px;">●</span> NEW · Real-Debrid back online
          </div>
        </div>
        <h1 class="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-5 md:mb-6 leading-[1.02]" style="letter-spacing:-0.035em;">
          All streaming.<br>
          <span style="color:var(--red)">In English.</span>
        </h1>
        <p class="text-zinc-300 text-base sm:text-lg md:text-xl leading-relaxed mb-6 md:mb-8 max-w-xl mx-auto lg:mx-0">
          Movies, series and anime — new or old, popular or niche.
          Direct HTTP streams + <strong class="text-white">Torbox</strong> or <strong class="text-white">Real-Debrid</strong>.
          One install, everything in English.
        </p>

        <!-- LIVE USAGE — fetched ogni 60s da /api/usage -->
        <div id="live-usage" class="hidden mb-6 flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-sm">
          <div class="inline-flex items-center gap-2 text-zinc-200">
            <span class="w-2 h-2 rounded-full bg-emerald-400 pulse-dot"></span>
            <span><strong id="live-1h" class="text-white font-bold tabular-nums">—</strong> <span class="text-zinc-400">active now</span></span>
          </div>
          <div class="text-zinc-400">·</div>
          <div class="text-zinc-200">
            <strong id="live-24h" class="text-white font-bold tabular-nums">—</strong> <span class="text-zinc-400">active in the last 24h</span>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-center lg:justify-start gap-3">
          <a href="#setup" class="btn-primary inline-flex items-center gap-2 px-7 py-3.5 rounded uppercase text-base">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Get started
          </a>
          <a href="#cosa-fa" class="btn-ghost px-6 py-3.5 rounded text-sm uppercase">
            What it does
          </a>
        </div>
      </div>

      <!-- DONAZIONI tramite buono regalo Amazon via Bitrefill.
           Mockup rimosso (richiesta utente): la colonna destra ora ha SOLO
           questa card → hero bilanciata con la colonna sinistra (testo+CTA).
           Tipografia rinforzata: header sezioni in bold (font-semibold) e
           font-size leggibile (text-sm). -->
      <div class="relative">
        <div class="absolute inset-0 -z-10" style="background:radial-gradient(60% 60% at 50% 50%, rgba(229,9,20,0.20) 0%, transparent 70%); filter:blur(40px);"></div>
        <div id="donate-gift" class="card p-5" style="border-left: 3px solid #ff9900;">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-xl">🎁</span>
            <span class="font-semibold text-zinc-100 text-base">Support Pezzottio</span>
          </div>
          <div class="text-sm text-zinc-300 leading-relaxed mb-4">
            Server, bandwidth and domain cost money. You can donate with an <strong class="text-white">Amazon gift card</strong> of any amount (from $5/€5 up) — simple, anonymous, no account needed.
          </div>
          <a href="https://www.bitrefill.com/us/en/gift-cards/amazon-us/" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2.5 rounded text-sm font-semibold text-black transition hover:opacity-90" style="background:#ff9900;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 18.5C7 22 17 22 20.5 18.5l-1-1C16.5 21 7.5 21 4.5 17.5l-1 1zM22 16l-1-3-3 1 1 3 3-1z"/></svg>
            Buy on Bitrefill
          </a>
          <div class="mt-4 pt-4 border-t border-white/[0.08]">
            <div class="font-semibold text-zinc-100 text-base mb-2">How it works</div>
            <div class="text-sm text-zinc-300 leading-relaxed space-y-1.5">
              <div>1. Open the Bitrefill link above → pick the amount ($5, $10, $25, $50…)</div>
              <div>2. Click <strong class="text-white">Buy now</strong></div>
              <div>3. Check <strong class="text-white">Send as a gift</strong></div>
              <div>4. Enter the recipient email:</div>
              <div class="flex items-center gap-2 mt-2">
                <code class="mono text-xs bg-white/[0.06] border border-white/[0.10] rounded px-2.5 py-1.5 text-zinc-100 flex-1 min-w-0 truncate">pezz8io@proton.me</code>
                <button data-copy-addr="pezz8io@proton.me" class="copy-addr-btn text-xs px-3 py-1.5 rounded font-semibold text-black transition hover:opacity-90 whitespace-nowrap shrink-0" style="background:#ff9900;">Copy</button>
              </div>
              <div class="text-xs text-zinc-400 pt-1.5">Pay with card, PayPal, Apple/Google Pay or crypto — whatever you prefer. The gift card arrives via email straight to Pezzottio.</div>
            </div>
          </div>
          <div class="mt-4 pt-4 border-t border-white/[0.08]">
            <div class="font-semibold text-zinc-100 text-base mb-2">Or in crypto</div>
            <div class="space-y-1.5">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-zinc-100 w-16 shrink-0">BTC</span>
                <code class="mono text-xs bg-white/[0.06] border border-white/[0.10] rounded px-2.5 py-1.5 text-zinc-200 flex-1 min-w-0 truncate" title="bc1qcu9ch68gua0u4pgfqzlxshtdv99s06pwyhu4mm">bc1qcu9ch68gua0u4pgfqzlxshtdv99s06pwyhu4mm</code>
                <button data-copy-addr="bc1qcu9ch68gua0u4pgfqzlxshtdv99s06pwyhu4mm" class="copy-addr-btn text-xs px-3 py-1.5 rounded bg-white/[0.06] border border-white/[0.10] text-zinc-200 hover:bg-white/[0.10] transition whitespace-nowrap shrink-0">Copy</button>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-zinc-100 w-16 shrink-0">ETH</span>
                <code class="mono text-xs bg-white/[0.06] border border-white/[0.10] rounded px-2.5 py-1.5 text-zinc-200 flex-1 min-w-0 truncate" title="0x8915E5A201d66d55C91F9828c580931dB92fD82a">0x8915E5A201d66d55C91F9828c580931dB92fD82a</code>
                <button data-copy-addr="0x8915E5A201d66d55C91F9828c580931dB92fD82a" class="copy-addr-btn text-xs px-3 py-1.5 rounded bg-white/[0.06] border border-white/[0.10] text-zinc-200 hover:bg-white/[0.10] transition whitespace-nowrap shrink-0">Copy</button>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-zinc-100 w-16 shrink-0">Solana</span>
                <code class="mono text-xs bg-white/[0.06] border border-white/[0.10] rounded px-2.5 py-1.5 text-zinc-200 flex-1 min-w-0 truncate" title="9U21MvZGgGhXpjuTz9MNfYorTQEYhkfd1LtWfjA9ib7W">9U21MvZGgGhXpjuTz9MNfYorTQEYhkfd1LtWfjA9ib7W</code>
                <button data-copy-addr="9U21MvZGgGhXpjuTz9MNfYorTQEYhkfd1LtWfjA9ib7W" class="copy-addr-btn text-xs px-3 py-1.5 rounded bg-white/[0.06] border border-white/[0.10] text-zinc-200 hover:bg-white/[0.10] transition whitespace-nowrap shrink-0">Copy</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- PROVIDER STRIP -->
    <section class="py-8 md:py-12 border-y border-white/[0.06]">
      <div class="text-center mb-7">
        <div class="stat-label">Integrated with</div>
      </div>
      <div class="flex flex-wrap items-center justify-center gap-2.5">
        <span class="logo-pill">AnimeWorld</span>
        <span class="logo-pill">AnimeSaturn</span>
        <span class="logo-pill">AnimeUnity</span>
        <span class="logo-pill">GuardaSerie</span>
        <span class="logo-pill">StreamingCommunity</span>
        <span class="logo-pill">Torrentio</span>
        <span class="logo-pill">MediaFusion</span>
        <span class="logo-pill">Comet</span>
        <span class="logo-pill">StremThru</span>
        <span class="logo-pill">YTS</span>
        <span class="logo-pill">EZTV</span>
        <span class="logo-pill">Nyaa</span>
        <span class="logo-pill">Knaben</span>
        <span class="logo-pill">SolidTorrents</span>
        <span class="logo-pill">Bitsearch</span>
        <span class="logo-pill">apibay</span>
        <span class="logo-pill">IlCorsaroViola</span>
        <span class="logo-pill">Torbox</span>
        <span class="logo-pill">Real-Debrid</span>
      </div>
    </section>

    <!-- STATS -->
    <section class="py-10 md:py-16">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center md:text-left">
        <div>
          <div class="stat-num text-4xl sm:text-5xl md:text-6xl font-extrabold" style="color:var(--red)"><span id="counter-scrapers">0</span>+</div>
          <div class="stat-label mt-2 sm:mt-3">Tracker indexed</div>
        </div>
        <div>
          <div class="stat-num text-4xl sm:text-5xl md:text-6xl font-extrabold"><span id="counter-external">0</span></div>
          <div class="stat-label mt-2 sm:mt-3">Aggregator sources</div>
        </div>
        <div>
          <div class="stat-num text-4xl sm:text-5xl md:text-6xl font-extrabold"><span id="counter-http">0</span></div>
          <div class="stat-label mt-2 sm:mt-3">HTTP providers</div>
        </div>
        <div>
          <div class="stat-num text-4xl sm:text-5xl md:text-6xl font-extrabold"><span id="counter-ids">0</span></div>
          <div class="stat-label mt-2 sm:mt-3">ID formats</div>
        </div>
      </div>
    </section>

    <!-- COSA FA -->
    <section id="cosa-fa" class="py-10 md:py-16 border-t border-white/[0.06]">
      <h2 class="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-3 flex items-center justify-center md:justify-start">
        <span class="section-bar"></span>
        What it does, really.
      </h2>
      <p class="text-zinc-400 text-base sm:text-lg mb-8 md:mb-12 max-w-2xl mx-auto md:mx-0 md:ml-[18px] text-center md:text-left">
        Not another torrent addon. Six integrated capabilities working together.
      </p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 text-center sm:text-left">
        <div>
          <div class="text-base font-bold text-white mb-2">HTTP streams</div>
          <p class="text-sm text-zinc-400 leading-relaxed">
            HiAnime (anime sub/dub EN), StreamingCommunity with English audio track.
            Instant playback, no debrid required.
          </p>
        </div>
        <div>
          <div class="text-base font-bold text-white mb-2">English audio first</div>
          <p class="text-sm text-zinc-400 leading-relaxed">
            Sorted by language <strong class="text-zinc-200">before</strong> quality.
            Detection from release name and known English release groups.
          </p>
        </div>
        <div>
          <div class="text-base font-bold text-white mb-2">Built-in HLS proxy</div>
          <p class="text-sm text-zinc-400 leading-relaxed">
            Automatic token rotation for HLS CDNs, valid server-side headers.
            <strong class="text-zinc-200">No more 5-minute timeouts</strong>.
          </p>
        </div>
        <div>
          <div class="text-base font-bold text-white mb-2">Season packs handled</div>
          <p class="text-sm text-zinc-400 leading-relaxed">
            Open S05E03 from a multi-season pack and Pezzottio picks
            the <strong class="text-zinc-200">right file</strong> on Torbox/RealDebrid.
          </p>
        </div>
        <div>
          <div class="text-base font-bold text-white mb-2">All catalogs</div>
          <p class="text-sm text-zinc-400 leading-relaxed">
            IMDb, Kitsu, MAL, AniList, AniDB, TMDB, TVDB. Works with
            Crunchyroll catalogs, AnimeUnity, any addon you have.
          </p>
        </div>
        <div>
          <div class="text-base font-bold text-white mb-2">Privacy first</div>
          <p class="text-sm text-zinc-400 leading-relaxed">
            Your API keys live encoded in the manifest URL.
            <strong class="text-zinc-200">Zero database, zero logs</strong>, zero sharing.
          </p>
        </div>
      </div>
    </section>

    <!-- COME FUNZIONA -->
    <section class="py-10 md:py-16 border-t border-white/[0.06]">
      <h2 class="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-3 flex items-center justify-center md:justify-start">
        <span class="section-bar"></span>
        Ready in 30 seconds.
      </h2>
      <p class="text-zinc-400 text-base sm:text-lg mb-8 md:mb-14 md:ml-[18px] text-center md:text-left">Zero install. Zero server-side configuration.</p>

      <div class="grid md:grid-cols-3 gap-8 md:gap-10 text-center md:text-left">
        <div class="relative">
          <div class="step-num mb-4">01</div>
          <div class="text-lg font-bold text-white mb-2">Paste your debrid key</div>
          <p class="text-sm text-zinc-400 leading-relaxed">
            Optional — Pezzottio works without it, you'll still get HTTP streams.
            For the best experience use Torbox or Real-Debrid (or both in parallel).
          </p>
        </div>
        <div>
          <div class="step-num mb-4">02</div>
          <div class="text-lg font-bold text-white mb-2">Generate your link</div>
          <p class="text-sm text-zinc-400 leading-relaxed">
            Unique manifest URL with your config encoded inside.
            Click "Install in Stremio" or scan the QR.
          </p>
        </div>
        <div>
          <div class="step-num mb-4">03</div>
          <div class="text-lg font-bold text-white mb-2">Watch.</div>
          <p class="text-sm text-zinc-400 leading-relaxed">
            Open any movie, series or anime. English audio on top,
            4K HDR recognized, no more "no streams available".
          </p>
        </div>
      </div>
    </section>

    <!-- STATUS -->
    <details class="card mb-10 max-w-2xl mx-auto" id="status-panel">
      <summary class="cursor-pointer p-4 flex items-center justify-between">
        <span class="flex items-center gap-3">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot"></span>
          <span class="text-sm font-medium">Source status</span>
          <span id="status-summary" class="text-xs text-zinc-500 ml-1">—</span>
        </span>
        <svg class="chevron w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
      </summary>
      <div id="status-list" class="px-4 pb-4 text-sm">
        <div class="text-zinc-500 text-xs py-2">checking…</div>
      </div>
    </details>

    <!-- STATUS BANNER -->
    <div id="status-banner" class="card p-3.5 mb-6 hidden fade-in max-w-2xl mx-auto">
      <div class="flex items-center gap-3">
        <div id="status-dot" class="w-2 h-2 rounded-full bg-emerald-400 pulse-dot"></div>
        <span id="status-text" class="text-sm text-zinc-300"></span>
      </div>
    </div>

    <!-- SETUP -->
    <section id="setup" class="py-10 md:py-16 border-t border-white/[0.06] max-w-2xl mx-auto">
      <h2 class="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-3 flex items-center justify-center md:justify-start">
        <span class="section-bar"></span>
        Set up your link.
      </h2>
      <p class="text-zinc-400 text-base sm:text-lg mb-8 md:mb-10 md:ml-[18px] text-center md:text-left">
        Pezzottio works with <strong class="text-white">Torbox</strong> and <strong class="text-white">Real-Debrid</strong> —
        one, the other, or both in parallel. Your keys stay only inside the link, no account, no database.
      </p>

      <!-- TB -->
      <div class="card card-tb p-4 sm:p-6 mb-3">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded bg-white/5 border border-white/10 flex items-center justify-center font-bold text-xs text-white">TB</div>
            <div>
              <div class="font-semibold text-zinc-100">Torbox</div>
              <div class="text-xs text-zinc-500">Instant playback, cloud cache, EN priority</div>
            </div>
          </div>
          <a href="https://torbox.app/settings" target="_blank" rel="noopener" class="text-xs text-zinc-500 hover:text-zinc-300 transition">get token →</a>
        </div>
        <div class="relative">
          <input id="tb-key" type="password" autocomplete="off" spellcheck="false"
            class="input mono w-full rounded-lg px-3.5 py-2.5 pr-20 text-sm"
            placeholder="paste your API key" value="${escape(tb)}" />
          <div id="tb-valid" class="valid-badge hidden"></div>
          <button type="button" data-toggle="tb-key" class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-200 px-2.5 py-1 rounded-md hover:bg-white/5 transition">
            show
          </button>
        </div>
        <div class="mt-4 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
          <div class="text-xs text-zinc-400 leading-relaxed">
            Don't have Torbox yet? <strong class="text-white">A few bucks a month</strong>, infinite library, zero waiting.
          </div>
          <a href="https://torbox.app/subscription" target="_blank" rel="noopener"
            class="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded text-xs uppercase whitespace-nowrap">
            💎 Sign up for Torbox
          </a>
        </div>
      </div>

      <!-- RD (riattivato) -->
      <div class="card card-rd p-4 sm:p-6 mb-3">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded bg-white/5 border border-white/10 flex items-center justify-center font-bold text-xs text-white">RD</div>
            <div>
              <div class="font-semibold text-zinc-100">Real-Debrid</div>
              <div class="text-xs text-zinc-500">Alternative or complement to Torbox. Works in parallel.</div>
            </div>
          </div>
          <a href="https://real-debrid.com/apitoken" target="_blank" rel="noopener" class="text-xs text-zinc-500 hover:text-zinc-300 transition">get token →</a>
        </div>
        <div class="relative">
          <input id="rd-key" type="password" autocomplete="off" spellcheck="false"
            class="input mono w-full rounded-lg px-3.5 py-2.5 pr-20 text-sm"
            placeholder="paste your API key" value="${escape(rd)}" />
          <div id="rd-valid" class="valid-badge hidden"></div>
          <button type="button" data-toggle="rd-key" class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-200 px-2.5 py-1 rounded-md hover:bg-white/5 transition">
            show
          </button>
        </div>
        <div class="mt-3 text-[11px] text-zinc-500 leading-relaxed">
          You can set up Real-Debrid <strong class="text-zinc-300">together with Torbox</strong>: the stream list
          will show results from both (badges [RD⚡] and [TB⚡]).
        </div>
      </div>

      <!-- Stile risultati -->
      <div class="card p-4 sm:p-5 mb-3">
        <div class="flex items-center gap-3 mb-3">
          <div class="text-base">🎨</div>
          <div>
            <div class="font-semibold text-zinc-100 text-sm">Result style</div>
            <div class="text-xs text-zinc-500">Layout of name and description for each stream in Stremio</div>
          </div>
        </div>
        <div class="space-y-2">
          <label class="flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-white/[0.03] transition border border-transparent">
            <input type="radio" name="style" value="pezzottio" class="mt-1 accent-red-600" ${st === 'pezzottio' ? 'checked' : ''} />
            <div class="flex-1">
              <div class="text-sm text-white font-medium">Pezzottio (default)</div>
              <div class="text-xs text-zinc-400 mt-0.5">Clean Netflix-style layout. Title, language, quality on 2 lines.</div>
            </div>
          </label>
          <label class="flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-white/[0.03] transition border border-transparent">
            <input type="radio" name="style" value="torrentio" class="mt-1 accent-red-600" ${st === 'torrentio' ? 'checked' : ''} />
            <div class="flex-1">
              <div class="text-sm text-white font-medium">Torrentio</div>
              <div class="text-xs text-zinc-400 mt-0.5">Classic style: <code class="text-zinc-300">[TB⚡] Pezzottio 1080p</code> + filename, size, seeders, languages.</div>
            </div>
          </label>
          <label class="flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-white/[0.03] transition border border-transparent">
            <input type="radio" name="style" value="aios" class="mt-1 accent-red-600" ${st === 'aios' ? 'checked' : ''} />
            <div class="flex-1">
              <div class="text-sm text-white font-medium">AIOStreams compatible</div>
              <div class="text-xs text-zinc-400 mt-0.5">Standard format parseable by AIOStreams and other meta-aggregators. Use it only if you aggregate Pezzottio inside AIOStreams.</div>
            </div>
          </label>
        </div>
      </div>

      <!-- Ordine risultati -->
      <div class="card p-4 sm:p-5 mb-6">
        <div class="flex items-center gap-3 mb-3">
          <div class="text-base">🎚️</div>
          <div>
            <div class="font-semibold text-zinc-100 text-sm">Result order</div>
            <div class="text-xs text-zinc-500">Which streams to show first in the Stremio list</div>
          </div>
        </div>
        <div class="space-y-2">
          <label class="order-option flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-white/[0.03] transition border border-transparent" data-order-label="smart">
            <input type="radio" name="order" value="smart" class="mt-1 accent-red-600" ${ord === 'smart' ? 'checked' : ''} />
            <div class="flex-1">
              <div class="text-sm text-white font-medium">Smart (recommended)</div>
              <div class="text-xs text-zinc-400 mt-0.5">HTTP first for anime, debrid (Torbox/RD) first for movies and series. Best default.</div>
            </div>
          </label>
          <label class="order-option flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-white/[0.03] transition border border-transparent" data-order-label="tb">
            <input type="radio" name="order" value="tb" class="mt-1 accent-red-600" ${ord === 'tb' ? 'checked' : ''} />
            <div class="flex-1">
              <div class="text-sm text-white font-medium">Debrid always first</div>
              <div class="text-xs text-zinc-400 mt-0.5">Torbox / Real-Debrid on top — max quality (4K, REMUX). HTTP at the bottom.</div>
            </div>
          </label>
          <label class="order-option flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-white/[0.03] transition border border-transparent" data-order-label="http">
            <input type="radio" name="order" value="http" class="mt-1 accent-red-600" ${ord === 'http' ? 'checked' : ''} />
            <div class="flex-1">
              <div class="text-sm text-white font-medium">HTTP always first</div>
              <div class="text-xs text-zinc-400 mt-0.5">HiAnime / StreamingCommunity on top. Torbox and Real-Debrid below.</div>
            </div>
          </label>
        </div>
      </div>

      <!-- Filter risultati -->
      <div class="card p-4 sm:p-5 mb-3">
        <div class="flex items-center gap-3 mb-3">
          <div class="text-base">🎬</div>
          <div>
            <div class="font-semibold text-zinc-100 text-sm">Filter movie & series results</div>
            <div class="text-xs text-zinc-500">Which categories to show when you open a movie or series</div>
          </div>
        </div>
        <div class="space-y-2">
          <label class="flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-white/[0.03] transition border border-transparent">
            <input type="radio" name="filter" value="all" class="mt-1 accent-red-600" ${flt === 'all' ? 'checked' : ''} />
            <div class="flex-1">
              <div class="text-sm text-white font-medium">Everything (default)</div>
              <div class="text-xs text-zinc-400 mt-0.5">Torbox + Real-Debrid + direct magnet links + HTTP streams from StreamingCommunity.</div>
            </div>
          </label>
          <label class="flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-white/[0.03] transition border border-transparent">
            <input type="radio" name="filter" value="torrent" class="mt-1 accent-red-600" ${flt === 'torrent' ? 'checked' : ''} />
            <div class="flex-1">
              <div class="text-sm text-white font-medium">Only debrid / torrent</div>
              <div class="text-xs text-zinc-400 mt-0.5">Only Torbox / Real-Debrid (+ direct magnets). Hides HTTP streams.</div>
            </div>
          </label>
          <label class="flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-white/[0.03] transition border border-transparent">
            <input type="radio" name="filter" value="http" class="mt-1 accent-red-600" ${flt === 'http' ? 'checked' : ''} />
            <div class="flex-1">
              <div class="text-sm text-white font-medium">Only HTTP streams</div>
              <div class="text-xs text-zinc-400 mt-0.5">Only StreamingCommunity. Hides Torbox, Real-Debrid and magnets.</div>
            </div>
          </label>
        </div>
      </div>

      <!-- Filtra risultati ANIME -->
      <div class="card p-4 sm:p-5 mb-3">
        <div class="flex items-center gap-3 mb-3">
          <div class="text-base">🎌</div>
          <div>
            <div class="font-semibold text-zinc-100 text-sm">Filter anime results</div>
            <div class="text-xs text-zinc-500">Pezzottio Anime catalog + torrent coverage</div>
          </div>
        </div>
        <label class="flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-white/[0.03] transition border border-transparent">
          <input id="anime-toggle" type="checkbox" class="mt-1 accent-red-600 w-4 h-4" ${animeOn ? 'checked' : ''} />
          <div class="flex-1">
            <div class="text-sm text-white font-medium">Enable anime results</div>
            <div class="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              Adds the Pezzottio Anime catalogs (Kitsu-powered) to your Stremio home. For streams,
              we cover anime via <strong class="text-zinc-200">torrent sources</strong> (Nyaa with
              SubsPlease, Erai-raws, Judas + AniDex + TokyoTosho). Sub-EN coverage typically &gt;90%
              within 24h of JP release. Torbox/RD recommended for instant playback.
            </div>
          </div>
        </label>
        <div class="mt-3 p-3 rounded bg-amber-500/10 border border-amber-500/30">
          <div class="text-xs text-amber-200 font-semibold mb-1">⚠️ REQUIRED if you enable anime</div>
          <div class="text-xs text-amber-100/80 leading-relaxed">
            Disable or uninstall any other anime catalog addon (Anime Catalogs, Kitsu Anime,
            AIOCatalogs with anime sections). They use different ids and episode numberings — causes
            wrong streams or empty lists.
          </div>
        </div>
      </div>


      <!-- Full ITA (solo audio italiano) -->
      <div class="card p-4 sm:p-5 mb-3">
        <label class="flex items-start gap-3 cursor-pointer">
          <input id="full-ita-toggle" type="checkbox" class="mt-1 accent-red-600 w-4 h-4" ${ita ? 'checked' : ''} />
          <div class="flex-1">
            <div class="text-sm text-white font-medium">🇺🇸 Full EN (English audio only)</div>
            <div class="text-xs text-zinc-400 mt-0.5">Show only streams with confirmed English audio. Excludes SUB-only releases and anything without confirmed English dub.</div>
          </div>
        </label>
      </div>

      <!-- Binge mode: auto-prefetch prossimo episodio -->
      <div class="card p-4 sm:p-5 mb-6" style="border-left: 3px solid #c084fc;">
        <label class="flex items-start gap-3 cursor-pointer">
          <input id="prefetch-toggle" type="checkbox" class="mt-1 accent-red-600 w-4 h-4" ${pf ? 'checked' : ''} />
          <div class="flex-1">
            <div class="text-sm text-white font-medium">🚀 Binge mode (auto-prefetch next episode)</div>
            <div class="text-xs text-zinc-400 mt-0.5">When you watch a series, the addon AUTOMATICALLY adds the next episode to Torbox in background. When you finish and click next, it starts instantly. Series only, requires Torbox key.</div>
          </div>
        </label>
      </div>

      <!-- PROFILI MULTIPLI -->
      <details class="card p-4 sm:p-5 mb-6" style="border-left: 3px solid #38bdf8;">
        <summary class="cursor-pointer flex items-center gap-3 select-none list-none">
          <div class="text-base">👨‍👩‍👧</div>
          <div class="flex-1">
            <div class="font-semibold text-zinc-100 text-sm">Multiple profiles <span class="ml-1 text-[10px] uppercase tracking-wider text-sky-400 font-bold">new</span></div>
            <div class="text-xs text-zinc-500 mt-0.5">Generate multiple links at once (e.g. one per family member). Each link goes into a different Stremio profile.</div>
          </div>
          <svg class="chevron w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </summary>

        <div class="mt-5 pt-5 border-t border-white/[0.06] space-y-4">
          <!-- Modalità chiavi -->
          <div>
            <div class="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2">Key mode (Torbox + Real-Debrid)</div>
            <div class="space-y-2">
              <label class="flex items-start gap-2.5 p-2.5 rounded cursor-pointer hover:bg-white/[0.03] transition">
                <input type="radio" name="key-mode" value="shared" class="mt-0.5 accent-red-600" checked />
                <div class="text-xs">
                  <div class="text-zinc-200 font-medium">Same keys for all profiles</div>
                  <div class="text-zinc-500 mt-0.5">Every profile uses the Torbox and Real-Debrid keys entered above.</div>
                </div>
              </label>
              <label class="flex items-start gap-2.5 p-2.5 rounded cursor-pointer hover:bg-white/[0.03] transition">
                <input type="radio" name="key-mode" value="per-profile" class="mt-0.5 accent-red-600" />
                <div class="text-xs">
                  <div class="text-zinc-200 font-medium">Different keys per profile</div>
                  <div class="text-zinc-500 mt-0.5">Each profile has its own Torbox and/or Real-Debrid keys (useful for families with separate accounts). If you leave a field empty, the global key above is used as fallback.</div>
                </div>
              </label>
            </div>
          </div>

          <!-- Lista profili -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <div class="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Profiles</div>
              <button id="add-profile" type="button" class="text-xs text-sky-400 hover:text-sky-300 transition font-semibold">+ Add profile</button>
            </div>
            <div id="profiles-list" class="space-y-3">
              <!-- I profili sono iniettati via JS -->
            </div>
          </div>
        </div>
      </details>

      <button id="generate-btn" class="btn-primary w-full py-3.5 rounded text-base uppercase">
        ▶ Generate link
      </button>
      <p class="text-xs text-zinc-500 mt-3 text-center">
        Without a debrid key the HTTP streams still work.
      </p>
    </section>

    <!-- RISULTATO -->
    <section id="install-card" class="card card-install p-4 sm:p-6 mb-10 hidden fade-in max-w-2xl mx-auto">
      <div class="flex items-center gap-2 mb-1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-emerald-400"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h3 class="text-base font-semibold text-zinc-100" id="install-card-title">Link generated</h3>
      </div>
      <p class="text-sm text-zinc-400 mb-5" id="install-card-subtitle">
        Unique and tied to your keys. Don't share it.
      </p>

      <!-- Lista profili multipli (visibile solo in modalità multi-profilo) -->
      <div id="profiles-result" class="hidden space-y-3 mb-6"></div>

      <!-- Step 1: Catalogo extra (consigliato, da installare PRIMA) -->
      <div class="mb-2 flex items-center gap-2">
        <span class="flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/20 border border-violet-500/40 text-[10px] font-bold text-violet-300">1</span>
        <span class="text-xs text-zinc-300">Install the catalog <strong class="text-white">first</strong></span>
      </div>
      <a id="install-catalog" href="stremio://_REPLACED_BY_JS_/extra-en/manifest.json"
         class="block text-center w-full px-5 py-3 rounded uppercase mb-2 text-sm font-semibold text-white transition hover:opacity-90"
         style="background: linear-gradient(135deg, #8b5cf6, #6d28d9);">
        <span class="inline-flex items-center gap-2 justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Install Catalog
        </span>
      </a>
      <button id="copy-catalog-url" class="btn-ghost w-full px-5 py-2 rounded text-xs mb-2">
        Copy manual link
      </button>
      <div class="text-[11px] text-zinc-500 mb-4 ml-7 leading-relaxed">
        Netflix, Prime Video, Disney+, HBO Max, Apple TV+, Crunchyroll. Free.
      </div>

      <!-- Step 2: Pezzottio (AFTER the catalog) -->
      <div class="mb-2 flex items-center gap-2">
        <span class="flex items-center justify-center w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 text-[10px] font-bold text-red-300">2</span>
        <span class="text-xs text-zinc-300"><strong class="text-white">Then</strong> install Pezzottio</span>
      </div>
      <a id="install-stremio" href="#" class="btn-stremio block text-center w-full px-5 py-3.5 rounded uppercase mb-2">
        <span class="inline-flex items-center gap-2 justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Install Pezzottio
        </span>
      </a>
      <button id="copy-url" class="btn-ghost w-full px-5 py-2.5 rounded text-sm mb-6">
        Copy manual link
      </button>

      <!-- QR -->
      <div class="grid md:grid-cols-[auto,1fr] gap-5 mb-6 items-center pt-2">
        <div class="flex justify-center">
          <div id="qr-code" class="inline-block bg-white p-2.5 rounded-lg"></div>
        </div>
        <div>
          <div class="text-sm font-semibold text-zinc-100 mb-1.5">Mobile or Android TV</div>
          <p class="text-xs text-zinc-400 leading-relaxed">
            Scan the QR with your phone camera or a QR app
            on Fire TV / Shield. Opens Stremio directly.
          </p>
        </div>
      </div>

      <div class="mono text-xs text-zinc-500 bg-black/40 rounded-md px-3 py-2.5 border border-white/[0.06] break-all mb-5" id="install-url">—</div>

      <div id="mixed-warning" class="hidden mb-5 rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2.5 text-xs text-yellow-200/90">
        ⚠ You're loading this page via HTTPS but the addon is HTTP — Stremio Web won't accept it (mixed content). Use Stremio Desktop.
      </div>

      <details>
        <summary class="text-xs text-zinc-500 hover:text-zinc-300 transition cursor-pointer flex items-center gap-1.5">
          <span>Manual install</span>
          <svg class="chevron w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </summary>
        <ol class="space-y-2.5 text-sm text-zinc-300 mt-4">
          <li class="flex gap-3">
            <span class="shrink-0 w-5 h-5 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-semibold text-zinc-400">1</span>
            <span>Open Stremio Desktop</span>
          </li>
          <li class="flex gap-3">
            <span class="shrink-0 w-5 h-5 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-semibold text-zinc-400">2</span>
            <span>Puzzle icon top-right → Addons</span>
          </li>
          <li class="flex gap-3">
            <span class="shrink-0 w-5 h-5 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-semibold text-zinc-400">3</span>
            <span>Paste the link in the search bar</span>
          </li>
          <li class="flex gap-3">
            <span class="shrink-0 w-5 h-5 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-semibold text-zinc-400">4</span>
            <span>Install on the Pezzottio card</span>
          </li>
        </ol>
      </details>
    </section>

    <!-- FAQ -->
    <section class="py-10 md:py-16 border-t border-white/[0.06] max-w-3xl mx-auto">
      <h2 class="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-3 flex items-center justify-center md:justify-start">
        <span class="section-bar"></span>
        FAQ.
      </h2>
      <p class="text-zinc-400 text-base sm:text-lg mb-8 md:mb-10 md:ml-[18px] text-center md:text-left">Answers to the things everyone asks.</p>
      <div>
        <details class="faq-item">
          <summary>Is it really free?<span class="faq-icon text-2xl">+</span></summary>
          <div class="faq-body">
            Yes. Pezzottio is open-source and 100% free. Torbox and Real-Debrid are commercial debrid providers (a few dollars a month), both supported — use them alone or in parallel. Without any debrid you still get HTTP streams from HiAnime and StreamingCommunity.
          </div>
        </details>
        <details class="faq-item">
          <summary>Does Real-Debrid work?<span class="faq-icon text-2xl">+</span></summary>
          <div class="faq-body">
            <strong>Yes, supported again.</strong> Paste your Real-Debrid key in the setup page, even alongside Torbox. The stream list will show results from both (badges [RD⚡] and [TB⚡]). Torbox is still the recommended primary for starters — faster on rare content — but RD is a real alternative or complement.
          </div>
        </details>
        <details class="faq-item">
          <summary>Is my Torbox token safe?<span class="faq-icon text-2xl">+</span></summary>
          <div class="faq-body">
            Yes. The key is encoded (base64) <strong>in the manifest URL itself</strong>, never stored on the server. No database, no persistent logs. Every user has their own unique link with their own key.
          </div>
        </details>
        <details class="faq-item">
          <summary>Does it work with Crunchyroll / anime catalogs?<span class="faq-icon text-2xl">+</span></summary>
          <div class="faq-body">
            Yes. Pezzottio supports every Stremio id format: IMDb, Kitsu, MAL, AniList, AniDB, TMDB, TVDB. Cross-database mapping is automatic, so any catalog you have installed (Crunchyroll, AnimeUnity, Cinemeta...) Pezzottio understands and searches.
          </div>
        </details>
        <details class="faq-item">
          <summary>Why doesn't HTTP streaming stall at the 5-minute mark?<span class="faq-icon text-2xl">+</span></summary>
          <div class="faq-body">
            Because Pezzottio has a <strong>built-in HLS proxy</strong>. When CDN tokens expire (every ~5 minutes) we regenerate them server-side and rewrite playlists on the fly. Stremio doesn't even notice.
          </div>
        </details>
        <details class="faq-item">
          <summary>How does it find content on obscure torrents?<span class="faq-icon text-2xl">+</span></summary>
          <div class="faq-body">
            It indexes 30+ trackers (direct + via Knaben + via Torrentio aggregator), including hard-to-reach ones. For anime it adds Nyaa, TokyoTosho and AniDex. Always sorts by language before quality.
          </div>
        </details>
        <details class="faq-item">
          <summary>What if I open S05E03 but only find a 5-season pack?<span class="faq-icon text-2xl">+</span></summary>
          <div class="faq-body">
            Pezzottio detects the right file inside the archive and passes it to Torbox/RealDebrid with the correct file_id. <strong>No more "I opened S05E03 but S01E01 starts playing"</strong>.
          </div>
        </details>
        <details class="faq-item">
          <summary>Can I use it on Android TV / Fire TV?<span class="faq-icon text-2xl">+</span></summary>
          <div class="faq-body">
            Yes. Generate the link above, scan the QR code from the TV (or copy the link manually). Works on Stremio Desktop, Mobile, Android TV, Fire TV, and Web (if the host is HTTPS).
          </div>
        </details>
        <details class="faq-item">
          <summary>Do I have to host anything (MediaFlowProxy, Docker, VPS)?<span class="faq-icon text-2xl">+</span></summary>
          <div class="faq-body">
            <strong>No.</strong> Pezzottio has the proxy built in inside its public server. You open the link, paste it in Stremio, done. Nothing to host on your side.
          </div>
        </details>
        <details class="faq-item">
          <summary>I see no streams, where do I ask for help?<span class="faq-icon text-2xl">+</span></summary>
          <div class="faq-body">
            Telegram: <a href="https://t.me/Mbhere1" target="_blank" rel="noopener" class="text-white underline hover:text-zinc-300">@Mbhere1</a>. Message me describing what you tried (title, screenshot if possible) and I'll reply as soon as I can.
          </div>
        </details>
      </div>
    </section>

    <!-- CTA finale -->
    <section class="py-14 md:py-20 text-center max-w-2xl mx-auto">
      <h2 class="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-5 leading-tight">
        Stop searching.<br>
        <span style="color:var(--red)">Start watching.</span>
      </h2>
      <p class="text-zinc-400 text-base sm:text-lg mb-8">
        One install. Everything in English. Ready in 30 seconds.
      </p>
      <a href="#setup" class="btn-primary inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 rounded uppercase text-sm sm:text-base">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        Generate my link
      </a>
    </section>

    <footer class="py-10 mt-10 border-t border-white/[0.06]">
      <div class="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
        <div class="flex items-center gap-4">
          <img src="/pezzottio-logo.png" alt="PEZZOTTIO" class="h-5 select-none opacity-70" draggable="false" />
          <span class="mono">${escape(hostOnly)}</span>
        </div>
        <div class="flex items-center gap-5 flex-wrap justify-center">
          <a href="https://t.me/Mbhere1" target="_blank" rel="noopener" class="hover:text-white transition flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            Support @Mbhere1
          </a>
          <span class="text-zinc-700">·</span>
          <a href="https://torbox.app/subscription" target="_blank" rel="noopener" class="hover:text-white transition">
            💎 Torbox
          </a>
          <span class="text-zinc-700">·</span>
          <a href="https://github.com/ceres777/pezzottio" target="_blank" rel="noopener" class="hover:text-white transition flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-2.13c-3.2.7-3.87-1.36-3.87-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.69.41.36.78 1.07.78 2.15v3.19c0 .31.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
            GitHub
          </a>
          <span class="text-zinc-700">·</span>
          <a href="/changelog" class="hover:text-white transition flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round"/></svg>
            <span id="last-update-text">Changelog</span>
          </a>
          <span class="text-zinc-700">·</span>
          <span>Open source · MIT</span>
        </div>
      </div>
    </footer>
  </main>

  <script>
    const $ = (s) => document.querySelector(s);
    const BASE = ${JSON.stringify(base)};
    const HOST = ${JSON.stringify(hostOnly)};
    let currentInstallUrl = null;

    function animateCount(el, target) {
      const dur = 900; const t0 = performance.now();
      function step(now) {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(eased * target);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
    setTimeout(() => {
      animateCount($('#counter-scrapers'), 30);
      animateCount($('#counter-external'), 4);
      animateCount($('#counter-http'), 4);
      animateCount($('#counter-ids'), 7);
    }, 250);

    // Banner breaking change (mostra ultima entry 'breaking' delle ultime 24h,
    // dismissable e ricordato in localStorage per non rompere le palle).
    async function loadNotice() {
      try {
        const r = await fetch('/api/notice');
        const d = await r.json();
        if (!d.notice) return;
        const dismissKey = 'pz-notice-' + (d.notice.date || '') + ':' + (d.notice.msg || '').slice(0, 32);
        if (localStorage.getItem(dismissKey) === '1') return;
        $('#notice-msg').textContent = d.notice.msg;
        $('#notice-banner').classList.remove('hidden');
        $('#notice-close').addEventListener('click', () => {
          localStorage.setItem(dismissKey, '1');
          $('#notice-banner').classList.add('hidden');
        });
      } catch (_) {}
    }
    loadNotice();

    // Widget "Ultimo update X fa" nel footer
    function timeAgo(dateStr) {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const days = Math.floor(diffMs / 86400000);
      if (days <= 0) return 'oggi';
      if (days === 1) return 'ieri';
      if (days < 7) return days + ' giorni fa';
      if (days < 30) return Math.floor(days / 7) + ' settimane fa';
      return Math.floor(days / 30) + ' mesi fa';
    }
    async function loadLastUpdate() {
      try {
        const r = await fetch('/api/changelog');
        const d = await r.json();
        const first = (d.entries || [])[0];
        if (first?.date) {
          const el = $('#last-update-text');
          if (el) el.textContent = 'Aggiornato ' + timeAgo(first.date);
        }
      } catch (_) {}
    }
    loadLastUpdate();

    // Live usage counter: fetch /api/usage, mostra "attivi adesso" e "ultime 24h".
    // Refresh ogni 60s. Endpoint può non esistere (es. cache.local.js non caricato)
    // → hidden silente.
    async function loadUsage() {
      try {
        const r = await fetch('/api/usage', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (typeof d.active1h !== 'number' || typeof d.active24h !== 'number') return;
        const box = $('#live-usage');
        const elH = $('#live-1h');
        const elD = $('#live-24h');
        if (elH) elH.textContent = d.active1h.toLocaleString('it-IT');
        if (elD) elD.textContent = d.active24h.toLocaleString('it-IT');
        if (box) box.classList.remove('hidden');
      } catch (_) {}
    }
    loadUsage();
    setInterval(loadUsage, 60_000);

    // === DONAZIONI CRYPTO ===
    // Copia indirizzo email (per la donazione via buono regalo Amazon Bitrefill).
    // Pattern .copy-addr-btn riusato anche se non c'è più la card crypto.
    document.querySelectorAll('.copy-addr-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const addr = btn.dataset.copyAddr;
        if (!addr) return;
        try { await navigator.clipboard.writeText(addr); } catch (_) {}
        const orig = btn.textContent;
        btn.textContent = '✓ Copiato';
        btn.style.color = '#10b981';
        setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1200);
      });
    });

    async function loadStatus() {
      try {
        const r = await fetch('/api/status');
        const d = await r.json();
        const list = $('#status-list'); list.innerHTML = '';
        for (const p of d.providers) {
          const dot = p.ok
            ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>'
            : '<span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span>';
          const row = document.createElement('div');
          row.className = 'flex items-center justify-between py-2 border-t border-white/[0.04]';
          row.innerHTML = '<span class="flex items-center gap-2.5 text-zinc-300">' + dot + p.name + '</span><span class="text-xs text-zinc-500 mono">' + (p.ms || 0) + 'ms</span>';
          list.appendChild(row);
        }
        $('#status-summary').textContent = d.summary.online + '/' + d.summary.total + ' online';
      } catch (_) {
        $('#status-summary').textContent = '—';
      }
    }
    loadStatus();

    document.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = $('#' + btn.dataset.toggle);
        const isPwd = input.type === 'password';
        input.type = isPwd ? 'text' : 'password';
        btn.textContent = isPwd ? 'nascondi' : 'mostra';
      });
    });

    function showStatus(text, kind) {
      const banner = $('#status-banner');
      $('#status-dot').className = 'w-2 h-2 rounded-full pulse-dot ' + (
        kind === 'ok' ? 'bg-emerald-400' :
        kind === 'err' ? 'bg-red-500' : 'bg-yellow-400'
      );
      $('#status-text').textContent = text;
      banner.classList.remove('hidden');
    }

    function setValidBadge(id, state, label) {
      const el = $('#' + id + '-valid');
      el.className = 'valid-badge ' + state;
      if (state === 'loading') el.innerHTML = '<div class="spinner"></div> verifico';
      else if (state === 'ok') el.innerHTML = '✓ ' + (label || 'valida');
      else if (state === 'err') el.innerHTML = '✗ ' + (label || 'non valida');
      else { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
    }
    function debounce(fn, wait) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; }
    async function testLive(which) {
      const val = $('#' + which + '-key').value.trim();
      if (!val) { $('#' + which + '-valid').classList.add('hidden'); return; }
      setValidBadge(which, 'loading');
      try {
        const body = which === 'rd' ? { rd: val } : { tb: val };
        const r = await fetch('/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json();
        const result = d[which];
        if (result.ok) {
          const user = (result.message || '').split('·')[0].trim();
          setValidBadge(which, 'ok', user || 'valida');
        } else {
          setValidBadge(which, 'err', result.message || 'non valida');
        }
      } catch (_) { setValidBadge(which, 'err', 'errore rete'); }
    }
    const dTestTb = debounce(() => testLive('tb'), 700);
    $('#tb-key').addEventListener('input', dTestTb);
    if ($('#tb-key').value) testLive('tb');
    // Stesso pattern per RD (riattivato)
    const dTestRd = debounce(() => testLive('rd'), 700);
    if ($('#rd-key')) {
      $('#rd-key').addEventListener('input', dTestRd);
      if ($('#rd-key').value) testLive('rd');
    }

    function base64UrlEncode(obj) {
      const json = JSON.stringify(obj);
      const b64 = btoa(unescape(encodeURIComponent(json)));
      return b64.replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    }

    // === PROFILI MULTIPLI ===
    // Ogni profilo ha solo un nome (e opzionalmente una chiave TB se in modalità
    // 'chiave diversa per profilo'). Le impostazioni sono quelle globali della
    // pagina (filter/style/order/fullIta/prefetch) e valgono per tutti i profili.
    let profiles = []; // { name, tb, rd }

    function renderProfiles() {
      const wrap = $('#profiles-list');
      if (!wrap) return;
      const perProfileKey = (document.querySelector('input[name="key-mode"]:checked') || {}).value === 'per-profile';
      wrap.innerHTML = '';
      if (!profiles.length) {
        wrap.innerHTML = '<p class="text-xs text-zinc-500 italic">Nessun profilo. Click "+ Aggiungi profilo" per crearne uno.</p>';
        return;
      }
      profiles.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'bg-white/[0.03] border border-white/[0.06] rounded p-3 space-y-2';
        const keyInputs = perProfileKey
          ? '<input type="password" data-profile-tb="' + i + '" value="' + (p.tb || '').replace(/"/g, '&quot;') + '"' +
              ' class="input mono w-full rounded px-2.5 py-1.5 text-xs"' +
              ' placeholder="Chiave Torbox (opzionale)" />' +
            '<input type="password" data-profile-rd="' + i + '" value="' + (p.rd || '').replace(/"/g, '&quot;') + '"' +
              ' class="input mono w-full rounded px-2.5 py-1.5 text-xs"' +
              ' placeholder="Chiave Real-Debrid (opzionale)" />' +
            '<div class="text-[10px] text-zinc-500">Inserisci almeno una delle due. Vuoto = usa le chiavi globali sopra.</div>'
          : '';
        row.innerHTML =
          '<div class="flex items-center gap-2">' +
            '<input type="text" data-profile-name="' + i + '" value="' + (p.name || '').replace(/"/g, '&quot;') + '"' +
              ' class="input flex-1 rounded px-2.5 py-1.5 text-xs" placeholder="Nome profilo (es. Famiglia)" />' +
            '<button type="button" data-profile-remove="' + i + '" class="text-zinc-500 hover:text-red-400 px-2 text-lg" title="Rimuovi">×</button>' +
          '</div>' +
          keyInputs;
        wrap.appendChild(row);
      });
      // Hook events
      wrap.querySelectorAll('[data-profile-name]').forEach((el) => {
        el.addEventListener('input', (e) => { profiles[+e.target.dataset.profileName].name = e.target.value; });
      });
      wrap.querySelectorAll('[data-profile-tb]').forEach((el) => {
        el.addEventListener('input', (e) => { profiles[+e.target.dataset.profileTb].tb = e.target.value.trim(); });
      });
      wrap.querySelectorAll('[data-profile-rd]').forEach((el) => {
        el.addEventListener('input', (e) => { profiles[+e.target.dataset.profileRd].rd = e.target.value.trim(); });
      });
      wrap.querySelectorAll('[data-profile-remove]').forEach((el) => {
        el.addEventListener('click', (e) => {
          profiles.splice(+e.target.dataset.profileRemove, 1);
          renderProfiles();
        });
      });
    }

    if ($('#add-profile')) {
      $('#add-profile').addEventListener('click', () => {
        if (profiles.length >= 5) { showStatus('Massimo 5 profili.', 'err'); return; }
        profiles.push({ name: 'Profilo ' + (profiles.length + 1), tb: '', rd: '' });
        renderProfiles();
      });
      document.querySelectorAll('input[name="key-mode"]').forEach((el) => {
        el.addEventListener('change', renderProfiles);
      });
      renderProfiles();
    }

    $('#generate-btn').addEventListener('click', async () => {
      const btn = $('#generate-btn');
      const tb = $('#tb-key').value.trim();
      const rd = ($('#rd-key') && $('#rd-key').value.trim()) || '';
      const order = (document.querySelector('input[name="order"]:checked') || {}).value || 'smart';

      // Senza chiave → genera comunque link "solo HTTP"
      let payload = {};
      let validTb = '';
      let validRd = '';

      if (tb || rd) {
        btn.disabled = true;
        btn.textContent = 'Verifico...';
        try {
          const res = await fetch('/api/test', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tb, rd })
          });
          const data = await res.json();
          validTb = (tb && data.tb && data.tb.ok) ? tb : '';
          validRd = (rd && data.rd && data.rd.ok) ? rd : '';
          if (tb && !validTb) showStatus('La key Torbox non risulta valida.', 'err');
          if (rd && !validRd) showStatus('La key Real-Debrid non risulta valida.', 'err');
        } catch (e) {
          showStatus('Errore di rete: ' + e.message, 'err');
          btn.textContent = 'Genera link'; btn.disabled = false; return;
        }
        if (validTb) payload.tb = validTb;
        if (validRd) payload.rd = validRd;
      }
      // Includo order solo se diverso dal default per tenere il link più corto
      if (order && order !== 'smart') payload.order = order;
      // Includo style solo se diverso dal default
      const styleSel = (document.querySelector('input[name="style"]:checked') || {}).value || 'pezzottio';
      if (styleSel !== 'pezzottio') payload.style = styleSel;
      // Filter: includo solo se diverso dal default 'all'
      const filterSel = (document.querySelector('input[name="filter"]:checked') || {}).value || 'all';
      if (filterSel !== 'all') payload.filter = filterSel;
      // Includo fullIta solo se attivato
      if ($('#full-ita-toggle') && $('#full-ita-toggle').checked) payload.fullIta = true;
      // Prefetch opt-in
      if ($('#prefetch-toggle') && $('#prefetch-toggle').checked) payload.prefetch = true;
      // Anime (default ON): salvo nel link solo se l'utente l'ha disattivato.
      if ($('#anime-toggle') && !$('#anime-toggle').checked) payload.httpAnime = false;

      // EN page: il link generato qui DEVE includere lang='en' così che
      // l'addon (su path /:CONFIG/stream/...) attivi il branch EN e skippi
      // i provider italiani. Senza questo, il backend ricade in default 'it'
      // e l'utente EN otterrebbe lo stesso comportamento ITA.
      payload.lang = 'en';

      // === MODALITÀ PROFILI MULTIPLI ===
      if (profiles.length > 0) {
        const keyMode = (document.querySelector('input[name="key-mode"]:checked') || {}).value || 'shared';
        // Valida chiavi per-profilo: ogni profilo deve avere almeno UNA chiave
        // (TB o RD, locale o globale via fallback).
        if (keyMode === 'per-profile') {
          const missing = profiles
            .filter((p) => !p.tb && !p.rd && !validTb && !validRd)
            .map((p) => p.name)
            .join(', ');
          if (missing) {
            showStatus('Inserisci almeno una chiave (Torbox o Real-Debrid) per: ' + missing, 'err');
            btn.textContent = 'Genera link'; btn.disabled = false;
            return;
          }
        }
        // Le impostazioni globali della pagina valgono per TUTTI i profili.
        // Le chiavi TB/RD: per-profile usa quella inserita nel profilo (con
        // fallback alla globale se vuota); shared usa solo le globali.
        const baseSettings = { ...payload };
        delete baseSettings.tb;
        delete baseSettings.rd;
        const results = profiles.map((p) => {
          const tbKey = keyMode === 'shared' ? validTb : (p.tb || validTb);
          const rdKey = keyMode === 'shared' ? validRd : (p.rd || validRd);
          const pPayload = { ...baseSettings };
          if (tbKey) pPayload.tb = tbKey;
          if (rdKey) pPayload.rd = rdKey;
          const enc = base64UrlEncode(pPayload);
          return {
            name: p.name || 'Profilo',
            installUrl: BASE + '/' + (enc || 'e30') + '/manifest.json',
            stremioUrl: 'stremio://' + HOST + '/' + (enc || 'e30') + '/manifest.json',
          };
        });
        // Render N install cards
        $('#install-card-title').textContent = 'Link generati (' + results.length + ' profili)';
        $('#install-card-subtitle').textContent = 'Installa ognuno in un profilo Stremio diverso.';
        $('#profiles-result').classList.remove('hidden');
        $('#profiles-result').innerHTML = results.map(function(r, i) {
          return '<div class="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">' +
            '<div class="flex items-center justify-between mb-3">' +
              '<div class="text-sm font-semibold text-white">' + String(r.name).replace(/</g,'&lt;') + '</div>' +
              '<span class="text-[10px] uppercase tracking-wider text-zinc-500">Profilo ' + (i + 1) + '</span>' +
            '</div>' +
            '<a href="' + r.stremioUrl + '" class="btn-stremio block text-center w-full px-4 py-2.5 rounded uppercase text-sm mb-2">' +
              '▶ Installa in Stremio' +
            '</a>' +
            '<div class="mono text-[10px] text-zinc-500 bg-black/40 rounded px-2 py-1.5 border border-white/[0.06] break-all">' + r.installUrl + '</div>' +
          '</div>';
        }).join('');
        // Nascondo elementi single-link
        $('#install-stremio').style.display = 'none';
        $('#copy-url').style.display = 'none';
        const qrParent = $('#qr-code')?.closest('.grid'); if (qrParent) qrParent.style.display = 'none';
        const urlEl = $('#install-url'); if (urlEl) urlEl.style.display = 'none';

        $('#install-card').classList.remove('hidden');
        $('#install-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
        showStatus(results.length + ' link pronti.', 'ok');
        btn.textContent = 'Rigenera link';
        btn.disabled = false;
        const colors = ['#38bdf8', '#c084fc', '#a78bfa'];
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors, ticks: 200, scalar: 0.8 });
        return;
      }

      // === MODALITÀ SINGOLA (default storico) ===
      const encoded = base64UrlEncode(payload);
      const installUrl = BASE + '/' + (encoded || 'e30') + '/manifest.json';
      const stremioUrl = 'stremio://' + HOST + '/' + (encoded || 'e30') + '/manifest.json';
      currentInstallUrl = installUrl;

      $('#install-card-title').textContent = 'Link generato';
      $('#install-card-subtitle').textContent = 'Univoco e legato alle tue chiavi. Non condividerlo.';
      $('#profiles-result').classList.add('hidden');
      $('#install-stremio').style.display = '';
      $('#copy-url').style.display = '';
      const qrParent = $('#qr-code')?.closest('.grid'); if (qrParent) qrParent.style.display = '';
      const urlEl = $('#install-url'); if (urlEl) urlEl.style.display = '';

      $('#install-url').textContent = installUrl;
      $('#install-stremio').href = stremioUrl;
      $('#install-card').classList.remove('hidden');

      const qrEl = $('#qr-code'); qrEl.innerHTML = '';
      new QRCode(qrEl, {
        text: installUrl, width: 160, height: 160,
        colorDark: '#08080c', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });

      if (location.protocol === 'https:' && installUrl.startsWith('http://')) {
        $('#mixed-warning').classList.remove('hidden');
      }

      $('#install-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      showStatus('Link pronto.', 'ok');
      btn.textContent = 'Rigenera link';
      btn.disabled = false;

      // Confetti sobri
      const colors = ['#c084fc', '#a78bfa', '#f0abfc'];
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 }, colors, ticks: 200, scalar: 0.8 });
    });

    $('#copy-url').addEventListener('click', async () => {
      if (!currentInstallUrl) return;
      await navigator.clipboard.writeText(currentInstallUrl);
      const b = $('#copy-url');
      const t = b.textContent;
      b.textContent = '✓ Copiato';
      setTimeout(() => b.textContent = t, 1400);
    });

    // Catalog extra: bottone separato, URL fisso al nostro proxy /extra/.
    // L'utente clicca PRIMA "Installa Catalogo" (Stremio aggiunge il catalog),
    // POI clicca "Installa Pezzottio". L'ordine di install determina l'ordine
    // dei catalog in home Stremio (primo installato = primo in lista).
    const EXTRA_CATALOG_URL = 'stremio://' + HOST + '/extra-en/manifest.json';
    // URL HTTPS per copia manuale (mirror del stremio:// che usa lo schema custom)
    const EXTRA_CATALOG_HTTPS = BASE + '/extra-en/manifest.json';
    const installCatBtn = $('#install-catalog');
    if (installCatBtn) installCatBtn.href = EXTRA_CATALOG_URL;
    // Copy link manuale catalogo (stesso pattern di #copy-url per Pezzottio)
    const copyCatBtn = $('#copy-catalog-url');
    if (copyCatBtn) {
      copyCatBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(EXTRA_CATALOG_HTTPS);
        } catch (_) {}
        const orig = copyCatBtn.textContent;
        copyCatBtn.textContent = '✓ Copiato';
        setTimeout(() => { copyCatBtn.textContent = orig; }, 1400);
      });
    }
  </script>
</body>
</html>`;
}

function escape(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

module.exports = { render };
