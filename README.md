# Aniversariantes do Mês · Cervejaria Cidade Imperial

Hotsite interno para os colaboradores votarem nos produtos dos aniversariantes do mês: **uma cerveja**,
**um energético** ou **os dois**, com área administrativa protegida por senha para consolidar o resultado.

- **100% JavaScript**: Node.js + Express no servidor, HTML/CSS/JS puro no navegador
- **Banco PostgreSQL** (tabelas criadas automaticamente ao subir o servidor)
- **Votação estilo totem com matrícula**: o colaborador escolhe, digita o código da matrícula e
  confirma; cada matrícula vota uma única vez e a tela volta sozinha para o próximo voto
- **Área administrativa** (`/admin`) com senha única, resultado por categoria, participações por dia,
  lista de votos, exclusão e exportação em CSV (abre direto no Excel)

## Produtos em votação

| Categoria  | Produto               | Detalhe                     | Imagem                                       |
| ---------- | --------------------- | --------------------------- | -------------------------------------------- |
| Cerveja    | Império Gold          | Long neck · 330 ml          | `public/img/cerveja-gold.webp` (provisória)  |
| Cerveja    | Império Lager         | Long neck · 330 ml          | `public/img/cerveja-lager.webp` (provisória) |
| Cerveja    | Império Helles        | Long neck · 330 ml          | `public/img/cerveja-helles.webp`             |
| Energético | Dopamina Extreme      | Lata 269 ml · tutti-frutti  | `public/img/energetico-extreme.webp`         |
| Energético | Dopamina Black        | Lata 473 ml · mix de frutas | `public/img/energetico-black.webp`           |
| Energético | Dopamina Manga Summer | Tradicional · lata 473 ml   | `public/img/energetico-manga-summer.webp`    |

Para trocar uma foto, substitua o arquivo em `public/img/` mantendo o mesmo nome (de preferência
`.webp` com fundo transparente, cerca de 900 px de altura). Para alterar nomes ou incluir um produto,
edite o bloco `INSERT INTO produtos` em [`db/schema.sql`](db/schema.sql) e reinicie o servidor (ou
rode `npm run db:init`). Para tirar um produto da votação sem apagar votos, use
`UPDATE produtos SET ativo = false WHERE slug = '...'`.

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

1. O colaborador escolhe **uma cerveja** e/ou **um energético** (as duas categorias são opcionais,
   mas é preciso escolher pelo menos uma; tocar de novo no item escolhido desmarca).
2. Digita o **código da matrícula** e toca em **Confirmar meu voto**.
3. Uma janela mostra as escolhas e a matrícula; ao confirmar, o voto é gravado.
4. Aparece "Obrigado pelo seu voto!" por 5 segundos e a tela volta **sozinha** para a escolha,
   com tudo limpo, pronta para o próximo colaborador.

Cada matrícula vota **uma única vez**: se a mesma matrícula tentar de novo, a tela avisa
"A matrícula ... já registrou um voto". A matrícula aceita letras, números, ponto, hífen e barra
(até 20 caracteres); espaços são ignorados e letras viram maiúsculas.

Para liberar uma matrícula (voto registrado por engano), exclua o voto dela no painel. O tempo da
tela de agradecimento fica na constante `SEGUNDOS_AGRADECIMENTO`, em `public/js/site.js`.

## Área administrativa

Em `/admin`, digite a senha definida em `ADMIN_PASSWORD`. O painel mostra:

- participações (matrículas que votaram), cerveja e energético na liderança (ou empate) e último voto;
- um gráfico por categoria, com percentual sobre os votos daquela categoria e quantas participações
  não escolheram nada nela;
- participações por dia;
- lista de votos com matrícula, cerveja e energético, busca por matrícula, filtro por produto e
  botão de exclusão;
- exportação **Resumo (CSV)** e **Votos (CSV)**, no padrão do Excel em português (separador `;`).

O painel se atualiza sozinho a cada 30 segundos. Após 10 senhas erradas, o IP fica bloqueado por
15 minutos. Trocar `ADMIN_PASSWORD` encerra todas as sessões abertas.

## Estrutura

```
├── db/schema.sql          # tabelas e produtos em votação (idempotente)
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
        ├── publicas.js    # GET /api/produtos, POST /api/votos
        └── admin.js       # login, resultado, votos, exclusão e CSV
```

## API

| Método | Rota                             | Descrição                                         |
| ------ | -------------------------------- | ------------------------------------------------- |
| GET    | `/api/produtos`                  | Produtos ativos por categoria e status            |
| POST   | `/api/votos`                     | Registra `{ cervejaId, energeticoId, matricula }` |
| POST   | `/api/admin/login`               | Login `{ senha }`                                 |
| POST   | `/api/admin/logout`              | Encerra a sessão                                  |
| GET    | `/api/admin/resultado`           | Resultado por categoria e por dia                 |
| GET    | `/api/admin/votos`               | Lista de votos                                    |
| DELETE | `/api/admin/votos/:id`           | Exclui um voto                                    |
| GET    | `/api/admin/exportar/resumo.csv` | Resultado consolidado em CSV                      |
| GET    | `/api/admin/exportar/votos.csv`  | Todos os votos em CSV                             |
| GET    | `/api/saude`                     | Verificação de saúde (app + banco)                |

## Publicação

**Passo a passo para servidor Ubuntu na AWS (sem Docker): [PUBLICAR-AWS.md](PUBLICAR-AWS.md).**
Os arquivos prontos de configuração do Nginx e do serviço (systemd) ficam em [`deploy/`](deploy/).

- Publique atrás de **HTTPS** (o cookie de login do admin passa a ser `Secure` automaticamente;
  com proxy reverso, defina `TRUST_PROXY=1`).
- O limite de tentativas de login fica em memória: rode **uma instância** do app.
- Faça backup do banco antes de excluir votos: `pg_dump pesquisa_natal > backup.sql`.
