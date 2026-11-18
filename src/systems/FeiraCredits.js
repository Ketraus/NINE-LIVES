// Ponto ÚNICO de integração com a Feira de Jogos (login Google + API de créditos).
// As cenas nunca chamam HTTP: só FeiraCredits.reportMilestone('nome').
// Falhas nunca lançam exceção nem afetam o jogo. O token vive só em memória.
import { FEIRA_CONFIG as CFG } from '../config/feiraConfig.js';

const state = { credential: null, expMs: 0, sub: null, started: false, done: new Set(), inflight: new Set() };

function parseJwt(jwt) {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeURIComponent(escape(atob(b64))));
    return { expMs: (payload.exp || 0) * 1000, sub: payload.sub || null };
  } catch (e) {
    return { expMs: 0, sub: null };
  }
}

function hasValidToken() {
  return Boolean(state.credential) && Date.now() < state.expMs - 30000;
}

function onCredential(res) {
  if (!res?.credential) return;
  const { expMs, sub } = parseJwt(res.credential);
  state.credential = res.credential;
  state.expMs = expMs;
  state.sub = sub;
}

function whenGoogleReady(cb, tries = 100) {
  if (globalThis.google?.accounts?.id) return cb();
  if (tries > 0) setTimeout(() => whenGoogleReady(cb, tries - 1), 100);
}

const FeiraCredits = {
  isEnabled() {
    return Boolean(CFG.GOOGLE_CLIENT_ID);
  },

  isSignedIn() {
    return hasValidToken();
  },

  // Chamar uma vez no boot. Sem client_id ou sem GIS, não faz nada.
  init() {
    if (state.started || !this.isEnabled()) return;
    state.started = true;
    whenGoogleReady(() => {
      try {
        globalThis.google.accounts.id.initialize({
          client_id: CFG.GOOGLE_CLIENT_ID,
          callback: onCredential,
          auto_select: true
        });
        globalThis.google.accounts.id.prompt();
      } catch (e) {
        console.warn('[FeiraCredits] falha ao iniciar o login Google', e);
      }
    });
  },

  // Pede novo login (token expirado ou usuário recusou o prompt).
  signIn() {
    if (!this.isEnabled()) return;
    whenGoogleReady(() => {
      try { globalThis.google.accounts.id.prompt(); } catch (e) { /* ignora */ }
    });
  },

  // Marco de progressão. Só concede se REWARDS[name] for um inteiro positivo.
  reportMilestone(name) {
    const value = CFG.REWARDS[name];
    if (!Number.isInteger(value) || value <= 0) return Promise.resolve({ ok: false, reason: 'reward-not-defined' });
    return this.grantCredits(name, value);
  },

  // Envio centralizado. `key` evita duplicar o mesmo marco na sessão da página.
  async grantCredits(key, value) {
    if (!this.isEnabled()) return { ok: false, reason: 'disabled' };
    if (!Number.isInteger(value) || value <= 0) return { ok: false, reason: 'invalid-value' };
    if (!hasValidToken()) { this.signIn(); return { ok: false, reason: 'not-signed-in' }; }
    if (!globalThis.axios) return { ok: false, reason: 'axios-missing' };
    const id = `${state.sub}:${key}`;
    if (state.done.has(id) || state.inflight.has(id)) return { ok: false, reason: 'duplicate' };
    state.inflight.add(id);
    try {
      await globalThis.axios.post(
        CFG.CREDIT_URL,
        { product: CFG.PRODUCT_ID, value },
        { headers: { Authorization: `Bearer ${state.credential}` }, timeout: CFG.REQUEST_TIMEOUT_MS }
      );
      state.done.add(id);
      return { ok: true };
    } catch (e) {
      console.warn('[FeiraCredits] falha ao enviar créditos', key, e?.response?.status || e?.message);
      return { ok: false, reason: 'request-failed', status: e?.response?.status || null };
    } finally {
      state.inflight.delete(id);
    }
  }
};

export default FeiraCredits;
