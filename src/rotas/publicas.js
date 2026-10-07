'use strict';

const crypto = require('crypto');
const express = require('express');
const { pool } = require('../db');
const { config } = require('../config');
const { estadoVotacao, limparTexto } = require('../votacao');

const router = express.Router();

const COOKIE_DISPOSITIVO = 'cci_dispositivo';
const COOKIE_VOTOU = 'cci_votou';
const DOIS_ANOS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function opcoesCookie(req) {
  return {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: DOIS_ANOS_MS,
    path: '/',
  };
}

// Cada navegador recebe um identificador próprio, guardado em cookie assinado
function garantirDispositivo(req, res) {
  const atual = req.signedCookies[COOKIE_DISPOSITIVO];
  if (typeof atual === 'string' && REGEX_UUID.test(atual)) return atual;
  const novo = crypto.randomUUID();
  res.cookie(COOKIE_DISPOSITIVO, novo, opcoesCookie(req));
  return novo;
}

function marcarComoVotou(req, res) {
  res.cookie(COOKIE_VOTOU, '1', opcoesCookie(req));
}

function formatarVoto(linha) {
  return {
    nome: linha.nome,
    criadoEm: linha.criado_em,
    item: { id: linha.item_id, nome: linha.item_nome, imagem: linha.item_imagem },
  };
}

router.get('/itens', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, descricao, imagem
         FROM itens
        WHERE ativo
        ORDER BY ordem, id`,
    );
    res.json({ itens: rows, setores: config.setores, votacao: estadoVotacao() });
  } catch (erro) {
    next(erro);
  }
});

router.get('/status', async (req, res, next) => {
  try {
    const dispositivo = garantirDispositivo(req, res);
    const { rows } = await pool.query(
      `SELECT v.nome, v.criado_em, i.id AS item_id, i.nome AS item_nome, i.imagem AS item_imagem
         FROM votos v
         JOIN itens i ON i.id = v.item_id
        WHERE v.dispositivo_id = $1`,
      [dispositivo],
    );
    const voto = rows[0] ? formatarVoto(rows[0]) : null;
    const cookieVotou = req.signedCookies[COOKIE_VOTOU] === '1';
    if (voto && !cookieVotou) marcarComoVotou(req, res);

    res.json({ jaVotou: Boolean(voto || cookieVotou), voto, votacao: estadoVotacao() });
  } catch (erro) {
    next(erro);
  }
});

router.post('/votos', async (req, res, next) => {
  try {
    if (!estadoVotacao().aberta) {
      return res.status(403).json({ erro: 'A votação já foi encerrada. Obrigado pelo interesse!' });
    }
    if (req.signedCookies[COOKIE_VOTOU] === '1') {
      return res.status(409).json({ erro: 'Você já votou nesta pesquisa. Obrigado!', jaVotou: true });
    }

    const corpo = req.body || {};
    const itemId = Number(corpo.itemId);
    const nome = limparTexto(corpo.nome);
    const setor = limparTexto(corpo.setor);

    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ erro: 'Escolha um dos itens da cesta.' });
    }
    if (nome.length < 3 || nome.length > 120 || !/\p{L}/u.test(nome)) {
      return res.status(400).json({ erro: 'Informe seu nome completo (mínimo de 3 letras).' });
    }
    if (setor.length > 80) {
      return res.status(400).json({ erro: 'O nome do setor deve ter no máximo 80 caracteres.' });
    }

    const resultadoItem = await pool.query('SELECT id, nome, imagem FROM itens WHERE id = $1 AND ativo', [
      itemId,
    ]);
    const item = resultadoItem.rows[0];
    if (!item) {
      return res.status(400).json({ erro: 'O item escolhido não está disponível.' });
    }

    const dispositivo = garantirDispositivo(req, res);
    const userAgent = String(req.get('user-agent') || '').slice(0, 300);

    const { rows } = await pool.query(
      `INSERT INTO votos (item_id, nome, setor, dispositivo_id, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (dispositivo_id) DO NOTHING
       RETURNING criado_em`,
      [item.id, nome, setor || null, dispositivo, req.ip, userAgent],
    );

    marcarComoVotou(req, res);

    if (rows.length === 0) {
      return res.status(409).json({ erro: 'Você já votou nesta pesquisa. Obrigado!', jaVotou: true });
    }

    res.status(201).json({
      voto: formatarVoto({
        nome,
        criado_em: rows[0].criado_em,
        item_id: item.id,
        item_nome: item.nome,
        item_imagem: item.imagem,
      }),
    });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
