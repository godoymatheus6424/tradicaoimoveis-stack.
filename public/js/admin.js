// admin.js — preview, drag-and-drop, toggle destaque/ativo, delete

// =====================
// PREVIEW FOTOS
// =====================
function previewFotos(input) {
  const container = document.getElementById('previewNovos');
  if (!container) return;

  Array.from(input.files).forEach((file, i) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement('div');
      div.className = 'upload-preview__item';
      div.innerHTML = `
        <img src="${e.target.result}" alt="Preview ${i + 1}">
      `;
      container.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

// =====================
// DRAG AND DROP
// =====================
const uploadArea = document.getElementById('uploadArea');
if (uploadArea) {
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('upload-area--drag');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('upload-area--drag');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('upload-area--drag');
    const input = document.getElementById('fotosInput');
    if (input && e.dataTransfer.files.length) {
      const dt = new DataTransfer();
      Array.from(e.dataTransfer.files).forEach((f) => dt.items.add(f));
      input.files = dt.files;
      previewFotos(input);
    }
  });
}

// =====================
// DELETE IMÓVEL
// =====================
async function excluirImovel(id) {
  if (!confirm('Confirma a exclusão deste imóvel? Esta ação não pode ser desfeita.')) return;
  try {
    const res = await fetch(`/admin/imoveis/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      const row = document.getElementById(`row-${id}`);
      if (row) {
        row.style.transition = 'opacity 0.3s';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 300);
      }
    } else {
      alert('Erro ao excluir imóvel.');
    }
  } catch (err) {
    alert('Erro de conexão.');
  }
}

// =====================
// TOGGLE DESTAQUE
// =====================
async function toggleDestaque(id, btn) {
  try {
    const res = await fetch(`/admin/imoveis/${id}/destaque`, { method: 'PUT' });
    const json = await res.json();
    if (json.success) {
      // Reseta todos os botões de destaque da tabela
      document.querySelectorAll('.btn-destaque').forEach(b => {
        b.textContent = '☆ Normal';
        b.className = 'status btn-destaque';
        b.style.background = 'var(--surface-container-high)';
      });
      if (json.destaque) {
        btn.textContent = '★ Destaque';
        btn.className = 'status status--destaque btn-destaque';
        btn.style.background = '';
      }
    }
  } catch (err) {
    alert('Erro ao alterar destaque.');
  }
}

// =====================
// TOGGLE ATIVO
// =====================
async function toggleAtivo(id, btn) {
  try {
    const res = await fetch(`/admin/imoveis/${id}/ativo`, { method: 'PUT' });
    const json = await res.json();
    if (json.success) {
      const isAtivo = json.ativo;
      btn.textContent = isAtivo ? 'Ativo' : 'Inativo';
      btn.className = `status ${isAtivo ? 'status--active' : 'status--inactive'}`;
    }
  } catch (err) {
    alert('Erro ao alterar status.');
  }
}

// =====================
// DELETE FOTO
// =====================
async function deletarFoto(id) {
  if (!confirm('Excluir esta foto?')) return;
  try {
    const res = await fetch(`/admin/fotos/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      const el = document.getElementById(`foto-${id}`);
      if (el) {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
      }
    } else {
      alert('Erro ao excluir foto.');
    }
  } catch (err) {
    alert('Erro de conexão.');
  }
}

// =====================
// SET PRINCIPAL
// =====================
async function setPrincipal(id) {
  try {
    const res = await fetch(`/admin/fotos/${id}/principal`, { method: 'PUT' });
    const json = await res.json();
    if (json.success) {
      document.querySelectorAll('.upload-preview__item .upload-preview__star').forEach((el) => {
        el.textContent = 'Principal';
        el.setAttribute('onclick', `setPrincipal(${el.closest('.upload-preview__item').id.replace('foto-', '')})`);
      });
      const item = document.getElementById(`foto-${id}`);
      if (item) {
        const star = item.querySelector('.upload-preview__star');
        if (star) {
          star.textContent = '✓ Principal';
          star.removeAttribute('onclick');
        }
      }
    }
  } catch (err) {
    alert('Erro ao definir foto principal.');
  }
}

