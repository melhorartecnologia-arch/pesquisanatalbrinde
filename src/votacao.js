'use strict';

const { config } = require('./config');

function estadoVotacao() {
  const encerraEm = config.votacaoEncerraEm;
  return {
    aberta: !encerraEm || Date.now() < encerraEm.getTime(),
    encerraEm: encerraEm ? encerraEm.toISOString() : null,
  };
}

module.exports = { estadoVotacao };
