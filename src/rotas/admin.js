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

async function buscarResultado() {
  const [itens, totais, dias] = await Promise.all([
    pool.query(
      `SELECT i.id, i.nome, i.imagem, COUNT(v.id)::int AS votos
         FROM itens i
         LEFT JOIN votos v ON v.item_id = i.id
        GROUP BY i.id
       HAVING i.ativo OR COUNT(v.id) > 0
        ORDER BY i.ordem, i.id`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (
                WHERE (criado_em AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date
              )::int AS hoje,
              MIN(criado_em) AS primeiro,
              MAX(criado_em) AS ultimo
         FROM votos`,
      [config.fusoHorario],
    ),
    pool.query(
      `SELECT to_char((criado_em AT TIME ZONE $1)::date, 'DD/MM/YYYY') AS dia,
              (criado_em AT TIME ZONE $1)::date AS data,
              item_id, COUNT(*)::int AS votos
         FROM votos
        GROUP BY 1, 2, item_id
        ORDER BY data DESC`,
      [config.fusoHorario],
    ),
  ]);

  const total = totais.rows[0].total;
  const maiorVotacao = Math.max(0, ...itens.rows.map((item) => item.votos));

  const porDia = new Map();
  for (const linha of dias.rows) {
    if (!porDia.has(linha.dia)) porDia.set(linha.dia, { dia: linha.dia, total: 0, votos: {} });
    const grupo = porDia.get(linha.dia);
    grupo.votos[linha.item_id] = linha.votos;
    grupo.total += linha.votos;
  }

  return {
    total,
    hoje: totais.rows[0].hoje,
    primeiroVoto: totais.rows[0].primeiro,
    ultimoVoto: totais.rows[0].ultimo,
    votacao: estadoVotacao(),
    itens: itens.rows.map((item) => ({
      ...item,
      percentual: total ? Math.round((item.votos / total) * 1000) / 10 : 0,
      lider: total > 0 && item.votos === maiorVotacao,
    })),
    porDia: [...porDia.values()],
  };
}

async function buscarVotos() {
  const { rows } = await pool.query(
    `SELECT v.id, v.criado_em AS "criadoEm",
            i.id AS "itemId", i.nome AS "itemNome",
            to_char(v.criado_em AT TIME ZONE $1, 'DD/MM/YYYY HH24:MI:SS') AS "dataFormatada"
       FROM votos v
       JOIN itens i ON i.id = v.item_id
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
    const { rowCount } = await pool.query('DELETE FROM votos WHERE id = $1', [id]);
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
    const linhas = [['Item', 'Votos', 'Percentual']];
    for (const item of resultado.itens) {
      linhas.push([item.nome, item.votos, formatarPercentual(item.percentual)]);
    }
    linhas.push(['Total', resultado.total, resultado.total ? '100,0%' : '0,0%']);
    linhas.push([]);
    linhas.push(['Dia', ...resultado.itens.map((item) => item.nome), 'Total']);
    for (const grupo of resultado.porDia) {
      linhas.push([grupo.dia, ...resultado.itens.map((item) => grupo.votos[item.id] || 0), grupo.total]);
    }
    enviarCsv(res, `resultado-cesta-natal-${carimboArquivo()}.csv`, linhas);
  } catch (erro) {
    next(erro);
  }
});

router.get('/exportar/votos.csv', async (req, res, next) => {
  try {
    const votos = await buscarVotos();
    const linhas = [['ID', 'Item escolhido', 'Data/hora']];
    for (const voto of votos) {
      linhas.push([voto.id, voto.itemNome, voto.dataFormatada]);
    }
    enviarCsv(res, `votos-cesta-natal-${carimboArquivo()}.csv`, linhas);
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
