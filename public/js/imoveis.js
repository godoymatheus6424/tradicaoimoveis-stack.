// =====================
// IMOVEIS PAGE — filtros + grid + liquid glass cards
// =====================
let paginaAtual = 1;
const LIMIT = 12;

function getFiltros() {
  return {
    tipo:         document.getElementById('filtroTipo')?.value || '',
    finalidade:   document.getElementById('filtroFinalidade')?.value || '',
    preco_max:    document.getElementById('filtroPrecoMax')?.value || '',
    quartos:      document.getElementById('filtroQuartos')?.value || '',
    categoria_id: document.getElementById('filtroCategoria')?.value || '',
  };
}

function cardImovel(im) {
  const foto = im.foto_principal
    ? `<img src="${im.foto_principal}" alt="${im.titulo}" loading="lazy">`
    : `<div class="glass-card__placeholder">🏠</div>`;

  const badge = im.destaque
    ? `<div class="glass-card__badge"><span class="glass-badge glass-badge--destaque">Destaque</span></div>`
    : im.novo
    ? `<div class="glass-card__badge"><span class="glass-badge glass-badge--novo">Novo</span></div>`
    : '';

  const specs = [
    im.quartos > 0       ? `<span class="glass-spec"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20V8a2 2 0 012-2h14a2 2 0 012 2v12"/><path d="M3 14h18"/><path d="M7 14v6"/><path d="M17 14v6"/></svg>${im.quartos}</span>` : '',
    im.banheiros > 0     ? `<span class="glass-spec"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/><path d="M4 12V6a2 2 0 012-2h4a2 2 0 012 2v6"/><rect x="2" y="12" width="20" height="4" rx="1"/><path d="M6 20v-4"/><path d="M18 20v-4"/></svg>${im.banheiros}</span>` : '',
    im.area_total        ? `<span class="glass-spec"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18"/><path d="M9 3v18"/></svg>${Math.round(im.area_total)}m²</span>` : '',
    im.vagas_garagem > 0 ? `<span class="glass-spec"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="9" width="22" height="11" rx="2"/><path d="M7 9V7a5 5 0 0110 0v2"/><circle cx="7.5" cy="15.5" r="1.5"/><circle cx="16.5" cy="15.5" r="1.5"/></svg>${im.vagas_garagem}</span>` : '',
  ].filter(Boolean).join('');

  const location = [im.bairro, im.cidade].filter(Boolean).join(', ');

  return `
    <a href="/imovel/${im.id}" class="glass-card">
      <div class="glass-card__media">${foto}</div>
      ${badge}
      <div class="glass-card__glass">
        <div class="glass-card__type">${im.categoria_nome || im.tipo}</div>
        <div class="glass-card__title">${im.titulo}</div>
        ${specs ? `<div class="glass-card__specs">${specs}</div>` : ''}
        <div class="glass-card__footer">
          <div class="glass-card__price">${im.preco_formatado}</div>
          <div class="glass-card__location">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            ${location}
          </div>
        </div>
      </div>
    </a>
  `;
}

function renderPaginacao(pagination) {
  const el = document.getElementById('paginacao');
  if (!el) return;
  if (pagination.pages <= 1) { el.innerHTML = ''; return; }

  let html = '';
  if (paginaAtual > 1)
    html += `<button class="pagination__btn" onclick="buscarImoveis(${paginaAtual - 1})">&#8249;</button>`;
  for (let i = 1; i <= pagination.pages; i++)
    html += `<button class="pagination__btn ${i === paginaAtual ? 'pagination__btn--active' : ''}" onclick="buscarImoveis(${i})">${i}</button>`;
  if (paginaAtual < pagination.pages)
    html += `<button class="pagination__btn" onclick="buscarImoveis(${paginaAtual + 1})">&#8250;</button>`;
  el.innerHTML = html;
}

async function buscarImoveis(pagina = 1) {
  paginaAtual = pagina;
  const params = new URLSearchParams({ ...getFiltros(), page: pagina, limit: LIMIT });

  const loading = document.getElementById('loading');
  const grid    = document.getElementById('imoveisGrid');
  const empty   = document.getElementById('emptyState');
  const count   = document.getElementById('imoveisCount');

  if (loading) loading.style.display = 'flex';
  if (grid)    grid.innerHTML = '';
  if (empty)   empty.style.display = 'none';

  try {
    const res  = await fetch(`/api/imoveis?${params}`);
    const json = await res.json();

    if (loading) loading.style.display = 'none';

    if (!json.success || json.data.length === 0) {
      if (empty) empty.style.display = 'block';
      if (count) count.textContent = '';
      renderPaginacao({ pages: 0 });
      return;
    }

    if (count) {
      const t = json.pagination.total;
      count.textContent = `${t} imóvel${t !== 1 ? 's' : ''} encontrado${t !== 1 ? 's' : ''}`;
    }

    if (grid) grid.innerHTML = json.data.map(cardImovel).join('');
    renderPaginacao(json.pagination);
    window.scrollTo({ top: document.querySelector('.imoveis-carousel-section')?.offsetTop - 70 || 0, behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    if (loading) loading.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnBuscar')?.addEventListener('click', () => buscarImoveis(1));

  ['filtroTipo', 'filtroFinalidade', 'filtroQuartos', 'filtroCategoria'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => buscarImoveis(1));
  });

  let timer;
  document.getElementById('filtroPrecoMax')?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => buscarImoveis(1), 600);
  });

  buscarImoveis(1);
});
