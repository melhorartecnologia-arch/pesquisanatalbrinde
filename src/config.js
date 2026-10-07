'use strict';

require('dotenv').config({ quiet: true });
const crypto = require('crypto');

function lerTrustProxy(valor) {
  if (valor === undefined || valor === '') return false;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  if (/^\d+$/.test(valor)) return Number(valor);
  return valor;
}

const SETORES_PADRAO = [
  'Administrativo',
  'Comercial',
  'Financeiro',
  'Logística',
  'Manutenção',
  'Marketing',
  'Produção',
  'Qualidade',
  'Recursos Humanos',
  'TI',
];

function lerLista(valor, padrao) {
  if (!valor) return padrao;
  return valor
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function lerData(valor, nome) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    throw new Error(`${nome} inválida: "${valor}". Use o formato ISO, ex.: 2026-12-05T23:59:59-03:00`);
  }
  return data;
}

const config = {
  porta: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  senhaAdmin: process.env.ADMIN_PASSWORD,
  segredoSessao: process.env.SESSION_SECRET,
  horasSessaoAdmin: Number(process.env.ADMIN_SESSION_HOURS) || 8,
  trustProxy: lerTrustProxy(process.env.TRUST_PROXY),
  fusoHorario: process.env.FUSO_HORARIO || 'America/Sao_Paulo',
  votacaoEncerraEm: lerData(process.env.VOTACAO_ENCERRA_EM, 'VOTACAO_ENCERRA_EM'),
  setores: lerLista(process.env.SETORES, SETORES_PADRAO),
};

// Validação feita só ao subir o servidor (o db:init não precisa da senha)
function validarConfigServidor() {
  if (!config.senhaAdmin) {
    throw new Error('Defina a variável ADMIN_PASSWORD (senha da área administrativa) no arquivo .env.');
  }
  if (!config.segredoSessao) {
    config.segredoSessao = crypto.randomBytes(32).toString('hex');
    console.warn(
      '[aviso] SESSION_SECRET não definido: usando um segredo temporário. ' +
        'Defina SESSION_SECRET no .env para que os cookies continuem válidos após reiniciar o servidor.',
    );
  }
}

module.exports = { config, validarConfigServidor };
