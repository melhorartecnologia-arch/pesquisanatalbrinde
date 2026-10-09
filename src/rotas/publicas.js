'use strict';

const express = require('express');
const { pool } = require('../db');
const { estadoVotacao } = require('../votacao');

const router = express.Router();

const REGEX_MATRICULA = /^[0-9A-Z./-]{1,20}$/;

// Matrícula: letras e números, sem espaços, em maiúsculas (ex.: " 00123 " → "00123")
function normalizarMatricula(valor) {
  return String(valor || '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

// Aceita ausência de escolha (null/vazio); qualquer outro valor precisa ser um id inteiro positivo
function lerIdOpcional(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

router.get('/produtos', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, categoria, nome, detalhe, imagem
         FROM produtos
        WHERE ativo
        ORDER BY categoria, ordem, id`,
    );
    res.json({
      cervejas: rows.filter((produto) => produto.categoria === 'cerveja'),
      energeticos: rows.filter((produto) => produto.categoria === 'energetico'),
      votacao: estadoVotacao(),
    });
  } catch (erro) {
    next(erro);
  }
});

// Totem/tablet compartilhado: cada matrícula participa uma única vez,
// escolhendo uma cerveja, um energético ou os dois
router.post('/votos', async (req, res, next) => {
  try {
    if (!estadoVotacao().aberta) {
      return res.status(403).json({ erro: 'A votação já foi encerrada. Obrigado pelo interesse!' });
    }

    const corpo = req.body || {};
    const cervejaId = lerIdOpcional(corpo.cervejaId);
    const energeticoId = lerIdOpcional(corpo.energeticoId);
    const matricula = normalizarMatricula(corpo.matricula);

    if (Number.isNaN(cervejaId) || Number.isNaN(energeticoId)) {
      return res.status(400).json({ erro: 'Opção de voto inválida.' });
    }
    if (cervejaId === null && energeticoId === null) {
      return res.status(400).json({ erro: 'Escolha pelo menos uma cerveja ou um energético.' });
    }
    if (!REGEX_MATRICULA.test(matricula)) {
      return res.status(400).json({ erro: 'Digite um código de matrícula válido.', campo: 'matricula' });
    }

    // Confere se cada escolha existe, está ativa e pertence à categoria certa
    const ids = [cervejaId, energeticoId].filter((id) => id !== null);
    const { rows: produtos } = await pool.query(
      'SELECT id, categoria, nome, detalhe, imagem FROM produtos WHERE ativo AND id = ANY($1::int[])',
      [ids],
    );
    const cerveja = produtos.find((p) => p.id === cervejaId && p.categoria === 'cerveja') || null;
    const energetico = produtos.find((p) => p.id === energeticoId && p.categoria === 'energetico') || null;
    if ((cervejaId !== null && !cerveja) || (energeticoId !== null && !energetico)) {
      return res.status(400).json({ erro: 'A opção escolhida não está disponível.' });
    }

    const userAgent = String(req.get('user-agent') || '').slice(0, 300);
    const { rows } = await pool.query(
      `INSERT INTO participacoes (matricula, cerveja_id, energetico_id, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (matricula) DO NOTHING
       RETURNING criado_em`,
      [matricula, cervejaId, energeticoId, req.ip, userAgent],
    );

    if (rows.length === 0) {
      return res
        .status(409)
        .json({ erro: `A matrícula ${matricula} já registrou um voto.`, campo: 'matricula' });
    }

    res.status(201).json({ voto: { criadoEm: rows[0].criado_em, matricula, cerveja, energetico } });
  } catch (erro) {
    next(erro);
  }
});

module.exports = router;
