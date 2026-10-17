# Deploy Guide — Artisan

## Arquitetura

1. **Frontend (desktop)**: Aplicação Wails em Go que empacota o React compilado como `.exe`. Roda localmente, sem servidor HTTP separado.
2. **Backend (broker)**: Servidor Go em `broker-go/` que gerencia sockets e sincroniza estado entre jogadores.
3. **Rede**: O frontend conecta ao broker via WebSocket (frames msgpack customizados, não Socket.IO). Não há WebRTC P2P — todas as imagens passam pelo broker.

### Estrutura de diretórios

```
owlbear-wails-spike/
├── desktop/              # Frontend Wails (Go + React)
│   ├── wails.json       # Config Wails (outputfilename: artisan-desktop)
│   ├── main.go          # Entry point Wails
│   ├── go.mod
│   └── frontend/        # Build Vite copiado AQUI (gerado — ver passo 2)
├── broker-go/           # Backend em Go puro
│   ├── main.go
│   ├── go.mod
│   ├── docker-compose.yml
│   └── internal/
│       ├── config/
│       ├── game/        # Hub e protocolo de game
│       ├── accounts/    # Auth GM
│       ├── tables/      # Mesas/membros/personagens
│       └── httpapi/
└── scripts/             # Scripts de build/vendoring/auditoria
```

## Build e empacotamento (Windows)

### Pré-requisitos

- **Go 1.25+** (para desktop e broker-go)
- **Node 20+ e Yarn** (para o React frontend)
- **Git** (para clonar e gerenciar)

### 1. Build do frontend (Vite), com o broker de produção embutido

Da raiz do repositório:

```bash
VITE_BROKER_URL=http://broker-host:9420 yarn build
```

`VITE_BROKER_URL` é *build-time* — fica embutida no `.exe` final, não lida
em runtime. Gera `build/` na raiz.

### 2. Copiar o build para o Wails embutir

Ainda na raiz do repositório (não dentro de `desktop/` — os caminhos
relativos de origem/destino são diferentes):

```bash
rm -rf desktop/frontend/assets
cp -R build/. desktop/frontend/
```

Limpar `desktop/frontend/assets/` antes de copiar evita que chunks com hash
antigo sobrevivam no app empacotado.

### 3. Build do desktop (Wails)

```bash
cd desktop
wails build -o artisan-desktop.exe
cd ..
```

Gera `desktop/build/bin/artisan-desktop.exe` — este é o app final. Confirme
que o broker certo foi embutido (exatamente uma ocorrência):

```bash
grep -a -c "http://broker-host:9420" desktop/build/bin/artisan-desktop.exe
```

### 4. Build do broker (opcional, para rodar local)

```bash
cd broker-go
go build -o ../broker.exe .
cd ..
```

Variáveis de ambiente do broker: ver seção **Configuração** abaixo.

### 5. Rodar broker e desktop

**Terminal 1 — Backend (broker)**:
```bash
$env:PORT = "9420"
$env:ALLOW_ORIGIN = ".*"
$env:DATA_DIR = "C:\data\artisan-broker"

.\broker.exe
```

**Terminal 2 — Desktop app**:
```bash
.\desktop\build\bin\artisan-desktop.exe
```

A app abre localmente; tenta conectar ao broker na `VITE_BROKER_URL` embutida
no build (passo 1), ou em `http://localhost:9420` se nenhuma foi definida.

---

## Deploy do broker via Docker (servidor remoto, ex. Tailscale)

`broker-go/docker-compose.yml` já traz a convenção usada neste projeto: bind
ao endereço Tailscale (nunca `0.0.0.0` nem o IP da LAN), `DATA_DIR` como bind
mount (não volume nomeado, para entrar no backup via `restic`).

```bash
# No host remoto, dentro de broker-go/
docker compose up -d --build
```

Ajuste `ports`/`ALLOW_ORIGIN`/`DATA_DIR`/`MAX_ACCOUNTS` no
`docker-compose.yml` conforme o ambiente. O primeiro uso de um bind mount
novo exige `chown -R 1000:1000 ./data` (o container roda como uid 1000).

### Build do desktop Linux (webkit2gtk-4.1)

Quando o host remoto também roda o executável desktop (ex. Arch Linux), o
alvo de pkg-config do Wails por padrão é o `webkit2gtk-4.0` obsoleto —
compilar com a tag `webkit2_41`:

```bash
sudo pacman -Sy --needed --noconfirm nodejs yarn go pkgconf gtk3 webkit2gtk-4.1 base-devel git
export PATH="$(go env GOPATH)/bin:$PATH"
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0

VITE_BROKER_URL=http://broker-host:9420 yarn build
rm -rf desktop/frontend/assets
cp -R build/. desktop/frontend/

cd desktop
wails build -tags webkit2_41 -o artisan-desktop
install -Dm755 build/bin/artisan-desktop "$HOME/.local/bin/artisan-desktop"
```

Verificar depois:

```bash
ldd "$HOME/.local/bin/artisan-desktop" | grep 'not found' && exit 1 || true
grep -a -c 'http://broker-host:9420' "$HOME/.local/bin/artisan-desktop"
```

---

## Configuração

### Broker (Go)

Variáveis de ambiente:

| Variável | Default | Descrição |
| --- | --- | --- |
| `PORT` | `9420` | Porta WebSocket do broker |
| `ALLOW_ORIGIN` | `*` | CORS; lista de origens permitidas (`,` separado) — requisições do `.exe` não carregam `Origin`, só importa para um build de navegador |
| `DATA_DIR` | `./data` | Diretório para o banco SQLite (contas, mesas, personagens) e backups de GM |
| `MAX_ACCOUNTS` | `4` | Limite de contas criadas (`docker-compose.yml` deste repo já sobe para `20`, ajustado ao tamanho da mesa) |
| `MAX_BACKUP_BYTES` | `2147483648` | Max 2GB por backup |

### Frontend (Vite)

| Variável | Default | Descrição |
| --- | --- | --- |
| `VITE_BROKER_URL` | não definida | URL completa do broker; se não definida, usa `<host da página>:VITE_BROKER_PORT` |
| `VITE_BROKER_PORT` | `9420` | Porta apenas (se `VITE_BROKER_URL` não é definida) |
| `VITE_VERSION` | de `package.json` | Versão exibida na UI |

---

## Fluxo de desenvolvimento (tudo local, sem empacotar)

```bash
# Terminal 1 — backend
cd broker-go && go run . && cd ..

# Terminal 2 — frontend dev (hot reload)
yarn start

# Terminal 3 — Wails dev (opcional, abre o shell nativo com hot reload)
cd desktop && wails dev && cd ..
```

A página fica em `http://localhost:3000`, broker em `localhost:9420`.

---

## Troubleshooting

### "Failed to connect to broker" no desktop app

- Verifique se o broker está rodando: `curl http://broker-host:9420/health`
- Confirme que `VITE_BROKER_URL` estava certa no build consumido pelo `.exe`
  (ela fica fixa no binário — rebuildar é a única forma de trocá-la)
- Teste conectividade de rede até o host do broker (ex. `ping broker-host`)

### "Origin not allowed" no broker

- Broker rejeita conexões CORS. Ajuste `ALLOW_ORIGIN` no ambiente do broker
  para incluir a origem que está falhando.

### Wails build falha

- Confirme Go 1.25+: `go version`
- Confirme WebView2 instalado no Windows (Wails precisa)
- Limpe: `cd desktop && rm -r build && wails build`

### React build lento/falha

- Aumente Node memory: `$env:NODE_OPTIONS = "--max-old-space-size=4096"`
- Limpe `node_modules`: `rm -r node_modules && yarn install`

### `.exe` desatualizado (não reflete o último código)

`yarn typecheck`/`yarn test`/`go test` nunca tocam o `.exe` final — ele só
embute o que foi copiado para `desktop/frontend/` na última vez. Sempre
`yarn build` → copiar para `desktop/frontend/` → `wails build`, e confirmar
com `grep -a -c` que o broker/marcador certo está no binário.
