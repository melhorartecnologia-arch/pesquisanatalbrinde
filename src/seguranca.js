'use strict';

const crypto = require('crypto');

const POLITICA_CONTEUDO = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cabecalhosSeguranca(req, res, next) {
  res.set({
    'Content-Security-Policy': POLITICA_CONTEUDO,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
}

// Comparação em tempo constante (não revela o tamanho/conteúdo da senha por timing)
function compararSegredos(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Limitador simples em memória (suficiente para uma única instância)
function criarLimitador({ janelaMs, maximo }) {
  const registros = new Map();

  const limpeza = setInterval(() => {
    const agora = Date.now();
    for (const [chave, registro] of registros) {
      if (registro.expiraEm <= agora) registros.delete(chave);
    }
  }, janelaMs);
  limpeza.unref();

  return {
    bloqueado(chave) {
      const registro = registros.get(chave);
      return Boolean(registro && registro.expiraEm > Date.now() && registro.quantidade >= maximo);
    },
    registrarFalha(chave) {
      const agora = Date.now();
      const registro = registros.get(chave);
      if (!registro || registro.expiraEm <= agora) {
        registros.set(chave, { quantidade: 1, expiraEm: agora + janelaMs });
      } else {
        registro.quantidade += 1;
      }
    },
    limpar(chave) {
      registros.delete(chave);
    },
  };
}

module.exports = { cabecalhosSeguranca, compararSegredos, criarLimitador };
