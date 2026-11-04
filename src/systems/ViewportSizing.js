// Keep FIT inside the visible browser area, including mobile browser bars.
// Logical scene dimensions stay fixed so HUD and touch controls keep their layout.
export function installViewportSizing() {
  const container = document.getElementById('game-container');
  let pending = false;
  const sync = () => {
    pending = false;
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    if (width <= 0 || height <= 0) return;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.left = `${viewport?.offsetLeft || 0}px`;
    container.style.top = `${viewport?.offsetTop || 0}px`;
    // Portrait hides the parent; refresh again when it becomes visible.
    if (container.getBoundingClientRect().width > 0) {
      window.__nineLivesGame?.scale.refresh();
    }
  };
  const schedule = () => {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(sync);
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  document.addEventListener('fullscreenchange', schedule);
  document.addEventListener('webkitfullscreenchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  sync();
}
