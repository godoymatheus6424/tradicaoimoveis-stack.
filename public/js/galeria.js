// galeria.js — standalone lightbox (used when galeria inline script is not present)
(function () {
  let fotosArr = [];
  let idx = 0;

  function criarLightbox() {
    if (document.getElementById('lb')) return;
    const lb = document.createElement('div');
    lb.id = 'lb';
    lb.className = 'lightbox';
    lb.innerHTML = `
      <button class="lightbox__close" id="lbClose">✕</button>
      <button class="lightbox__nav lightbox__nav--prev" id="lbPrev">&#8249;</button>
      <img class="lightbox__img" id="lbImg" src="" alt="">
      <button class="lightbox__nav lightbox__nav--next" id="lbNext">&#8250;</button>
    `;
    document.body.appendChild(lb);

    document.getElementById('lbClose').onclick = fechar;
    document.getElementById('lbPrev').onclick = () => nav(-1);
    document.getElementById('lbNext').onclick = () => nav(1);
    lb.onclick = (e) => { if (e.target === lb) fechar(); };
  }

  function abrir(fotos, i) {
    fotosArr = fotos;
    idx = i;
    criarLightbox();
    document.getElementById('lbImg').src = fotosArr[idx];
    document.getElementById('lb').classList.add('lightbox--open');
  }

  function fechar() {
    const lb = document.getElementById('lb');
    if (lb) lb.classList.remove('lightbox--open');
  }

  function nav(dir) {
    idx = (idx + dir + fotosArr.length) % fotosArr.length;
    document.getElementById('lbImg').src = fotosArr[idx];
  }

  document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('lb');
    if (!lb || !lb.classList.contains('lightbox--open')) return;
    if (e.key === 'Escape') fechar();
    if (e.key === 'ArrowLeft') nav(-1);
    if (e.key === 'ArrowRight') nav(1);
  });

  window.GaleriaLightbox = { abrir, fechar, nav };
})();
