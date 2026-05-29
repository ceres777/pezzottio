require('dotenv').config();
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

// Codifica/decodifica config in URL-safe base64.
// La config è un piccolo JSON tipo { rd: "...", tb: "..." }.
function encodeConfig(obj) {
  return Buffer.from(JSON.stringify(obj || {})).toString('base64url');
}

function decodeConfig(str) {
  if (!str) return null;
  try {
    const parsed = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch (_) {
    return null;
  }
}

// Esegue un handler dentro un context con la config dell'utente.
// La config si propaga automaticamente attraverso async/await.
// publicHost (opzionale) viene salvato separato da user — così non finisce
// in encodeConfig(user) e nei link emessi: è meta-context per-request.
function runWithConfig(userConfig, fn, publicHost) {
  return als.run({ user: userConfig || {}, publicHost: publicHost || null }, fn);
}

function getConfig() {
  const store = als.getStore();
  const user = store?.user || {};
  // Lingua content: 'it' (default, comportamento attuale) | 'en' | 'mixed'.
  // Backward-compat: link senza `lang` → 'it' → zero impatto su utenti IT esistenti.
  const lang = (user.lang === 'en' || user.lang === 'mixed') ? user.lang : 'it';
  return {
    port: parseInt(process.env.PORT || '7001', 10),
    host: process.env.HOST || (process.env.RENDER || process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
    // publicHost: prima dal context ALS (per-request), poi env, poi null.
    publicHost: store?.publicHost || process.env.PUBLIC_HOST || null,
    realdebridKey: user.rd || '',
    torboxKey: user.tb || '',
    maxResults: parseInt(process.env.MAX_RESULTS || '25', 10),
    lang,
  };
}

// Restituisce la config dell'utente corrente (per lazy URL building)
function getCurrentUserConfig() {
  const store = als.getStore();
  return store?.user || null;
}

module.exports = { getConfig, runWithConfig, encodeConfig, decodeConfig, getCurrentUserConfig };
