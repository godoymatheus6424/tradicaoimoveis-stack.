// =====================
// IMOVEIS PAGE — filtros + fetch + paginação
// =====================
let paginaAtual = 1;
const LIMIT = 12;

function getFiltros() {
  return {
    tipo: document.getElementById('filtroTipo')?.value || '',
    finalidade: document.getElementById('filtroFinalidade')?.value || '',
    preco_max: document.getElementById('filtroPrecoMax')?.value || '',
    quartos: document.getElementById('filtroQuartos')?.value || '',
    categoria_id: document.getElementById('filtroCategoria')?.value || '',
  };
}

function cardImovel(im) {
  const foto = im.foto_principal
    ? `<img src="${im.foto_principal}" alt="${im.titulo}" loading="lazy">`
    : `<div style="width:100%;height:100%;background:var(--surface-container-high);display:flex;align-items:center;justify-content:center;font-size:3rem;">🏠</div>`;

  const badge = im.destaque
    ? `<div class="card__badge"><span class="badge badge--primary">Destaque</span></div>`
    : im.novo
    ? `<div class="card__badge"><span class="badge badge--new">Novo</span></div>`
    : '';

  const specs = [
    im.quartos > 0 ? `<span class="card__spec">🛏 ${im.quartos}</span>` : '',
    im.banheiros > 0 ? `<span class="card__spec">🚿 ${im.banheiros}</span>` : '',
    im.area_total ? `<span class="card__spec">📐 ${Math.round(im.area_total)}m²</span>` : '',
    im.vagas_garagem > 0 ? `<span class="card__spec">🚗 ${im.vagas_garagem}</span>` : '',
  ]
    .filter(Boolean)
    .join('');

  return `
    <div class="card fade-in">
      <div class="card__image">
        ${badge}
        ${foto}
      </div>
      <div class="card__body">
        <div class="card__category">${im.categoria_nome || im.tipo}</div>
        <div class="card__title">${im.titulo}</div>
        <div class="card__specs">${specs}</div>
        <div class="card__price">${im.preco_formatado}</div>
        <div class="card__footer">
          <span class="card__location">${im.bairro ? im.bairro + ', ' : ''}${im.cidade}</span>
          <a href="/imovel/${im.id}" class="btn btn--ghost btn--sm">Saiba Mais</a>
        </div>
      </div>
    </div>
  `;
}

function renderPaginacao(pagination) {
  const el = document.getElementById('paginacao');
  if (!el) return;
  if (pagination.pages <= 1) { el.innerHTML = ''; return; }

  let html = '';
  if (paginaAtual > 1) {
    html += `<button class="pagination__btn" onclick="buscarImoveis(${paginaAtual - 1})">&#8249;</button>`;
  }
  for (let i = 1; i <= pagination.pages; i++) {
    html += `<button class="pagination__btn ${i === paginaAtual ? 'pagination__btn--active' : ''}" onclick="buscarImoveis(${i})">${i}</button>`;
  }
  if (paginaAtual < pagination.pages) {
    html += `<button class="pagination__btn" onclick="buscarImoveis(${paginaAtual + 1})">&#8250;</button>`;
  }
  el.innerHTML = html;
}

async function buscarImoveis(pagina = 1) {
  paginaAtual = pagina;
  const filtros = getFiltros();
  const params = new URLSearchParams({ ...filtros, page: pagina, limit: LIMIT });

  const loading = document.getElementById('loading');
  const grid = document.getElementById('imoveisGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('imoveisCount');

  if (loading) loading.style.display = 'block';
  if (grid) grid.innerHTML = '';
  if (empty) empty.style.display = 'none';

  try {
    const res = await fetch(`/api/imoveis?${params}`);
    const json = await res.json();

    if (loading) loading.style.display = 'none';

    if (!json.success || json.data.length === 0) {
      if (empty) empty.style.display = 'block';
      if (count) count.textContent = '';
      renderPaginacao({ pages: 0 });
      return;
    }

    if (count) {
      count.textContent = `${json.pagination.total} imóvel${json.pagination.total !== 1 ? 's' : ''} encontrado${json.pagination.total !== 1 ? 's' : ''}`;
    }

    if (grid) {
      grid.innerHTML = json.data.map(cardImovel).join('');
      // Re-trigger fade-in
      setTimeout(() => {
        if (window.setupFadeIn) setupFadeIn();
        else {
          document.querySelectorAll('.fade-in').forEach(el => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
          });
        }
      }, 50);
    }

    renderPaginacao(json.pagination);
    window.scrollTo({ top: document.querySelector('.imoveis-grid')?.offsetTop - 80 || 0, behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    if (loading) loading.style.display = 'none';
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  const btnBuscar = document.getElementById('btnBuscar');
  if (btnBuscar) {
    btnBuscar.addEventListener('click', () => buscarImoveis(1));
  }

  ['filtroTipo', 'filtroFinalidade', 'filtroQuartos', 'filtroCategoria'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => buscarImoveis(1));
  });

  const precoInput = document.getElementById('filtroPrecoMax');
  if (precoInput) {
    let timer;
    precoInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => buscarImoveis(1), 600);
    });
  }

  buscarImoveis(1);
});
