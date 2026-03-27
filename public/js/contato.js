// contato.js — validação + submit via fetch
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('formContato');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const msgEl = document.getElementById('contatoMsg');
    const btn = form.querySelector('[type="submit"]');
    const data = Object.fromEntries(new FormData(form));

    // Validação client-side
    if (!data.nome || data.nome.trim().length < 2) {
      mostrarMsg(msgEl, 'Por favor, informe seu nome.', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!data.email || !emailRegex.test(data.email)) {
      mostrarMsg(msgEl, 'E-mail inválido.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Enviando...';

    try {
      const res = await fetch('/api/contatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();

      if (json.success) {
        mostrarMsg(msgEl, 'Mensagem enviada com sucesso! Entraremos em contato.', 'success');
        form.reset();
      } else {
        mostrarMsg(msgEl, json.error || 'Erro ao enviar. Tente novamente.', 'error');
      }
    } catch (err) {
      mostrarMsg(msgEl, 'Erro de conexão. Tente novamente.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar Mensagem';
    }
  });

  function mostrarMsg(el, texto, tipo) {
    if (!el) return;
    el.textContent = texto;
    el.style.color = tipo === 'success' ? '#1d641d' : 'var(--error)';
    el.style.padding = '0.5rem';
    el.style.borderRadius = '0.125rem';
    el.style.background = tipo === 'success' ? 'rgba(29,100,29,0.08)' : 'rgba(186,26,26,0.08)';
    setTimeout(() => {
      el.textContent = '';
      el.style.background = '';
    }, 6000);
  }
});
