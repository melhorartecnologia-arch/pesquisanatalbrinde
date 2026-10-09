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
    lideres: {
      cerveja: [$('.js-lider-cerveja'), $('.js-lider-cerveja-detalhe')],
      energetico: [$('.js-lider-energetico'), $('.js-lider-energetico-detalhe')],
    },
    ultimo: $('.js-ultimo'),
    ultimoDetalhe: $('.js-ultimo-detalhe'),
    graficos: {
      cerveja: $('.js-grafico[data-categoria="cerveja"]'),
      energetico: $('.js-grafico[data-categoria="energetico"]'),
    },
    subtitulos: {
      cerveja: $('.js-subtitulo-cerveja'),
      energetico: $('.js-subtitulo-energetico'),
    },
    diaCorpo: $('.js-dia-corpo'),
    diaRodape: $('.js-dia-rodape'),
    diaVazio: $('.js-dia-vazio'),
    votosCorpo: $('.js-votos-corpo'),
    votosVazio: $('.js-votos-vazio'),
    votosContagem: $('.js-votos-contagem'),
    busca: $('.js-busca'),
    filtroItem: $('.js-filtro-item'),
    dica: $('.js-dica'),
    dialogoExcluir: $('.js-dialogo-excluir'),
    excluirNumero: $('.js-excluir-numero'),
    excluirMatricula: $('.js-excluir-matricula'),
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
      renderizarGraficos();
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
    el.totalDetalhe.textContent = r.total
      ? `${plural(r.hoje, 'matrícula', 'matrículas')} hoje · desde ${new Date(r.primeiroVoto).toLocaleDateString('pt-BR')}`
      : 'nenhum voto ainda';

    r.categorias.forEach((categoria) => {
      const [valor, detalhe] = el.lideres[categoria.chave];
      const lideres = categoria.produtos.filter((produto) => produto.lider);
      if (lideres.length === 0) {
        valor.textContent = '–';
        detalhe.textContent = 'aguardando votos';
      } else if (lideres.length > 1) {
        valor.textContent = 'Empate';
        detalhe.textContent = `${lideres.map((produto) => produto.nome).join(' e ')} · ${plural(
          lideres[0].votos,
          'voto',
          'votos',
        )} cada`;
      } else {
        const [lider] = lideres;
        const segundo = categoria.produtos
          .filter((produto) => produto.id !== lider.id)
          .reduce((maior, produto) => Math.max(maior, produto.votos), 0);
        valor.textContent = lider.nome;
        detalhe.textContent = `${formatarPercentual(lider.percentual)} · ${plural(
          lider.votos - segundo,
          'voto',
          'votos',
        )} à frente`;
      }
    });

    if (r.ultimoVoto) {
      el.ultimo.textContent = tempoRelativo(r.ultimoVoto);
      el.ultimoDetalhe.textContent = formatarDataHora(r.ultimoVoto);
    } else {
      el.ultimo.textContent = '–';
      el.ultimoDetalhe.textContent = '';
    }
  }

  // ---------- Gráfico de barras ----------

  function renderizarGraficos() {
    estado.resultado.categorias.forEach(renderizarGrafico);
  }

  function renderizarGrafico(categoria) {
    const empate = categoria.produtos.filter((item) => item.lider).length > 1;
    el.subtitulos[categoria.chave].textContent = `${plural(categoria.totalVotos, 'voto', 'votos')} · ${plural(
      categoria.semEscolha,
      'participação sem escolha',
      'participações sem escolha',
    )} nesta categoria`;

    const barras = categoria.produtos.map((item) => {
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

    el.graficos[categoria.chave].replaceChildren(...barras);
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
    const linha = (rotulo, valores) =>
      criar('tr', {}, [
        criar('td', { texto: rotulo }),
        ...valores.map((valor) => criar('td', { texto: formatoNumero.format(valor) })),
      ]);

    el.diaCorpo.replaceChildren(
      ...r.porDia.map((dia) => linha(dia.dia, [dia.participacoes, dia.cervejas, dia.energeticos])),
    );
    const [cervejas, energeticos] = r.categorias.map((categoria) => categoria.totalVotos);
    el.diaRodape.replaceChildren(
      ...(r.porDia.length ? [linha('Total', [r.total, cervejas, energeticos])] : []),
    );
  }

  // ---------- Lista de votos ----------

  function atualizarFiltroItens() {
    const atual = el.filtroItem.value;
    el.filtroItem.replaceChildren(
      criar('option', { value: '', texto: 'Todos os produtos' }),
      ...estado.resultado.categorias.map((categoria) =>
        criar(
          'optgroup',
          { label: categoria.titulo },
          categoria.produtos.map((produto) =>
            criar('option', { value: String(produto.id), texto: produto.nome }),
          ),
        ),
      ),
    );
    el.filtroItem.value = $$('option', el.filtroItem).some((opcao) => opcao.value === atual) ? atual : '';
  }

  function renderizarVotos() {
    const itemFiltro = el.filtroItem.value;
    const termo = el.busca.value.replace(/\s+/g, '').toUpperCase();
    const filtrados = estado.votos.filter(
      (voto) =>
        (!itemFiltro || String(voto.cervejaId) === itemFiltro || String(voto.energeticoId) === itemFiltro) &&
        (!termo || (voto.matricula || '').includes(termo)),
    );

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
          criar('td', { texto: String(voto.id) }),
          criar('td', { classe: 'tabela__nome', texto: voto.matricula || '—' }),
          criar(
            'td',
            voto.cervejaNome ? { texto: voto.cervejaNome } : { classe: 'tabela__vazio', texto: '—' },
          ),
          criar(
            'td',
            voto.energeticoNome ? { texto: voto.energeticoNome } : { classe: 'tabela__vazio', texto: '—' },
          ),
          criar('td', { texto: voto.dataFormatada }),
          criar('td', {}, [botaoExcluir]),
        ]);
      }),
    );
  }

  el.filtroItem.addEventListener('change', renderizarVotos);
  el.busca.addEventListener('input', renderizarVotos);

  // ---------- Exclusão ----------

  function pedirExclusao(voto) {
    estado.votoParaExcluir = voto;
    el.excluirNumero.textContent = String(voto.id);
    el.excluirMatricula.textContent = voto.matricula || 'não informada';
    el.excluirItem.textContent = [voto.cervejaNome, voto.energeticoNome].filter(Boolean).join(' + ');
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
