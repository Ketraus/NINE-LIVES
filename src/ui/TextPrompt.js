// Campo de texto em HTML por cima do jogo (senha da sala). O Phaser não tem
// input de texto e o DOM funciona igual em PC e celular (teclado nativo).
// Devolve uma Promise: o texto digitado, ou null se cancelou.

const FONT = '"Press Start 2P", monospace';

export default function promptText({ title, hint = '', password = false, maxLength = 16, confirmLabel = 'OK' } = {}) {
  return new Promise((resolve) => {
    const host = document.fullscreenElement || document.body;

    const backdrop = document.createElement('div');
    Object.assign(backdrop.style, {
      position: 'fixed', inset: '0', zIndex: '2000', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(2, 8, 12, 0.72)', fontFamily: FONT, touchAction: 'auto'
    });

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      width: 'min(420px, 88vw)', boxSizing: 'border-box', padding: '22px 20px 18px',
      background: 'rgba(6, 16, 20, 0.96)', border: '1px solid #8fd6ff',
      boxShadow: '0 0 24px rgba(79, 209, 255, 0.18)', color: '#cfefff', textAlign: 'center'
    });

    const heading = document.createElement('div');
    heading.textContent = title || '';
    Object.assign(heading.style, { fontSize: '12px', marginBottom: '10px', letterSpacing: '1px' });
    panel.appendChild(heading);

    if (hint) {
      const sub = document.createElement('div');
      sub.textContent = hint;
      Object.assign(sub.style, { fontSize: '8px', color: '#5f808c', marginBottom: '14px', lineHeight: '1.6' });
      panel.appendChild(sub);
    }

    const input = document.createElement('input');
    input.type = password ? 'password' : 'text';
    input.maxLength = maxLength;
    input.autocomplete = 'off';
    input.spellcheck = false;
    Object.assign(input.style, {
      width: '100%', boxSizing: 'border-box', padding: '12px 10px', marginBottom: '16px',
      background: '#061014', color: '#e8f6ff', border: '1px solid #3d5a66', outline: 'none',
      fontFamily: FONT, fontSize: '12px', textAlign: 'center', letterSpacing: '2px'
    });
    input.addEventListener('focus', () => { input.style.borderColor = '#8fd6ff'; });
    input.addEventListener('blur', () => { input.style.borderColor = '#3d5a66'; });
    panel.appendChild(input);

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '10px', justifyContent: 'center' });
    const makeButton = (label, primary) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      Object.assign(b.style, {
        flex: '1', padding: '11px 6px', cursor: 'pointer', fontFamily: FONT, fontSize: '9px',
        background: primary ? 'rgba(143, 214, 255, 0.16)' : 'rgba(6, 16, 20, 0.55)',
        color: primary ? '#e8f6ff' : '#8fb3bf',
        border: `1px solid ${primary ? '#8fd6ff' : '#3d5a66'}`
      });
      return b;
    };
    const cancel = makeButton('CANCELAR', false);
    const ok = makeButton(confirmLabel, true);
    row.append(cancel, ok);
    panel.appendChild(row);
    backdrop.appendChild(panel);
    host.appendChild(backdrop);

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      backdrop.remove();
      resolve(value);
    };

    // o Phaser escuta o teclado na janela: o que é digitado aqui não pode
    // chegar lá (senão ESPAÇO/ESC/WASD disparam coisas do jogo por trás)
    ['keydown', 'keyup', 'keypress'].forEach((type) => {
      backdrop.addEventListener(type, (event) => event.stopPropagation());
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(input.value);
      else if (event.key === 'Escape') finish(null);
    });
    ok.addEventListener('click', () => finish(input.value));
    cancel.addEventListener('click', () => finish(null));
    backdrop.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      if (event.target === backdrop) finish(null);
    });

    setTimeout(() => input.focus(), 30);
  });
}
