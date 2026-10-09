'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { config, validarConfigServidor } = require('./config');
const { pool, aplicarSchema } = require('./db');
const { cabecalhosSeguranca } = require('./seguranca');
const rotasPublicas = require('./rotas/publicas');
const rotasAdmin = require('./rotas/admin');

validarConfigServidor();

const PASTA_PUBLICA = path.join(__dirname, '..', 'public');
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use(cabecalhosSeguranca);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser(config.segredoSessao));

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/saude', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (erro) {
    res.status(503).json({ ok: false });
  }
});

app.use('/api/admin', rotasAdmin);
app.use('/api', rotasPublicas);
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Atende /admin e /admin/ (o roteamento do Express não diferencia a barra final)
app.get('/admin', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(PASTA_PUBLICA, 'admin.html'));
});

app.use(
  express.static(PASTA_PUBLICA, {
    extensions: ['html'],
    setHeaders(res, caminho) {
      if (caminho.endsWith('.html')) {
        res.set('Cache-Control', 'no-cache');
      } else if (/\.(webp|png|jpe?g|svg)$/.test(caminho)) {
        res.set('Cache-Control', 'public, max-age=604800');
      }
    },
  }),
);

app.use((req, res) => {
  res.status(404).sendFile(path.join(PASTA_PUBLICA, '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((erro, req, res, next) => {
  if (erro.type === 'entity.parse.failed' || erro.type === 'entity.too.large') {
    return res.status(400).json({ erro: 'Requisição inválida.' });
  }
  console.error('[erro]', erro);
  res.status(500).json({ erro: 'Erro interno. Tente novamente em instantes.' });
});

async function iniciar() {
  try {
    await aplicarSchema();
  } catch (erro) {
    console.error('Não foi possível conectar/preparar o PostgreSQL:', erro.message);
    console.error('Confira a variável DATABASE_URL no arquivo .env.');
    process.exit(1);
  }

  const servidor = app.listen(config.porta, () => {
    console.log(`Votação dos aniversariantes do mês no ar: http://localhost:${config.porta}`);
    console.log(`Área administrativa: http://localhost:${config.porta}/admin`);
  });

  const encerrar = () => {
    servidor.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', encerrar);
  process.on('SIGINT', encerrar);
}

iniciar();
