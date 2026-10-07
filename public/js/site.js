(() => {
  'use strict';

  // Segundos que a tela de agradecimento fica visível antes de liberar um novo voto
  const SEGUNDOS_AGRADECIMENTO = 6;

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
    erroGeral: $('.js-erro-geral'),
    obrigado: $('.js-obrigado'),
    escolha: $('.js-escolha'),
    escolhaImagem: $('.js-escolha-imagem'),
    escolhaNome: $('.js-escolha-nome'),
    contagem: $('.js-contagem'),
    novoVoto: $('.js-novo-voto'),
    encerrado: $('.js-encerrado'),
    dialogo: $('.js-dialogo'),
    confirmacaoImagem: $('.js-confirmacao-imagem'),
    confirmacaoItem: $('.js-confirmacao-item'),
    confirmar: $('.js-confirmar'),
    prazo: $('.js-prazo'),
    modeloOpcao: $('#modelo-opcao'),
  };

  const estado = {
    itens: [],
    selecionado: null,
    enviando: false,
    temporizador: null,
  };

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
      $('img', fragmento).src = item.imagem;
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
      $('.opcao__entrada', cartao).checked = ativo;
      $('.opcao__acao', cartao).textContent = ativo ? 'Item escolhido' : 'Escolher este item';
    });
    el.erroItem.textContent = '';
  }

  function itemSelecionado() {
    return estado.itens.find((item) => item.id === estado.selecionado);
  }

  // ---------- Confirmação e envio ----------

  function abrirConfirmacao() {
    const item = itemSelecionado();
    el.confirmacaoItem.textContent = item.nome;
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
        body: JSON.stringify({ itemId: estado.selecionado }),
      });
      fecharDialogo();

      if (resposta.status === 201) {
        exibirObrigado(itemSelecionado());
      } else if (resposta.status === 403) {
        mostrarPainel('encerrado');
      } else {
        mostrarErroGeral(resposta.dados.erro || 'Não foi possível registrar o voto. Tente novamente.');
      }
    } catch (erro) {
      fecharDialogo();
      mostrarErroGeral('Não foi possível enviar o voto. Verifique a conexão e tente novamente.');
    } finally {
      definirEnviando(false);
    }
  }

  // ---------- Agradecimento e volta para um novo voto ----------

  function exibirObrigado(item) {
    if (item) {
      el.escolhaNome.textContent = item.nome;
      el.escolhaImagem.src = item.imagem;
      el.escolhaImagem.alt = item.nome;
      el.escolha.hidden = false;
    } else {
      el.escolha.hidden = true;
    }
    mostrarPainel('obrigado');
    el.secao.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.obrigado.focus({ preventScroll: true });
    iniciarContagem();
  }

  function iniciarContagem() {
    pararContagem();
    let restante = SEGUNDOS_AGRADECIMENTO;
    const atualizar = () => {
      el.contagem.textContent = `A votação será liberada para o próximo colaborador em ${restante} s…`;
    };
    atualizar();
    estado.temporizador = window.setInterval(() => {
      restante -= 1;
      if (restante <= 0) {
        prepararNovoVoto();
      } else {
        atualizar();
      }
    }, 1000);
  }

  function pararContagem() {
    if (estado.temporizador) window.clearInterval(estado.temporizador);
    estado.temporizador = null;
  }

  function prepararNovoVoto() {
    pararContagem();
    estado.selecionado = null;
    $$('.opcao', el.opcoes).forEach((cartao) => {
      cartao.classList.remove('is-selecionada');
      $('.opcao__entrada', cartao).checked = false;
      $('.opcao__acao', cartao).textContent = 'Escolher este item';
    });
    el.erroItem.textContent = '';
    el.erroGeral.hidden = true;
    mostrarPainel('formulario');
    el.secao.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Carregamento ----------

  async function carregar() {
    mostrarPainel('carregando');
    try {
      const resposta = await chamarApi('/api/itens');
      if (!resposta.ok) throw new Error('Falha na API');

      const { itens, votacao } = resposta.dados;
      if (votacao && !votacao.aberta) {
        mostrarPainel('encerrado');
        return;
      }

      estado.itens = itens || [];
      renderizarItens(estado.itens);
      exibirPrazo(votacao);
      mostrarPainel('formulario');
    } catch (erro) {
      mostrarPainel('falha');
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
    if (!estado.selecionado) {
      el.erroItem.textContent = 'Escolha um dos itens acima para votar.';
      el.opcoes.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const primeira = $('.opcao__entrada', el.opcoes);
      if (primeira) primeira.focus({ preventScroll: true });
      return;
    }
    abrirConfirmacao();
  });

  el.confirmar.addEventListener('click', (evento) => {
    evento.preventDefault();
    enviarVoto();
  });

  el.dialogo.addEventListener('cancel', (evento) => {
    if (estado.enviando) evento.preventDefault();
  });

  el.novoVoto.addEventListener('click', prepararNovoVoto);
  el.tentarNovamente.addEventListener('click', carregar);

  preencherAno();
  criarNeve();
  carregar();
})();
