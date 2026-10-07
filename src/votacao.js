'use strict';

const { config } = require('./config');

function estadoVotacao() {
  const encerraEm = config.votacaoEncerraEm;
  return {
    aberta: !encerraEm || Date.now() < encerraEm.getTime(),
    encerraEm: encerraEm ? encerraEm.toISOString() : null,
  };
}

// Remove espaços duplicados e caracteres de controle
function limparTexto(valor) {
  if (typeof valor !== 'string') return '';
  return valor
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { estadoVotacao, limparTexto };
