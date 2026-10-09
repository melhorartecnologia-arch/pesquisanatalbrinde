(() => {
  'use strict';

  // Segundos que a tela de agradecimento fica visível antes de liberar um novo voto
  const SEGUNDOS_AGRADECIMENTO = 5;
  const REGEX_MATRICULA = /^[0-9A-Z./-]{1,20}$/;
  const ROTULOS = { cerveja: 'Cerveja', energetico: 'Energético' };

  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
  const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));

  const el = {
    secao: $('#votar'),
    carregando: $('.js-carregando'),
    falha: $('.js-falha'),
    tentarNovamente: $('.js-tentar-novamente'),
    formulario: $('.js-formulario'),
    grades: {
      cerveja: $('.js-opcoes[data-categoria="cerveja"]'),
      energetico: $('.js-opcoes[data-categoria="energetico"]'),
    },
    erroItem: $('.js-erro-item'),
    resumo: $('.js-resumo'),
    matricula: $('.js-matricula'),
    erroMatricula: $('.js-erro-matricula'),
    erroGeral: $('.js-erro-geral'),
    obrigado: $('.js-obrigado'),
    obrigadoMatricula: $('.js-obrigado-matricula'),
    escolhas: $('.js-escolhas'),
    contagem: $('.js-contagem'),
    encerrado: $('.js-encerrado'),
    dialogo: $('.js-dialogo'),
    confirmacaoEscolhas: $('.js-confirmacao-escolhas'),
    confirmacaoMatricula: $('.js-confirmacao-matricula'),
    confirmar: $('.js-confirmar'),
    prazo: $('.js-prazo'),
    modeloOpcao: $('#modelo-opcao'),
    modeloEscolha: $('#modelo-escolha'),
  };

  const estado = {
    produtos: { cerveja: [], energetico: [] },
    selecao: { cerveja: null, energetico: null },
    enviando: false,
    temporizador: null,
  };

  // ---------- Utilidades ----------

  async function chamarApi(caminho, opcoes = {}) {
    const cabecalhos = { Accept: 'application/json' };
    if (opcoes.body) cabecalhos['Content-Type'] = 'application/json';
    const resposta = await fetch(caminho, { credentials: 'same-origin', ...opcoes, headers: cabecalhos });
    let dados = {};
    try {
      dados = await resposta.json();
    } catch (erro) {
      dados = {};
    }
    return { ok: resposta.ok, status: resposta.status, dados };
  }

  function lerMatricula() {
    return el.matricula.value.replace(/\s+/g, '').toUpperCase();
  }

  function mostrarErroMatricula(mensagem) {
    el.erroMatricula.textContent = mensagem;
    el.matricula.setAttribute('aria-invalid', 'true');
    el.matricula.focus();
    el.matricula.select();
  }

  function limparErroMatricula() {
    el.erroMatricula.textContent = '';
    el.matricula.removeAttribute('aria-invalid');
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

  function produtoSelecionado(categoria) {
    return estado.produtos[categoria].find((produto) => produto.id === estado.selecao[categoria]) || null;
  }

  // ---------- Opções de voto ----------

  function renderizarCategoria(categoria) {
    const grade = el.grades[categoria];
    grade.replaceChildren();
    grade.style.setProperty('--colunas', String(Math.min(Math.max(estado.produtos[categoria].length, 1), 4)));
    estado.produtos[categoria].forEach((produto) => {
      const fragmento = el.modeloOpcao.content.cloneNode(true);
      const cartao = $('.opcao', fragmento);
      const entrada = $('.opcao__entrada', fragmento);
      const idNome = `opcao-nome-${produto.id}`;

      cartao.dataset.produtoId = String(produto.id);
      cartao.classList.add(`opcao--${categoria}`);
      entrada.name = categoria;
      entrada.value = String(produto.id);
      entrada.setAttribute('aria-labelledby', idNome);

      const imagem = $('img', fragmento);
      imagem.src = produto.imagem;
      $('.opcao__nome', fragmento).textContent = produto.nome;
      $('.opcao__nome', fragmento).id = idNome;
      $('.opcao__detalhe', fragmento).textContent = produto.detalhe || '';

      // Tocar no item já escolhido desmarca (as duas categorias são opcionais)
      entrada.addEventListener('click', () => {
        alternarSelecao(categoria, estado.selecao[categoria] === produto.id ? null : produto.id);
      });
      grade.appendChild(fragmento);
    });
  }

  function alternarSelecao(categoria, id) {
    estado.selecao[categoria] = id;
    $$('.opcao', el.grades[categoria]).forEach((cartao) => {
      const ativo = cartao.dataset.produtoId === String(id);
      cartao.classList.toggle('is-selecionada', ativo);
      $('.opcao__entrada', cartao).checked = ativo;
      $('.opcao__acao', cartao).textContent = ativo ? 'Escolhido · toque para desmarcar' : 'Escolher';
    });
    el.erroItem.textContent = '';
    atualizarResumo();
  }

  function atualizarResumo() {
    const partes = ['cerveja', 'energetico']
      .map((categoria) => produtoSelecionado(categoria))
      .filter(Boolean)
      .map((produto) => produto.nome);
    el.resumo.textContent = partes.length ? `Sua escolha: ${partes.join(' + ')}` : '';
  }

  // Cartão com a escolha de uma categoria (usado na confirmação e no agradecimento)
  function cartaoEscolha(categoria, produto) {
    const fragmento = el.modeloEscolha.content.cloneNode(true);
    const cartao = $('.escolha', fragmento);
    $('.escolha__rotulo', fragmento).textContent = ROTULOS[categoria];
    if (produto) {
      $('.escolha__imagem', fragmento).src = produto.imagem;
      $('.escolha__nome', fragmento).textContent = produto.nome;
      $('.escolha__detalhe', fragmento).textContent = produto.detalhe || '';
    } else {
      cartao.classList.add('escolha--vazia');
      $('.escolha__imagem', fragmento).remove();
      $('.escolha__nome', fragmento).textContent = 'Sem voto nesta categoria';
      $('.escolha__detalhe', fragmento).remove();
    }
    return fragmento;
  }

  function preencherEscolhas(alvo, cerveja, energetico) {
    alvo.replaceChildren(cartaoEscolha('cerveja', cerveja), cartaoEscolha('energetico', energetico));
  }

  // ---------- Confirmação e envio ----------

  function abrirConfirmacao() {
    const cerveja = produtoSelecionado('cerveja');
    const energetico = produtoSelecionado('energetico');
    preencherEscolhas(el.confirmacaoEscolhas, cerveja, energetico);
    el.confirmacaoMatricula.textContent = `Matrícula: ${lerMatricula()}`;

    if (typeof el.dialogo.showModal === 'function') {
      el.dialogo.showModal();
      el.confirmar.focus();
    } else if (window.confirm('Confirmar seu voto?')) {
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
          cervejaId: estado.selecao.cerveja,
          energeticoId: estado.selecao.energetico,
          matricula: lerMatricula(),
        }),
      });
      fecharDialogo();

      if (resposta.status === 201) {
        exibirObrigado(resposta.dados.voto);
      } else if (resposta.dados.campo === 'matricula') {
        mostrarErroMatricula(resposta.dados.erro);
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

  // ---------- Agradecimento e volta automática para um novo voto ----------

  function exibirObrigado(voto) {
    el.obrigadoMatricula.textContent = `Matrícula ${voto.matricula}. Seu voto já foi computado.`;
    preencherEscolhas(el.escolhas, voto.cerveja, voto.energetico);
    mostrarPainel('obrigado');
    el.secao.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.obrigado.focus({ preventScroll: true });
    iniciarContagem();
  }

  function iniciarContagem() {
    pararContagem();
    let restante = SEGUNDOS_AGRADECIMENTO;
    const atualizar = () => {
      el.contagem.textContent = `Próximo voto liberado automaticamente em ${restante} s…`;
    };
    atualizar();
    estado.temporizador = window.setInterval(() => {
      restante -= 1;
      if (restante <= 0) prepararNovoVoto();
      else atualizar();
    }, 1000);
  }

  function pararContagem() {
    if (estado.temporizador) window.clearInterval(estado.temporizador);
    estado.temporizador = null;
  }

  function prepararNovoVoto() {
    pararContagem();
    alternarSelecao('cerveja', null);
    alternarSelecao('energetico', null);
    el.matricula.value = '';
    limparErroMatricula();
    el.erroGeral.hidden = true;
    mostrarPainel('formulario');
    el.secao.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Carregamento ----------

  async function carregar() {
    mostrarPainel('carregando');
    try {
      const resposta = await chamarApi('/api/produtos');
      if (!resposta.ok) throw new Error('Falha na API');

      const { cervejas, energeticos, votacao } = resposta.dados;
      if (votacao && !votacao.aberta) {
        mostrarPainel('encerrado');
        return;
      }

      estado.produtos = { cerveja: cervejas || [], energetico: energeticos || [] };
      renderizarCategoria('cerveja');
      renderizarCategoria('energetico');
      exibirPrazo(votacao);
      mostrarPainel('formulario');
    } catch (erro) {
      mostrarPainel('falha');
    }
  }

  // ---------- Decoração: confete leve no destaque ----------

  function criarConfete() {
    const alvo = $('.hero__confete');
    if (!alvo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cores = ['#e2b24f', '#c9952e', '#e8378f', '#f28a1c', '#3aa05a', '#8f6718'];
    const quantidade = window.innerWidth < 640 ? 18 : 32;
    for (let i = 0; i < quantidade; i += 1) {
      const peca = document.createElement('span');
      const largura = 5 + Math.random() * 6;
      peca.className = 'confete';
      peca.style.left = `${Math.random() * 100}%`;
      peca.style.width = `${largura}px`;
      peca.style.height = `${largura * (1.6 + Math.random())}px`;
      peca.style.background = cores[i % cores.length];
      peca.style.opacity = String(0.45 + Math.random() * 0.4);
      peca.style.animationDuration = `${9 + Math.random() * 10}s`;
      peca.style.animationDelay = `${-Math.random() * 18}s`;
      peca.style.setProperty('--deriva', `${Math.round(Math.random() * 120 - 60)}px`);
      peca.style.setProperty('--giro', `${Math.round(360 + Math.random() * 540)}deg`);
      alvo.appendChild(peca);
    }
  }

  // ---------- Eventos ----------

  el.formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    el.erroGeral.hidden = true;
    if (!estado.selecao.cerveja && !estado.selecao.energetico) {
      el.erroItem.textContent = 'Escolha pelo menos uma cerveja ou um energético para votar.';
      el.grades.cerveja.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!REGEX_MATRICULA.test(lerMatricula())) {
      mostrarErroMatricula('Digite o código da sua matrícula para votar.');
      return;
    }
    limparErroMatricula();
    abrirConfirmacao();
  });

  el.confirmar.addEventListener('click', (evento) => {
    evento.preventDefault();
    enviarVoto();
  });

  el.dialogo.addEventListener('cancel', (evento) => {
    if (estado.enviando) evento.preventDefault();
  });

  el.matricula.addEventListener('input', () => {
    if (el.matricula.getAttribute('aria-invalid') === 'true') limparErroMatricula();
  });

  el.tentarNovamente.addEventListener('click', carregar);

  criarConfete();
  carregar();
})();
