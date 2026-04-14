// =====================
// FADE IN on scroll
// =====================
function setupFadeIn() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.fade-in').forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

// =====================
// SMOOTH SCROLL âncoras
// =====================
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// =====================
// PAGE LOADER
// =====================
(function () {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;

  const DURATION = 650; // deve bater com a transition do CSS

  // Sai subindo para cima
  function hideLoader() {
    loader.classList.remove('page-loader--below');
    loader.classList.add('page-loader--out');
  }

  if (document.readyState === 'complete') {
    hideLoader();
  } else {
    window.addEventListener('load', hideLoader);
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(hideLoader, 400);
    });
  }

  // bfcache: quando o usuário volta/avança no histórico, o browser
  // restaura a página congelada sem disparar 'load' — pageshow cobre esse caso
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) hideLoader();
  });

  // Entra vindo de baixo ao clicar em link interno
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a');
    if (
      !a || !a.href ||
      a.target === '_blank' ||
      a.href.startsWith('mailto:') ||
      a.href.startsWith('tel:') ||
      a.getAttribute('href')?.startsWith('#') ||
      !a.href.startsWith(location.origin)
    ) return;

    e.preventDefault();
    const dest = a.href;

    // 1. Posiciona abaixo (sem transição)
    loader.classList.remove('page-loader--out');
    loader.classList.add('page-loader--below');

    // 2. Força reflow e anima subindo até cobrir a tela
    loader.offsetHeight;
    loader.classList.remove('page-loader--below');

    // 3. Navega após a animação terminar
    setTimeout(function () {
      window.location.href = dest;
    }, DURATION);
  });
})();

// =====================
// INIT
// =====================
document.addEventListener('DOMContentLoaded', () => {
  setupFadeIn();
});
