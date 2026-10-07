'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { config } = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

pool.on('error', (erro) => {
  console.error('[db] erro inesperado em conexão ociosa:', erro.message);
});

// Chave arbitrária para evitar que duas instâncias apliquem o schema ao mesmo tempo
const CHAVE_LOCK_SCHEMA = 7202612;

async function aplicarSchema() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const cliente = await pool.connect();
  try {
    await cliente.query('SELECT pg_advisory_lock($1)', [CHAVE_LOCK_SCHEMA]);
    await cliente.query(sql);
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1)', [CHAVE_LOCK_SCHEMA]).catch(() => {});
    cliente.release();
  }
}

module.exports = { pool, aplicarSchema };
