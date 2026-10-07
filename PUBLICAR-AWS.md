# Publicar na AWS (Ubuntu, sem Docker)

Como o sistema fica no servidor:

```
Navegador ──► Nginx (portas 80/443) ──► Node.js (porta 3000) ──► PostgreSQL (porta 5432, só local)
```

Tempo estimado: 30 minutos.

---

## 1. Criar o servidor na AWS

No console da AWS, abra **EC2 → Launch instance** e preencha:

| Campo                     | Valor                                                       |
| ------------------------- | ----------------------------------------------------------- |
| Name                      | `pesquisa-natal`                                            |
| Application and OS Images | **Ubuntu Server 24.04 LTS**                                 |
| Instance type             | `t3.micro` (suficiente) ou `t3.small`                       |
| Key pair                  | **Create new key pair** → baixe o arquivo `.pem` e guarde-o |
| Network settings          | Marque **SSH (My IP)**, **HTTP** e **HTTPS**                |
| Configure storage         | 20 GB                                                       |

Clique em **Launch instance**.

Depois fixe o IP (para ele não mudar se o servidor reiniciar):
**EC2 → Elastic IPs → Allocate Elastic IP address → Actions → Associate** → escolha a instância.

**Domínio (opcional, mas necessário para HTTPS):** no seu provedor de DNS, crie um registro
**tipo A**, por exemplo `pesquisa.seudominio.com.br`, apontando para o Elastic IP.

> Usando **Lightsail** em vez de EC2? Os passos a partir do 2 são os mesmos. Só libere as portas
> 80 e 443 na aba **Networking** da instância.

## 2. Acessar o servidor

No Windows (PowerShell), Mac ou Linux:

```bash
ssh -i caminho/da/chave.pem ubuntu@SEU_IP
```

> No Mac/Linux, se aparecer erro de permissão da chave, rode antes: `chmod 400 caminho/da/chave.pem`

## 3. Instalar Node.js, PostgreSQL, Nginx e Git

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs postgresql nginx git
node -v
```

O último comando deve mostrar `v22...`.

## 4. Criar o banco de dados

Gere uma senha para o banco:

```bash
openssl rand -hex 16
```

Copie o resultado e use no lugar de `SENHA_DO_BANCO`:

```bash
sudo -u postgres psql -c "CREATE USER natal WITH PASSWORD 'SENHA_DO_BANCO';"
sudo -u postgres psql -c "CREATE DATABASE pesquisa_natal OWNER natal;"
```

## 5. Baixar o sistema

O repositório é privado, então o GitHub vai pedir um **token** no lugar da senha. Para criá-lo:
**GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens →
Generate new token**. Em _Repository access_ escolha só o `pesquisanatalbrinde` e, em
_Permissions_, marque **Contents: Read-only**. Copie o token.

```bash
cd ~
git clone -b claude/optimistic-gauss-xynoj8 https://github.com/melhorartecnologia-arch/pesquisanatalbrinde.git
cd pesquisanatalbrinde
npm ci --omit=dev
```

Quando pedir: **Username** = seu usuário do GitHub; **Password** = cole o token.

> Se depois o código for juntado na branch `main`, troque `-b claude/optimistic-gauss-xynoj8` por `-b main`.

## 6. Configurar

Gere o segredo dos cookies e copie o resultado:

```bash
openssl rand -hex 32
```

Crie e edite o arquivo de configuração:

```bash
cp .env.example .env
nano .env
```

Deixe assim (trocando os valores em maiúsculas):

```ini
PORT=3000
DATABASE_URL=postgres://natal:SENHA_DO_BANCO@localhost:5432/pesquisa_natal
DATABASE_SSL=false
ADMIN_PASSWORD=SENHA_DO_PAINEL_ADMIN
SESSION_SECRET=COLE_AQUI_O_SEGREDO_GERADO
ADMIN_SESSION_HOURS=8
FUSO_HORARIO=America/Sao_Paulo
TRUST_PROXY=1

# Opcional: encerra a votação automaticamente
# VOTACAO_ENCERRA_EM=2026-12-05T23:59:59-03:00
```

Salve com **Ctrl+O**, **Enter** e saia com **Ctrl+X**. Depois proteja o arquivo e teste o banco:

```bash
chmod 600 .env
npm run db:init
```

Deve aparecer: `Banco de dados pronto: tabelas criadas e itens cadastrados.`

## 7. Deixar o sistema sempre ligado

O arquivo [`deploy/pesquisa-natal.service`](deploy/pesquisa-natal.service) faz o sistema subir
sozinho quando o servidor liga e reiniciar se cair.

```bash
sudo cp deploy/pesquisa-natal.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pesquisa-natal
sudo systemctl status pesquisa-natal
curl http://localhost:3000/api/saude
```

O `status` deve mostrar **active (running)** (saia com a tecla `q`) e o `curl` deve responder `{"ok":true}`.

> O serviço considera o usuário `ubuntu` e a pasta `/home/ubuntu/pesquisanatalbrinde`. Se usar
> outro usuário ou pasta, ajuste as linhas `User=` e `WorkingDirectory=` do arquivo.

## 8. Configurar o Nginx

```bash
sudo cp deploy/nginx-pesquisa-natal.conf /etc/nginx/sites-available/pesquisa-natal
sudo nano /etc/nginx/sites-available/pesquisa-natal
```

Se tiver domínio, troque `server_name _;` por `server_name pesquisa.seudominio.com.br;`. Sem
domínio, deixe como está. Salve e ative:

```bash
sudo ln -s /etc/nginx/sites-available/pesquisa-natal /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

O `nginx -t` deve dizer `syntax is ok` e `test is successful`.
Agora o site já abre em `http://SEU_IP` (ou `http://seu-dominio`).

## 9. Ativar HTTPS (precisa de domínio)

Primeiro coloque o seu domínio no Nginx. **Sem isso, o Certbot gera o certificado mas não consegue
instalá-lo.** Troque `pesquisa.seudominio.com.br` pelo seu domínio nos comandos abaixo:

```bash
sudo sed -i 's/server_name _;/server_name pesquisa.seudominio.com.br;/' /etc/nginx/sites-available/pesquisa-natal
grep server_name /etc/nginx/sites-available/pesquisa-natal
sudo nginx -t && sudo systemctl reload nginx
```

O `grep` deve mostrar o seu domínio. Depois gere e instale o certificado:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pesquisa.seudominio.com.br --redirect
```

Informe um e-mail e aceite os termos. O `--redirect` faz quem acessar por `http://` ir
automaticamente para `https://`. A renovação do certificado é automática.

> A porta **443** precisa estar liberada: no EC2, no Security Group; no **Lightsail**, em
> **Networking → IPv4 Firewall → Add rule → HTTPS**.

## 10. Conferir

1. Abra o site, escolha um item, digite uma matrícula de teste e vote: deve aparecer **"Obrigado pelo
   seu voto!"** e, após 5 segundos, a tela volta sozinha para a escolha.
2. Abra `/admin`, entre com a `ADMIN_PASSWORD` e confira o voto.
3. **Exclua os votos de teste** no painel antes de divulgar o link para os colaboradores.

---

## Dia a dia

| Tarefa                               | Comando                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Ver o que está acontecendo (logs)    | `sudo journalctl -u pesquisa-natal -f`                                                               |
| Reiniciar o sistema                  | `sudo systemctl restart pesquisa-natal`                                                              |
| Trocar senha do admin ou data de fim | edite o `.env` (`nano ~/pesquisanatalbrinde/.env`) e reinicie o sistema                              |
| Atualizar para uma nova versão       | `cd ~/pesquisanatalbrinde && git pull && npm ci --omit=dev && sudo systemctl restart pesquisa-natal` |
| Fazer backup do banco                | `pg_dump -h localhost -U natal pesquisa_natal > ~/backup-$(date +%F).sql` (pede a senha do banco)    |

## Se algo der errado

| Sintoma                                                         | O que fazer                                                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **502 Bad Gateway**                                             | O Node.js não está rodando. Veja `sudo systemctl status pesquisa-natal` e os logs.                                                           |
| Site não abre de jeito nenhum                                   | Confira no Security Group da instância se as portas **80** e **443** estão liberadas.                                                        |
| `password authentication failed` nos logs                       | A senha no `DATABASE_URL` do `.env` é diferente da criada no passo 4.                                                                        |
| Certbot falha                                                   | O domínio ainda não aponta para o Elastic IP (aguarde alguns minutos) ou a porta 80 está fechada.                                            |
| Certbot: `Could not automatically find a matching server block` | O `server_name` do Nginx não é o domínio. Faça a primeira parte do passo 9 e rode `sudo certbot install --cert-name SEU_DOMINIO --redirect`. |
| HTTP abre, HTTPS não abre                                       | Libere a porta **443** no Security Group (EC2) ou no firewall da instância (Lightsail).                                                      |
| `ADMIN_PASSWORD` não definida nos logs                          | Falta a linha `ADMIN_PASSWORD=` no `.env`.                                                                                                   |

## Atualizar um servidor que já está no ar

Para aplicar uma nova versão (por exemplo, a votação livre sem nome/setor):

```bash
cd ~/pesquisanatalbrinde
git pull
npm ci --omit=dev
sudo systemctl restart pesquisa-natal
```

O banco é ajustado automaticamente ao reiniciar e os votos já registrados são mantidos.
