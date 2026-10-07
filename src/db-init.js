'use strict';

// Cria as tabelas e cadastra os itens da cesta: npm run db:init
const { pool, aplicarSchema } = require('./db');

aplicarSchema()
  .then(() => {
    console.log('Banco de dados pronto: tabelas criadas e itens cadastrados.');
  })
  .catch((erro) => {
    console.error('Falha ao preparar o banco de dados:', erro.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
