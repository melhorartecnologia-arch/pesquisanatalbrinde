'use strict';

const crypto = require('crypto');
const express = require('express');
const { pool } = require('../db');
const { config } = require('../config');
const { compararSegredos, criarLimitador } = require('../seguranca');
const { estadoVotacao } = require('../votacao');

const router = express.Router();

const COOKIE_ADMIN = 'cci_admin';
const limitadorLogin = criarLimitador({ janelaMs: 15 * 60 * 1000, maximo: 10 });

// Impressão digital da senha atual: trocar ADMIN_PASSWORD invalida as sessões abertas
function impressaoSenha() {
  return crypto
    .createHmac('sha256', config.segredoSessao)
    .update(config.senhaAdmin)
    .digest('hex')
    .slice(0, 16);
}

function sessaoValida(req) {
  const valor = req.signedCookies[COOKIE_ADMIN];
  if (typeof valor !== 'string') return false;
  const [versao, expiraEm, impressao] = valor.split('.');
  return versao === 'v1' && Number(expiraEm) > Date.now() && impressao === impressaoSenha();
}

function exigirAdmin(req, res, next) {
  if (!sessaoValida(req)) {
    return res.status(401).json({ erro: 'Sessão expirada. Entre novamente com a senha.' });
  }
  next();
}

router.post('/login', (req, res) => {
  const chave = req.ip;
  if (limitadorLogin.bloqueado(chave)) {
    return res
      .status(429)
      .json({ erro: 'Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.' });
  }

  const senha = req.body && typeof req.body.senha === 'string' ? req.body.senha : '';
  if (!senha || !compararSegredos(senha, config.senhaAdmin)) {
    limitadorLogin.registrarFalha(chave);
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }

  limitadorLogin.limpar(chave);
  const duracaoMs = config.horasSessaoAdmin * 60 * 60 * 1000;
  res.cookie(COOKIE_ADMIN, `v1.${Date.now() + duracaoMs}.${impressaoSenha()}`, {
    httpOnly: true,
    signed: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: duracaoMs,
    path: '/',
  });
  res.json({ autenticado: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_ADMIN, { path: '/' });
  res.json({ autenticado: false });
});

router.get('/sessao', (req, res) => {
  res.json({ autenticado: sessaoValida(req) });
});

router.use(exigirAdmin);

const CATEGORIAS = [
  { chave: 'cerveja', coluna: 'cerveja_id', titulo: 'Cervejas' },
  { chave: 'energetico', coluna: 'energetico_id', titulo: 'Energéticos' },
];

async function buscarResultado() {
  const [produtos, totais, dias] = await Promise.all([
    pool.query(
      `SELECT p.id, p.categoria, p.nome, p.detalhe, p.imagem,
              (SELECT COUNT(*) FROM participacoes v
                WHERE v.cerveja_id = p.id OR v.energetico_id = p.id)::int AS votos
         FROM produtos p
        ORDER BY p.ordem, p.id`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(cerveja_id)::int AS cervejas,
              COUNT(energetico_id)::int AS energeticos,
              COUNT(*) FILTER (
                WHERE (criado_em AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date
              )::int AS hoje,
              MIN(criado_em) AS primeiro,
              MAX(criado_em) AS ultimo
         FROM participacoes`,
      [config.fusoHorario],
    ),
    pool.query(
      `SELECT to_char((criado_em AT TIME ZONE $1)::date, 'DD/MM/YYYY') AS dia,
              COUNT(*)::int AS participacoes,
              COUNT(cerveja_id)::int AS cervejas,
              COUNT(energetico_id)::int AS energeticos
         FROM participacoes
        GROUP BY (criado_em AT TIME ZONE $1)::date
        ORDER BY (criado_em AT TIME ZONE $1)::date DESC`,
      [config.fusoHorario],
    ),
  ]);

  const t = totais.rows[0];
  const votosPorCategoria = { cerveja: t.cervejas, energetico: t.energeticos };

  const categorias = CATEGORIAS.map(({ chave, titulo }) => {
    const totalVotos = votosPorCategoria[chave];
    const lista = produtos.rows.filter((produto) => produto.categoria === chave);
    const maior = Math.max(0, ...lista.map((produto) => produto.votos));
    return {
      chave,
      titulo,
      totalVotos,
      semEscolha: t.total - totalVotos,
      produtos: lista.map((produto) => ({
        ...produto,
        percentual: totalVotos ? Math.round((produto.votos / totalVotos) * 1000) / 10 : 0,
        lider: totalVotos > 0 && produto.votos === maior,
      })),
    };
  });

  return {
    total: t.total,
    hoje: t.hoje,
    primeiroVoto: t.primeiro,
    ultimoVoto: t.ultimo,
    votacao: estadoVotacao(),
    categorias,
    porDia: dias.rows,
  };
}

async function buscarVotos() {
  const { rows } = await pool.query(
    `SELECT v.id, v.matricula, v.criado_em AS "criadoEm",
            v.cerveja_id AS "cervejaId", c.nome AS "cervejaNome",
            v.energetico_id AS "energeticoId", e.nome AS "energeticoNome",
            to_char(v.criado_em AT TIME ZONE $1, 'DD/MM/YYYY HH24:MI:SS') AS "dataFormatada"
       FROM participacoes v
       LEFT JOIN produtos c ON c.id = v.cerveja_id
       LEFT JOIN produtos e ON e.id = v.energetico_id
      ORDER BY v.criado_em DESC, v.id DESC`,
    [config.fusoHorario],
  );
  return rows;
}

router.get('/resultado', async (req, res, next) => {
  try {
    res.json(await buscarResultado());
  } catch (erro) {
    next(erro);
  }
});

router.get('/votos', async (req, res, next) => {
  try {
    res.json({ votos: await buscarVotos() });
  } catch (erro) {
    next(erro);
  }
});

router.delete('/votos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ erro: 'Identificador de voto inválido.' });
    }
    const { rowCount } = await pool.query('DELETE FROM participacoes WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ erro: 'Voto não encontrado.' });
    res.json({ removido: true });
  } catch (erro) {
    next(erro);
  }
});

// ---------- Exportação em CSV (separador ";" e BOM para abrir direto no Excel) ----------

function celulaCsv(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  // Evita que o Excel interprete o conteúdo como fórmula
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function enviarCsv(res, nomeArquivo, linhas) {
  const conteudo = linhas.map((linha) => linha.map(celulaCsv).join(';')).join('\r\n');
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
  });
  res.send(`﻿${conteudo}\r\n`);
}

function carimboArquivo() {
  return new Date().toISOString().slice(0, 10);
}

function formatarPercentual(valor) {
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

router.get('/exportar/resumo.csv', async (req, res, next) => {
  try {
    const resultado = await buscarResultado();
    const linhas = [['Categoria', 'Produto', 'Votos', 'Percentual']];
    for (const categoria of resultado.categorias) {
      for (const produto of categoria.produtos) {
        linhas.push([categoria.titulo, produto.nome, produto.votos, formatarPercentual(produto.percentual)]);
      }
      linhas.push([categoria.titulo, 'Total de votos', categoria.totalVotos, '']);
      linhas.push([categoria.titulo, 'Não escolheram', categoria.semEscolha, '']);
    }
    linhas.push([]);
    linhas.push(['Participações (matrículas)', resultado.total]);
    linhas.push([]);
    linhas.push(['Dia', 'Participações', 'Votos em cerveja', 'Votos em energético']);
    for (const dia of resultado.porDia) {
      linhas.push([dia.dia, dia.participacoes, dia.cervejas, dia.energeticos]);
    }
    enviarCsv(res, `resultado-aniversariantes-${carimboArquivo()}.csv`, linhas);
  } catch (erro) {
    next(erro);
  }
});

router.get('/exportar/votos.csv', async (req, res, next) => {
  try {
    const votos = await buscarVotos();
    const linhas = [['ID', 'Matrícula', 'Cerveja', 'Energético', 'Data/hora']];
    for (const voto of votos) {
      linhas.push([
        voto.id,
        voto.matricula,
        voto.cervejaNome || '',
        voto.energeticoNome || '',
        voto.dataFormatada,
      ]);
    }
    enviarCsv(res, `votos-aniversariantes-${carimboArquivo()}.csv`, linhas);
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
