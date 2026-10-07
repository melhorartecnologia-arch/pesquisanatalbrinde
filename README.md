# Pesquisa da Cesta de Natal · Cervejaria Cidade Imperial

Hotsite interno para os colaboradores votarem em qual item vai fazer parte da cesta de Natal de
fim de ano, com área administrativa protegida por senha para consolidar o resultado.

- **100% JavaScript**: Node.js + Express no servidor, HTML/CSS/JS puro no navegador
- **Banco PostgreSQL** (tabelas criadas automaticamente ao subir o servidor)
- **Votação livre, estilo totem**: o colaborador escolhe o item e confirma, sem nome nem setor;
  a tela agradece e volta sozinha para o próximo voto (ideal para um tablet ou computador compartilhado)
- **Área administrativa** (`/admin`) com senha única, gráfico, totais por dia, lista de votos,
  exclusão de votos duplicados e exportação em CSV (abre direto no Excel)

## Itens em votação

| Opção | Item                      | Imagem                             |
| ----- | ------------------------- | ---------------------------------- |
| 1     | Cooler Império Ultra 0.0  | `public/img/cooler-ultra-00.webp`  |
| 2     | Caixa Térmica Império 0.0 | `public/img/caixa-termica-00.webp` |

Para alterar nomes/descrições ou incluir outro item, edite o bloco `INSERT INTO itens` em
[`db/schema.sql`](db/schema.sql), coloque a imagem em `public/img/` e reinicie o servidor
(ou rode `npm run db:init`). Para tirar um item da votação sem apagar votos, use
`UPDATE itens SET ativo = false WHERE slug = '...'`.

## Como rodar

### Opção A — Node.js + PostgreSQL já instalados

Requisitos: Node.js 18 ou superior e PostgreSQL 12 ou superior.

```bash
# 1. Crie o banco (uma vez)
psql -U postgres -c "CREATE USER natal WITH PASSWORD 'troque-esta-senha';"
psql -U postgres -c "CREATE DATABASE pesquisa_natal OWNER natal;"

# 2. Configure
cp .env.example .env      # edite DATABASE_URL, ADMIN_PASSWORD e SESSION_SECRET

# 3. Instale e suba
npm install
npm start
```

### Opção B — Docker Compose (sobe o app e o PostgreSQL juntos)

```bash
cp .env.example .env      # defina ADMIN_PASSWORD e SESSION_SECRET
docker compose up -d --build
```

Depois acesse:

- Pesquisa (colaboradores): `http://localhost:3000`
- Área administrativa: `http://localhost:3000/admin`

## Configuração (`.env`)

| Variável              | Obrigatória | Descrição                                                                     |
| --------------------- | ----------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`        | sim         | Conexão do PostgreSQL, ex.: `postgres://usuario:senha@host:5432/banco`        |
| `ADMIN_PASSWORD`      | sim         | Senha única da área administrativa                                            |
| `SESSION_SECRET`      | sim\*       | Segredo para assinar o login do admin. \*Sem ele, o login cai a cada reinício |
| `PORT`                | não         | Porta HTTP (padrão `3000`)                                                    |
| `DATABASE_SSL`        | não         | `true` para bancos gerenciados que exigem SSL                                 |
| `ADMIN_SESSION_HOURS` | não         | Duração do login do admin (padrão `8` horas)                                  |
| `VOTACAO_ENCERRA_EM`  | não         | Data/hora de encerramento, ex.: `2026-12-05T23:59:59-03:00`                   |
| `FUSO_HORARIO`        | não         | Fuso de "votos hoje" e das datas no CSV (padrão `America/Sao_Paulo`)          |
| `TRUST_PROXY`         | não         | Use `1` se estiver atrás de Nginx/IIS/load balancer                           |

Para gerar um `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Como funciona a votação

1. O colaborador toca no item que prefere e em **Confirmar meu voto**.
2. Uma janela pede a confirmação; ao confirmar, o voto é gravado.
3. Aparece "Obrigado pelo seu voto!" por 6 segundos e a tela volta sozinha para a escolha,
   pronta para o próximo colaborador (ou toque em **Registrar outro voto agora**).

Não há trava por navegador nem identificação: cada confirmação conta um voto. Para descartar um
voto registrado por engano, use o botão **Excluir** no painel. O tempo da tela de agradecimento
fica na constante `SEGUNDOS_AGRADECIMENTO`, em `public/js/site.js`.

## Área administrativa

Em `/admin`, digite a senha definida em `ADMIN_PASSWORD`. O painel mostra:

- total de votos, item na liderança (ou empate), votos do dia e horário do último voto;
- gráfico de votos por item com percentual;
- tabela de votos por dia;
- lista completa de votos com filtro por item e botão de exclusão;
- exportação **Resumo (CSV)** e **Votos (CSV)**, no padrão do Excel em português (separador `;`).

O painel se atualiza sozinho a cada 30 segundos. Após 10 senhas erradas, o IP fica bloqueado por
15 minutos. Trocar `ADMIN_PASSWORD` encerra todas as sessões abertas.

## Estrutura

```
├── db/schema.sql          # tabelas e itens da cesta (idempotente)
├── public/                # hotsite e painel (HTML, CSS, JS e imagens)
│   ├── index.html         # página de votação
│   ├── admin.html         # área administrativa
│   ├── css/  js/  img/
└── src/
    ├── server.js          # servidor Express
    ├── config.js          # leitura do .env
    ├── db.js / db-init.js # conexão e criação das tabelas
    ├── seguranca.js       # cabeçalhos de segurança e limite de tentativas
    ├── votacao.js         # regras comuns da votação
    └── rotas/
        ├── publicas.js    # GET /api/itens, POST /api/votos
        └── admin.js       # login, resultado, votos, exclusão e CSV
```

## API

| Método | Rota                             | Descrição                           |
| ------ | -------------------------------- | ----------------------------------- |
| GET    | `/api/itens`                     | Itens ativos e status da votação    |
| POST   | `/api/votos`                     | Registra o voto `{ itemId }`        |
| POST   | `/api/admin/login`               | Login `{ senha }`                   |
| POST   | `/api/admin/logout`              | Encerra a sessão                    |
| GET    | `/api/admin/resultado`           | Totais, percentuais e votos por dia |
| GET    | `/api/admin/votos`               | Lista de votos                      |
| DELETE | `/api/admin/votos/:id`           | Exclui um voto                      |
| GET    | `/api/admin/exportar/resumo.csv` | Resultado consolidado em CSV        |
| GET    | `/api/admin/exportar/votos.csv`  | Todos os votos em CSV               |
| GET    | `/api/saude`                     | Verificação de saúde (app + banco)  |

## Publicação

**Passo a passo para servidor Ubuntu na AWS (sem Docker): [PUBLICAR-AWS.md](PUBLICAR-AWS.md).**
Os arquivos prontos de configuração do Nginx e do serviço (systemd) ficam em [`deploy/`](deploy/).

- Publique atrás de **HTTPS** (o cookie de login do admin passa a ser `Secure` automaticamente;
  com proxy reverso, defina `TRUST_PROXY=1`).
- O limite de tentativas de login fica em memória: rode **uma instância** do app.
- Faça backup do banco antes de excluir votos: `pg_dump pesquisa_natal > backup.sql`.
