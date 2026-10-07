'use strict';

const express = require('express');
const { pool } = require('../db');
const { estadoVotacao } = require('../votacao');

const router = express.Router();

router.get('/itens', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, descricao, imagem
         FROM itens
        WHERE ativo
        ORDER BY ordem, id`,
    );
    res.json({ itens: rows, votacao: estadoVotacao() });
  } catch (erro) {
    next(erro);
  }
});

// Matrícula: letras e números, sem espaços, em maiúsculas (ex.: " 00123 " → "00123")
function normalizarMatricula(valor) {
  return String(valor || '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

// Totem/tablet compartilhado: cada matrícula registra um único voto
router.post('/votos', async (req, res, next) => {
  try {
    if (!estadoVotacao().aberta) {
      return res.status(403).json({ erro: 'A votação já foi encerrada. Obrigado pelo interesse!' });
    }

    const corpo = req.body || {};
    const itemId = Number(corpo.itemId);
    const matricula = normalizarMatricula(corpo.matricula);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ erro: 'Escolha um dos itens da cesta.' });
    }
    if (!/^[0-9A-Z.\-/]{1,20}$/.test(matricula)) {
      return res.status(400).json({ erro: 'Digite um código de matrícula válido.', campo: 'matricula' });
    }

    const resultadoItem = await pool.query('SELECT id, nome, imagem FROM itens WHERE id = $1 AND ativo', [
      itemId,
    ]);
    const item = resultadoItem.rows[0];
    if (!item) {
      return res.status(400).json({ erro: 'O item escolhido não está disponível.' });
    }

    const userAgent = String(req.get('user-agent') || '').slice(0, 300);
    const { rows } = await pool.query(
      `INSERT INTO votos (item_id, matricula, ip, user_agent)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (matricula) WHERE matricula IS NOT NULL DO NOTHING
       RETURNING criado_em`,
      [item.id, matricula, req.ip, userAgent],
    );

    if (rows.length === 0) {
      return res
        .status(409)
        .json({ erro: `A matrícula ${matricula} já registrou um voto.`, campo: 'matricula' });
    }

    res.status(201).json({ voto: { criadoEm: rows[0].criado_em, matricula, item } });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
