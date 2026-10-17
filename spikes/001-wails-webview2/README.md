# 001 — Wails + WebView2 carrega o app?

Spike descartável: valida a plataforma antes de portar o broker para Go,
porque é o único passo capaz de inviabilizar o plano do desktop.

## Pergunta

Given o bundle Vite,
when embutido num app Wails v2 rodando sobre WebView2,
then a aplicação carrega e as três dependências pesadas funcionam.

## Os três riscos a testar

| # | Risco | Por que importa | Como verificar |
|---|---|---|---|
| A | Babylon.js + ammo.js (WASM) | Dados 3D com física. WASM em webview embutida é o ponto mais frágil | Abrir a bandeja de dados e rolar |
| B | TensorFlow.js (modelo de 2.4MB) | Detecção de grid ao importar mapa | Importar um mapa e conferir a detecção |
| C | IndexedDB persistente | Motivo deste spike existir | Criar dado, fechar o app, reabrir |

## Ambiente

- WebView2 Runtime: **152.0.4191.66** (já instalado na máquina)
- Go: 1.23.4 (portátil em `C:\tools\go`)
- Wails: v2 CLI (`C:\tools\gopath\bin`)
- Frontend: build Vite da branch `vite-migration`

## Isolamento

Este spike vive num **git worktree separado** (`../owlbear-wails-spike`, branch
`wails-spike`) para não tocar no diretório onde a `main` roda via docker compose.

## Verdict

**VALIDATED, com uma correção obrigatória.**

### Bug encontrado: `ammo.js` (build asm.js) trava o WebView2 indefinidamente

A pasta `node_modules/ammo.js` distribui duas builds: `builds/ammo.js`
(asm.js puro, 1.7MB, é o `main` do `package.json`) e `builds/ammo.wasm.js` +
`ammo.wasm.wasm` (WebAssembly real). O projeto usava a primeira.

Sintoma relatado pelo usuário: abrir a bandeja de dados mostra um ícone de
carregamento infinito; a janela inteira para de responder a cliques pouco
depois; era preciso fechar e reabrir o programa.

Isolação (ver `ammo-isolation.html`, `ammo-wasm-deep-trace.html`,
`wasm-minimal.html` neste diretório): chamar `Ammo()` do build asm.js —
**sem nenhum código deste projeto, sem Babylon, sem texturas** — já trava.
A promise nunca resolve nem rejeita; o processo `msedgewebview2` fica preso
num único core a 100% e cresce linearmente sem nunca convergir (confirmado
até 156s de CPU acumulada em 150s de wall-clock). Reproduzido de forma
idêntica **fora do Wails**, num Edge comum apontando para o mesmo arquivo —
não é um problema do Wails/WebView2 nem desta migração Vite, é uma
incompatibilidade do V8/Chromium desta máquina (Edge 153.0.4234.32) com esse
bundle asm.js legado do Emscripten.

A build `ammo.wasm.js` (WebAssembly real) do mesmo pacote instancia em
~30ms no mesmo ambiente, sem nenhum problema.

### Fix aplicado (branch `wails-spike`)

- `src/components/dice/DiceInteraction.tsx`: importa
  `ammo.js/builds/ammo.wasm.js` (+ `ammo.js/builds/ammo.wasm.wasm?url` via
  Vite) em vez de `ammo.js`; passa `locateFile` para `instantiateAmmo`.
- `src/helpers/ammo.ts`: `instantiateAmmo` aceita um segundo argumento
  `config` opcional, repassado à factory do Emscripten.
- `src/global.d.ts`: declarações de módulo para o novo import e para
  `*.wasm?url`.
- `src/components/dice/DiceTrayOverlay.tsx`: `initializeScene` agora tem
  `try/finally` ao redor do carregamento, então `handleAssetLoadFinish()`
  sempre roda — sem isso, uma rejeição deixaria o spinner preso mesmo com o
  bug do ammo.js corrigido (candidato de causa secundário, corrigido por
  precaução).

### Verificação

- `yarn typecheck`, `yarn test` (23/23) e `yarn build` passam.
- App Wails real: abrir/fechar a bandeja de dados 5x seguidas, CPU do
  WebView2 estável (não cresce), árvore de acessibilidade populada
  continuamente, "Hide Dice Tray" clicável a cada ciclo — sem travar.

### Riscos A/B/C

- **A (Babylon.js + ammo.js WASM)** — VALIDATED após o fix acima.
- **B (TensorFlow.js)** — VALIDATED (2026-09-15): testado no `.exe` real
  (WebView2), importar mapa detecta a grid corretamente e desenha por cima
  da imagem sem travar.
- **C (IndexedDB persistente)** — VALIDATED em sessão anterior
  (`AppData\Roaming\artisan-desktop.exe\EBWebView\`, perfil próprio fora do
  navegador).

## Veredito final

**Os três riscos (A/B/C) estão VALIDATED.** Nenhum motivo de plataforma
para abortar o plano do desktop. Próximo passo: broker em Go + remoção
do WebRTC.

### Lição para o próximo pacote asm.js/Emscripten legado

Antes de assumir bug no código do app: isolar a lib suspeita numa página
HTML mínima, sem nenhuma dependência do projeto, e testar num navegador
comum fora do runtime alvo (Wails/Electron/etc). Se travar isolada e fora
do runtime, é a lib/o motor JS, não a integração. `WebAssembly.instantiate`
com um binário mínimo (8 bytes) é um bom teste de controle para confirmar
que o motor WASM em si funciona antes de suspeitar dele.

