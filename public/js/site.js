(() => {
  'use strict';

  // Chave usada para lembrar, neste navegador, que o colaborador já votou
  const CHAVE_VOTO_LOCAL = 'cci-pesquisa-natal-voto';

  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
  const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));

  const el = {
    secao: $('#votar'),
    carregando: $('.js-carregando'),
    falha: $('.js-falha'),
    tentarNovamente: $('.js-tentar-novamente'),
    formulario: $('.js-formulario'),
    opcoes: $('.js-opcoes'),
    erroItem: $('.js-erro-item'),
    nome: $('.js-nome'),
    erroNome: $('.js-erro-nome'),
    setor: $('.js-setor'),
    setores: $('.js-setores'),
    erroGeral: $('.js-erro-geral'),
    obrigado: $('.js-obrigado'),
    obrigadoTitulo: $('.js-obrigado-titulo'),
    obrigadoTexto: $('.js-obrigado-texto'),
    escolha: $('.js-escolha'),
    escolhaImagem: $('.js-escolha-imagem'),
    escolhaNome: $('.js-escolha-nome'),
    escolhaData: $('.js-escolha-data'),
    encerrado: $('.js-encerrado'),
    dialogo: $('.js-dialogo'),
    confirmacaoImagem: $('.js-confirmacao-imagem'),
    confirmacaoItem: $('.js-confirmacao-item'),
    confirmacaoNome: $('.js-confirmacao-nome'),
    confirmar: $('.js-confirmar'),
    prazo: $('.js-prazo'),
    modeloOpcao: $('#modelo-opcao'),
  };

  const estado = {
    itens: [],
    selecionado: null,
    enviando: false,
  };

  // ---------- Armazenamento local (o navegador lembra que já votou) ----------

  function lerVotoLocal() {
    try {
      const bruto = window.localStorage.getItem(CHAVE_VOTO_LOCAL);
      return bruto ? JSON.parse(bruto) : null;
    } catch (erro) {
      return null;
    }
  }

  function salvarVotoLocal(voto) {
    try {
      const registro = Object.assign({ jaVotou: true }, voto || {}, {
        salvoEm: new Date().toISOString(),
      });
      window.localStorage.setItem(CHAVE_VOTO_LOCAL, JSON.stringify(registro));
    } catch (erro) {
      // Navegação privada ou armazenamento bloqueado: o cookie do servidor ainda protege
    }
  }

  // ---------- Utilidades ----------

  async function chamarApi(caminho, opcoes = {}) {
    const cabecalhos = { Accept: 'application/json' };
    if (opcoes.body) cabecalhos['Content-Type'] = 'application/json';
    const resposta = await fetch(caminho, {
      credentials: 'same-origin',
      ...opcoes,
      headers: cabecalhos,
    });
    let dados = {};
    try {
      dados = await resposta.json();
    } catch (erro) {
      dados = {};
    }
    return { ok: resposta.ok, status: resposta.status, dados };
  }

  function limparTexto(valor) {
    return String(valor || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function primeiroNome(nome) {
    return limparTexto(nome).split(' ')[0] || '';
  }

  function formatarDataHora(iso) {
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return '';
    const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dia} às ${hora}`;
  }

  function mostrarPainel(qual) {
    const paineis = {
      carregando: el.carregando,
      falha: el.falha,
      formulario: el.formulario,
      obrigado: el.obrigado,
      encerrado: el.encerrado,
    };
    Object.entries(paineis).forEach(([nome, painel]) => {
      painel.hidden = nome !== qual;
    });
    el.secao.classList.toggle('is-concluida', qual === 'obrigado' || qual === 'encerrado');
  }

  function atualizarChamadas(texto) {
    $$('.js-texto-cta').forEach((alvo) => {
      alvo.textContent = texto;
    });
    $$('.topo__acao').forEach((alvo) => {
      alvo.textContent = texto === 'Escolher meu brinde' ? 'Votar agora' : texto;
    });
  }

  // ---------- Estados da página ----------

  function exibirObrigado(voto, { jaHavia }) {
    const nome = voto && voto.nome ? primeiroNome(voto.nome) : '';
    el.obrigadoTitulo.textContent = nome ? `Obrigado, ${nome}!` : 'Obrigado pelo seu voto!';
    el.obrigadoTexto.textContent = jaHavia
      ? 'Você já participou desta pesquisa. Sua escolha está guardada com a gente.'
      : 'Sua escolha já foi computada. Agora é só aguardar a cesta de fim de ano.';

    const item = voto && voto.item;
    if (item && item.nome) {
      el.escolhaNome.textContent = item.nome;
      el.escolhaData.textContent = voto.criadoEm
        ? `Voto registrado em ${formatarDataHora(voto.criadoEm)}`
        : '';
      if (item.imagem) {
        el.escolhaImagem.src = item.imagem;
        el.escolhaImagem.alt = item.nome;
        el.escolhaImagem.hidden = false;
      } else {
        el.escolhaImagem.hidden = true;
      }
      el.escolha.hidden = false;
    } else {
      el.escolha.hidden = true;
    }

    mostrarPainel('obrigado');
    atualizarChamadas('Ver meu voto');
  }

  function exibirPrazo(votacao) {
    if (!votacao || !votacao.encerraEm || !votacao.aberta) return;
    const data = new Date(votacao.encerraEm);
    const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
    const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    el.prazo.replaceChildren(
      document.createTextNode('Votação aberta até '),
      Object.assign(document.createElement('strong'), { textContent: `${dia}, ${hora}` }),
    );
    el.prazo.hidden = false;
  }

  // ---------- Opções de voto ----------

  function renderizarItens(itens) {
    el.opcoes.replaceChildren();
    itens.forEach((item, indice) => {
      const fragmento = el.modeloOpcao.content.cloneNode(true);
      const cartao = $('.opcao', fragmento);
      const entrada = $('.opcao__entrada', fragmento);
      const idNome = `opcao-nome-${item.id}`;
      const idDescricao = `opcao-descricao-${item.id}`;

      cartao.dataset.itemId = String(item.id);
      entrada.value = String(item.id);
      entrada.setAttribute('aria-labelledby', idNome);
      entrada.setAttribute('aria-describedby', idDescricao);

      $('.opcao__numero', fragmento).textContent = `Opção ${indice + 1}`;
      const imagem = $('img', fragmento);
      imagem.src = item.imagem;
      $('.opcao__nome', fragmento).textContent = item.nome;
      $('.opcao__nome', fragmento).id = idNome;
      $('.opcao__descricao', fragmento).textContent = item.descricao || '';
      $('.opcao__descricao', fragmento).id = idDescricao;

      entrada.addEventListener('change', () => selecionarItem(item.id));
      el.opcoes.appendChild(fragmento);
    });
  }

  function selecionarItem(id) {
    estado.selecionado = id;
    $$('.opcao', el.opcoes).forEach((cartao) => {
      const ativo = cartao.dataset.itemId === String(id);
      cartao.classList.toggle('is-selecionada', ativo);
      $('.opcao__acao', cartao).textContent = ativo ? 'Item escolhido' : 'Escolher este item';
    });
    el.erroItem.textContent = '';
  }

  function preencherSetores(setores) {
    el.setores.replaceChildren(
      ...(setores || []).map((setor) => Object.assign(document.createElement('option'), { value: setor })),
    );
  }

  // ---------- Validação e envio ----------

  function validarFormulario() {
    let valido = true;
    const nome = limparTexto(el.nome.value);

    if (!estado.selecionado) {
      el.erroItem.textContent = 'Escolha um dos itens acima para votar.';
      valido = false;
    }

    if (nome.length < 3 || !/\p{L}/u.test(nome)) {
      el.erroNome.textContent = 'Informe seu nome completo.';
      el.nome.setAttribute('aria-invalid', 'true');
      valido = false;
    } else {
      el.erroNome.textContent = '';
      el.nome.removeAttribute('aria-invalid');
    }

    if (!estado.selecionado) {
      el.opcoes.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const primeira = $('.opcao__entrada', el.opcoes);
      if (primeira) primeira.focus({ preventScroll: true });
    } else if (!valido) {
      el.nome.focus();
    }
    return valido;
  }

  function itemSelecionado() {
    return estado.itens.find((item) => item.id === estado.selecionado);
  }

  function abrirConfirmacao() {
    const item = itemSelecionado();
    el.confirmacaoItem.textContent = item.nome;
    el.confirmacaoNome.textContent = `Votante: ${limparTexto(el.nome.value)}`;
    el.confirmacaoImagem.src = item.imagem;
    el.confirmacaoImagem.alt = item.nome;

    if (typeof el.dialogo.showModal === 'function') {
      el.dialogo.showModal();
      el.confirmar.focus();
    } else if (window.confirm(`Confirmar seu voto em "${item.nome}"?`)) {
      enviarVoto();
    }
  }

  function definirEnviando(enviando) {
    estado.enviando = enviando;
    el.confirmar.disabled = enviando;
    el.confirmar.setAttribute('aria-busy', String(enviando));
    el.confirmar.textContent = enviando ? 'Enviando…' : 'Sim, confirmar voto';
  }

  function fecharDialogo() {
    if (el.dialogo.open) el.dialogo.close();
  }

  function mostrarErroGeral(mensagem) {
    el.erroGeral.textContent = mensagem;
    el.erroGeral.hidden = false;
  }

  async function enviarVoto() {
    if (estado.enviando) return;
    el.erroGeral.hidden = true;
    definirEnviando(true);

    try {
      const resposta = await chamarApi('/api/votos', {
        method: 'POST',
        body: JSON.stringify({
          itemId: estado.selecionado,
          nome: limparTexto(el.nome.value),
          setor: limparTexto(el.setor.value),
        }),
      });

      fecharDialogo();

      if (resposta.status === 201) {
        salvarVotoLocal(resposta.dados.voto);
        exibirObrigado(resposta.dados.voto, { jaHavia: false });
        el.obrigado.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.obrigado.focus({ preventScroll: true });
      } else if (resposta.status === 409) {
        salvarVotoLocal(null);
        exibirObrigado(null, { jaHavia: true });
      } else if (resposta.status === 403) {
        mostrarPainel('encerrado');
      } else {
        mostrarErroGeral(resposta.dados.erro || 'Não foi possível registrar seu voto. Tente novamente.');
      }
    } catch (erro) {
      fecharDialogo();
      mostrarErroGeral('Não foi possível enviar seu voto. Verifique sua conexão e tente novamente.');
    } finally {
      definirEnviando(false);
    }
  }

  // ---------- Carregamento ----------

  async function carregar() {
    const votoLocal = lerVotoLocal();
    if (votoLocal) {
      exibirObrigado(votoLocal, { jaHavia: true });
    } else {
      mostrarPainel('carregando');
    }

    try {
      const [respostaItens, respostaStatus] = await Promise.all([
        chamarApi('/api/itens'),
        chamarApi('/api/status'),
      ]);
      if (!respostaItens.ok || !respostaStatus.ok) throw new Error('Falha na API');

      const status = respostaStatus.dados;

      // O servidor reconhece este navegador (cookie) como já votante
      if (status.jaVotou) {
        const voto = status.voto || votoLocal;
        salvarVotoLocal(voto);
        exibirObrigado(voto, { jaHavia: true });
        return;
      }

      // O navegador guardou o voto localmente: continua bloqueado
      if (votoLocal) return;

      const { itens, setores, votacao } = respostaItens.dados;
      if (votacao && !votacao.aberta) {
        mostrarPainel('encerrado');
        atualizarChamadas('Ver aviso');
        return;
      }

      estado.itens = itens || [];
      renderizarItens(estado.itens);
      preencherSetores(setores);
      exibirPrazo(votacao);
      mostrarPainel('formulario');
    } catch (erro) {
      if (!votoLocal) mostrarPainel('falha');
    }
  }

  // ---------- Decoração ----------

  function criarNeve() {
    const alvo = $('.hero__neve');
    if (!alvo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const quantidade = window.innerWidth < 640 ? 16 : 28;
    for (let i = 0; i < quantidade; i += 1) {
      const floco = document.createElement('span');
      const tamanho = 4 + Math.random() * 6;
      floco.className = 'floco';
      floco.style.left = `${Math.random() * 100}%`;
      floco.style.width = `${tamanho}px`;
      floco.style.height = `${tamanho}px`;
      floco.style.opacity = String(0.35 + Math.random() * 0.5);
      floco.style.animationDuration = `${10 + Math.random() * 12}s`;
      floco.style.animationDelay = `${-Math.random() * 20}s`;
      floco.style.setProperty('--deriva', `${Math.round(Math.random() * 80 - 40)}px`);
      alvo.appendChild(floco);
    }
  }

  function preencherAno() {
    const ano = String(new Date().getFullYear());
    $$('.js-ano').forEach((alvo) => {
      alvo.textContent = ano;
    });
  }

  // ---------- Eventos ----------

  el.formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    el.erroGeral.hidden = true;
    if (validarFormulario()) abrirConfirmacao();
  });

  el.nome.addEventListener('input', () => {
    if (el.nome.getAttribute('aria-invalid') === 'true' && limparTexto(el.nome.value).length >= 3) {
      el.nome.removeAttribute('aria-invalid');
      el.erroNome.textContent = '';
    }
  });

  el.confirmar.addEventListener('click', (evento) => {
    evento.preventDefault();
    enviarVoto();
  });

  el.dialogo.addEventListener('cancel', (evento) => {
    if (estado.enviando) evento.preventDefault();
  });

  el.tentarNovamente.addEventListener('click', carregar);

  preencherAno();
  criarNeve();
  carregar();
})();
