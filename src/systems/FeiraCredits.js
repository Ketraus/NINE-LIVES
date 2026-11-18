// Ponto ÚNICO de integração com a Feira de Jogos (login Google + API de créditos).
// As cenas nunca chamam HTTP: só FeiraCredits.reportMilestone('nome').
// Falhas nunca lançam exceção nem afetam o jogo. O token vive só em memória.
import { FEIRA_CONFIG as CFG } from '../config/feiraConfig.js';

const state = { credential: null, expMs: 0, sub: null, started: false, done: new Set(), inflight: new Set(), granted: {} };

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
  hideGate();
}

function whenGoogleReady(cb, onFail, tries = 100) {
  if (globalThis.google?.accounts?.id) return cb();
  if (tries > 0) return setTimeout(() => whenGoogleReady(cb, onFail, tries - 1), 100);
  if (onFail) onFail();
}

// Tela de login obrigatória: cobre o jogo até o Google devolver a credencial.
let gateEl = null;

function showGate(message, withButton) {
  if (!gateEl) {
    gateEl = document.createElement('div');
    gateEl.style.cssText = 'position:fixed;inset:0;z-index:2000;background:#050608;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;text-align:center;font-family:"Press Start 2P",monospace;';
    document.body.appendChild(gateEl);
  }
  gateEl.innerHTML = '';
  const title = document.createElement('div');
  title.textContent = 'NINE LIVES';
  title.style.cssText = 'font-size:28px;letter-spacing:4px;';
  const text = document.createElement('div');
  text.textContent = message;
  text.style.cssText = 'font-size:12px;line-height:1.8;max-width:560px;color:#c8ccd4;';
  gateEl.append(title, text);
  if (withButton) {
    const box = document.createElement('div');
    gateEl.appendChild(box);
    globalThis.google.accounts.id.renderButton(box, { theme: 'filled_black', size: 'large', text: 'signin_with', locale: 'pt-BR' });
  } else {
    const btn = document.createElement('button');
    btn.textContent = 'RECARREGAR';
    btn.style.cssText = 'font-family:inherit;font-size:12px;padding:12px 20px;cursor:pointer;';
    btn.onclick = () => location.reload();
    gateEl.appendChild(btn);
  }
}

function hideGate() {
  gateEl?.remove();
  gateEl = null;
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
    const fail = () => showGate('Não foi possível carregar o login do Google. Verifique a conexão e recarregue a página.', false);
    showGate('Carregando login...', false);
    gateEl.lastChild.remove(); // sem botão enquanto carrega
    whenGoogleReady(() => {
      try {
        globalThis.google.accounts.id.initialize({
          client_id: CFG.GOOGLE_CLIENT_ID,
          callback: onCredential,
          auto_select: true
        });
        showGate('Entre com sua conta Google para jogar e receber seus tijolinhos.', true);
        globalThis.google.accounts.id.prompt();
      } catch (e) {
        console.warn('[FeiraCredits] falha ao iniciar o login Google', e);
        fail();
      }
    }, fail);
  },

  // Pede novo login (token expirado ou usuário recusou o prompt).
  signIn() {
    if (!this.isEnabled()) return;
    whenGoogleReady(() => {
      try { globalThis.google.accounts.id.prompt(); } catch (e) { /* ignora */ }
    });
  },

  // Marco de progressão. REWARDS guarda o TOTAL do marco (não soma): envia só a
  // diferença para o que a conta já recebeu nesta sessão (ex.: 500 -> 550 envia 50).
  async reportMilestone(name) {
    const total = CFG.REWARDS[name];
    if (!Number.isInteger(total) || total <= 0) return { ok: false, reason: 'reward-not-defined' };
    const delta = total - (state.granted[state.sub] || 0);
    if (delta <= 0) return { ok: false, reason: 'already-covered' };
    const result = await this.grantCredits(name, delta);
    if (result.ok) state.granted[state.sub] = Math.max(state.granted[state.sub] || 0, total);
    return result;
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
