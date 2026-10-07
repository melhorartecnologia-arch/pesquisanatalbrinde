(() => {
  'use strict';

  const INTERVALO_ATUALIZACAO_MS = 30000;

  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
  const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));

  const el = {
    telaLogin: $('.js-tela-login'),
    telaPainel: $('.js-tela-painel'),
    formLogin: $('.js-form-login'),
    senha: $('.js-senha'),
    alternarSenha: $('.js-alternar-senha'),
    erroLogin: $('.js-erro-login'),
    entrar: $('.js-entrar'),
    conteudo: $('.js-conteudo'),
    atualizar: $('.js-atualizar'),
    sair: $('.js-sair'),
    erroPainel: $('.js-erro-painel'),
    etiquetaVotacao: $('.js-etiqueta-votacao'),
    atualizadoEm: $('.js-atualizado-em'),
    total: $('.js-total'),
    totalDetalhe: $('.js-total-detalhe'),
    lider: $('.js-lider'),
    liderDetalhe: $('.js-lider-detalhe'),
    hoje: $('.js-hoje'),
    ultimo: $('.js-ultimo'),
    ultimoDetalhe: $('.js-ultimo-detalhe'),
    grafico: $('.js-grafico'),
    graficoVazio: $('.js-grafico-vazio'),
    diaCabecalho: $('.js-dia-cabecalho'),
    diaCorpo: $('.js-dia-corpo'),
    diaVazio: $('.js-dia-vazio'),
    votosCorpo: $('.js-votos-corpo'),
    votosVazio: $('.js-votos-vazio'),
    votosContagem: $('.js-votos-contagem'),
    filtroItem: $('.js-filtro-item'),
    dica: $('.js-dica'),
    dialogoExcluir: $('.js-dialogo-excluir'),
    excluirNumero: $('.js-excluir-numero'),
    excluirItem: $('.js-excluir-item'),
    confirmarExclusao: $('.js-confirmar-exclusao'),
  };

  const estado = {
    resultado: null,
    votos: [],
    votoParaExcluir: null,
    temporizador: null,
    carregando: false,
  };

  // ---------- Utilidades ----------

  class SessaoExpirada extends Error {}

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
    if (resposta.status === 401 && !caminho.endsWith('/login')) throw new SessaoExpirada(dados.erro);
    return { ok: resposta.ok, status: resposta.status, dados };
  }

  function criar(tag, propriedades = {}, filhos = []) {
    const elemento = document.createElement(tag);
    Object.entries(propriedades).forEach(([chave, valor]) => {
      if (chave === 'classe') elemento.className = valor;
      else if (chave === 'texto') elemento.textContent = valor;
      else if (chave.startsWith('data-') || chave.startsWith('aria-') || chave === 'role') {
        elemento.setAttribute(chave, valor);
      } else elemento[chave] = valor;
    });
    filhos.forEach((filho) => {
      if (filho !== null && filho !== undefined) {
        elemento.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
      }
    });
    return elemento;
  }

  const formatoNumero = new Intl.NumberFormat('pt-BR');

  function formatarPercentual(valor) {
    return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  function plural(quantidade, singular, pluralTexto) {
    return `${formatoNumero.format(quantidade)} ${quantidade === 1 ? singular : pluralTexto}`;
  }

  function formatarDataHora(iso) {
    const data = new Date(iso);
    return `${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  function tempoRelativo(iso) {
    const segundos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (segundos < 60) return 'agora mesmo';
    const minutos = Math.round(segundos / 60);
    if (minutos < 60) return `há ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `há ${horas} h`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
  }

  // ---------- Telas ----------

  function mostrarLogin(mensagem) {
    pararAtualizacaoAutomatica();
    el.telaPainel.hidden = true;
    el.telaLogin.hidden = false;
    el.senha.value = '';
    if (mensagem) {
      el.erroLogin.textContent = mensagem;
      el.erroLogin.hidden = false;
    } else {
      el.erroLogin.hidden = true;
    }
    el.senha.focus();
  }

  function mostrarPainel() {
    el.telaLogin.hidden = true;
    el.telaPainel.hidden = false;
    carregarTudo();
    iniciarAtualizacaoAutomatica();
  }

  // ---------- Login ----------

  el.formLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!el.senha.value) {
      el.erroLogin.textContent = 'Digite a senha.';
      el.erroLogin.hidden = false;
      el.senha.focus();
      return;
    }
    el.entrar.disabled = true;
    el.entrar.textContent = 'Entrando…';
    try {
      const resposta = await chamarApi('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ senha: el.senha.value }),
      });
      if (resposta.ok) {
        mostrarPainel();
      } else {
        el.erroLogin.textContent = resposta.dados.erro || 'Não foi possível entrar.';
        el.erroLogin.hidden = false;
        el.senha.select();
      }
    } catch (erro) {
      el.erroLogin.textContent = 'Falha de conexão com o servidor.';
      el.erroLogin.hidden = false;
    } finally {
      el.entrar.disabled = false;
      el.entrar.textContent = 'Entrar no painel';
    }
  });

  el.alternarSenha.addEventListener('click', () => {
    const visivel = el.senha.type === 'text';
    el.senha.type = visivel ? 'password' : 'text';
    el.alternarSenha.textContent = visivel ? 'Mostrar' : 'Ocultar';
    el.alternarSenha.setAttribute('aria-pressed', String(!visivel));
    el.senha.focus();
  });

  el.sair.addEventListener('click', async () => {
    try {
      await chamarApi('/api/admin/logout', { method: 'POST' });
    } finally {
      mostrarLogin();
    }
  });

  // ---------- Carregamento dos dados ----------

  async function carregarTudo() {
    if (estado.carregando) return;
    estado.carregando = true;
    el.conteudo.classList.add('is-atualizando');
    el.atualizar.disabled = true;

    try {
      const [resultado, votos] = await Promise.all([
        chamarApi('/api/admin/resultado'),
        chamarApi('/api/admin/votos'),
      ]);
      if (!resultado.ok || !votos.ok) throw new Error(resultado.dados.erro || votos.dados.erro);

      estado.resultado = resultado.dados;
      estado.votos = votos.dados.votos || [];
      el.erroPainel.hidden = true;

      renderizarIndicadores();
      renderizarGrafico();
      renderizarDias();
      atualizarFiltroItens();
      renderizarVotos();

      el.atualizadoEm.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
    } catch (erro) {
      if (erro instanceof SessaoExpirada) {
        mostrarLogin('Sua sessão expirou. Entre novamente.');
        return;
      }
      el.erroPainel.textContent = 'Não foi possível atualizar os dados. Tente novamente em instantes.';
      el.erroPainel.hidden = false;
    } finally {
      estado.carregando = false;
      el.conteudo.classList.remove('is-atualizando');
      el.atualizar.disabled = false;
    }
  }

  function iniciarAtualizacaoAutomatica() {
    pararAtualizacaoAutomatica();
    estado.temporizador = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !el.telaPainel.hidden) carregarTudo();
    }, INTERVALO_ATUALIZACAO_MS);
  }

  function pararAtualizacaoAutomatica() {
    if (estado.temporizador) window.clearInterval(estado.temporizador);
    estado.temporizador = null;
  }

  el.atualizar.addEventListener('click', carregarTudo);

  // ---------- Indicadores ----------

  function renderizarIndicadores() {
    const r = estado.resultado;

    if (r.votacao.aberta) {
      el.etiquetaVotacao.className = 'etiqueta etiqueta--aberta js-etiqueta-votacao';
      el.etiquetaVotacao.textContent = r.votacao.encerraEm
        ? `Votação aberta até ${formatarDataHora(r.votacao.encerraEm)}`
        : 'Votação aberta';
    } else {
      el.etiquetaVotacao.className = 'etiqueta etiqueta--encerrada js-etiqueta-votacao';
      el.etiquetaVotacao.textContent = `Votação encerrada em ${formatarDataHora(r.votacao.encerraEm)}`;
    }

    el.total.textContent = formatoNumero.format(r.total);
    el.totalDetalhe.textContent = r.primeiroVoto
      ? `desde ${new Date(r.primeiroVoto).toLocaleDateString('pt-BR')}`
      : 'nenhum voto ainda';

    const lideres = r.itens.filter((item) => item.lider);
    if (r.total === 0 || lideres.length === 0) {
      el.lider.textContent = '–';
      el.liderDetalhe.textContent = 'aguardando votos';
    } else if (lideres.length > 1) {
      el.lider.textContent = 'Empate';
      el.liderDetalhe.textContent = `${lideres.map((item) => item.nome).join(' e ')} · ${plural(
        lideres[0].votos,
        'voto',
        'votos',
      )} cada`;
    } else {
      const [lider] = lideres;
      const segundo = r.itens
        .filter((item) => item.id !== lider.id)
        .reduce((maior, item) => Math.max(maior, item.votos), 0);
      el.lider.textContent = lider.nome;
      el.liderDetalhe.textContent = `${formatarPercentual(lider.percentual)} · ${plural(
        lider.votos - segundo,
        'voto',
        'votos',
      )} à frente`;
    }

    el.hoje.textContent = formatoNumero.format(r.hoje);

    if (r.ultimoVoto) {
      el.ultimo.textContent = tempoRelativo(r.ultimoVoto);
      el.ultimoDetalhe.textContent = formatarDataHora(r.ultimoVoto);
    } else {
      el.ultimo.textContent = '–';
      el.ultimoDetalhe.textContent = '';
    }
  }

  // ---------- Gráfico de barras ----------

  function renderizarGrafico() {
    const r = estado.resultado;
    const empate = r.itens.filter((item) => item.lider).length > 1;
    el.graficoVazio.hidden = r.total > 0;

    const barras = r.itens.map((item) => {
      const valor = criar('span', { classe: 'barra__valor' }, [
        criar('strong', { texto: formatoNumero.format(item.votos) }),
        ` ${item.votos === 1 ? 'voto' : 'votos'} · ${formatarPercentual(item.percentual)}`,
      ]);
      const nome = criar('span', { classe: 'barra__nome' }, [item.nome]);
      if (item.lider) {
        nome.append(criar('span', { classe: 'barra__selo', texto: empate ? 'Empate' : 'Líder' }));
      }

      const preenchimento = criar('div', { classe: 'barra__preenchimento' });
      preenchimento.style.width = `${item.percentual}%`;

      const barra = criar(
        'div',
        {
          classe: `barra${item.lider ? ' barra--lider' : ''}`,
          role: 'listitem',
          tabIndex: 0,
          'aria-label': `${item.nome}: ${plural(item.votos, 'voto', 'votos')}, ${formatarPercentual(item.percentual)}`,
        },
        [
          criar('img', { classe: 'barra__miniatura', src: item.imagem, alt: '' }),
          criar('div', { classe: 'barra__cabecalho' }, [nome, valor]),
          criar('div', { classe: 'barra__trilho' }, [preenchimento]),
        ],
      );

      const mostrar = (x, y) => mostrarDica(item, x, y);
      barra.addEventListener('pointermove', (evento) => {
        const trilho = $('.barra__trilho', barra).getBoundingClientRect();
        mostrar(evento.clientX, trilho.top);
      });
      barra.addEventListener('pointerleave', esconderDica);
      barra.addEventListener('focus', () => {
        const trilho = $('.barra__trilho', barra).getBoundingClientRect();
        mostrar(trilho.left + trilho.width / 2, trilho.top);
      });
      barra.addEventListener('blur', esconderDica);
      return barra;
    });

    el.grafico.replaceChildren(...barras);
  }

  function mostrarDica(item, x, y) {
    el.dica.replaceChildren(
      criar('strong', { texto: formatarPercentual(item.percentual) }),
      `${plural(item.votos, 'voto', 'votos')} · ${item.nome}`,
    );
    el.dica.style.left = `${Math.min(Math.max(x, 120), window.innerWidth - 120)}px`;
    el.dica.style.top = `${y}px`;
    el.dica.hidden = false;
  }

  function esconderDica() {
    el.dica.hidden = true;
  }

  window.addEventListener('scroll', esconderDica, { passive: true });

  // ---------- Tabela por dia ----------

  function renderizarDias() {
    const r = estado.resultado;
    el.diaVazio.hidden = r.porDia.length > 0;
    el.diaCabecalho.replaceChildren();
    el.diaCorpo.replaceChildren();
    const tabela = el.diaCorpo.closest('table');
    const rodapeAntigo = tabela.querySelector('tfoot');
    if (rodapeAntigo) rodapeAntigo.remove();
    if (r.porDia.length === 0) return;

    el.diaCabecalho.append(
      criar('tr', {}, [
        criar('th', { scope: 'col', texto: 'Dia' }),
        ...r.itens.map((item) => criar('th', { scope: 'col', texto: item.nome })),
        criar('th', { scope: 'col', texto: 'Total' }),
      ]),
    );

    r.porDia.forEach((grupo) => {
      el.diaCorpo.append(
        criar('tr', {}, [
          criar('td', { texto: grupo.dia }),
          ...r.itens.map((item) => criar('td', { texto: formatoNumero.format(grupo.votos[item.id] || 0) })),
          criar('td', { texto: formatoNumero.format(grupo.total) }),
        ]),
      );
    });

    tabela.append(
      criar('tfoot', {}, [
        criar('tr', {}, [
          criar('td', { texto: 'Total' }),
          ...r.itens.map((item) => criar('td', { texto: formatoNumero.format(item.votos) })),
          criar('td', { texto: formatoNumero.format(r.total) }),
        ]),
      ]),
    );
  }

  // ---------- Lista de votos ----------

  function atualizarFiltroItens() {
    const atual = el.filtroItem.value;
    el.filtroItem.replaceChildren(
      criar('option', { value: '', texto: 'Todos os itens' }),
      ...estado.resultado.itens.map((item) => criar('option', { value: String(item.id), texto: item.nome })),
    );
    el.filtroItem.value = $$('option', el.filtroItem).some((opcao) => opcao.value === atual) ? atual : '';
  }

  function renderizarVotos() {
    const itemFiltro = el.filtroItem.value;
    const filtrados = estado.votos.filter((voto) => !itemFiltro || String(voto.itemId) === itemFiltro);

    el.votosContagem.textContent = `${formatoNumero.format(filtrados.length)} de ${plural(
      estado.votos.length,
      'voto',
      'votos',
    )}`;

    el.votosVazio.hidden = filtrados.length > 0;
    el.votosCorpo.replaceChildren(
      ...filtrados.map((voto) => {
        const botaoExcluir = criar('button', {
          type: 'button',
          classe: 'botao-texto',
          texto: 'Excluir',
          'aria-label': `Excluir voto nº ${voto.id}`,
        });
        botaoExcluir.addEventListener('click', () => pedirExclusao(voto));

        return criar('tr', {}, [
          criar('td', { classe: 'tabela__nome', texto: String(voto.id) }),
          criar('td', { texto: voto.itemNome }),
          criar('td', { texto: voto.dataFormatada }),
          criar('td', {}, [botaoExcluir]),
        ]);
      }),
    );
  }

  el.filtroItem.addEventListener('change', renderizarVotos);

  // ---------- Exclusão ----------

  function pedirExclusao(voto) {
    estado.votoParaExcluir = voto;
    el.excluirNumero.textContent = String(voto.id);
    el.excluirItem.textContent = voto.itemNome;
    el.dialogoExcluir.showModal();
  }

  el.confirmarExclusao.addEventListener('click', async (evento) => {
    evento.preventDefault();
    const voto = estado.votoParaExcluir;
    if (!voto) return;
    el.confirmarExclusao.disabled = true;
    try {
      const resposta = await chamarApi(`/api/admin/votos/${voto.id}`, { method: 'DELETE' });
      el.dialogoExcluir.close();
      if (!resposta.ok && resposta.status !== 404) {
        el.erroPainel.textContent = resposta.dados.erro || 'Não foi possível excluir o voto.';
        el.erroPainel.hidden = false;
      }
      await carregarTudo();
    } catch (erro) {
      el.dialogoExcluir.close();
      if (erro instanceof SessaoExpirada) mostrarLogin('Sua sessão expirou. Entre novamente.');
    } finally {
      el.confirmarExclusao.disabled = false;
      estado.votoParaExcluir = null;
    }
  });

  // ---------- Início ----------

  (async () => {
    try {
      const resposta = await chamarApi('/api/admin/sessao');
      if (resposta.dados.autenticado) mostrarPainel();
      else mostrarLogin();
    } catch (erro) {
      mostrarLogin('Falha de conexão com o servidor.');
    }
  })();
})();
