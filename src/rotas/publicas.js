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

// Votação livre: cada confirmação registra um voto (ex.: totem/tablet compartilhado)
router.post('/votos', async (req, res, next) => {
  try {
    if (!estadoVotacao().aberta) {
      return res.status(403).json({ erro: 'A votação já foi encerrada. Obrigado pelo interesse!' });
    }

    const itemId = Number((req.body || {}).itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ erro: 'Escolha um dos itens da cesta.' });
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
      `INSERT INTO votos (item_id, ip, user_agent)
       VALUES ($1, $2, $3)
       RETURNING criado_em`,
      [item.id, req.ip, userAgent],
    );

    res.status(201).json({ voto: { criadoEm: rows[0].criado_em, item } });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
