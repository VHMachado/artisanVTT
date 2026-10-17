# 003 — versionamento autoritativo, checagem E2E real

Este script não é um teste automatizado da suíte (não roda em
`go test`/`yarn test`) — é a verificação manual ponta-a-ponta que comprova o
comportamento acordado do protocolo através do wire real (WebSocket + msgpack
binário via `broker.exe` compilado), coisa que os testes unitários Go
(`internal/game/hub_test.go`, `repository_test.go`) e os testes de hook do
frontend (`src/hooks/useNetworkedState.test.tsx`) não cobrem sozinhos: ambos
testam contra structs/mocks em processo, nunca contra a codificação msgpack
real trafegando por um `net/http`+`gorilla/websocket` de verdade.

## Como rodar

```bash
cd broker-go && go build -o broker.exe . && PORT=19423 ./broker.exe &
cd .. && BROKER_URL=ws://localhost:19423/socket node spikes/003-versioned-map-state/e2e-versioning-check.js
```

Saída esperada: `E2E VERSIONING TEST PASSED`. Qualquer `ASSERTION FAILED`
indica regressão no versionamento.

## O que verifica

Reproduz o cenário exato de um bug de versionamento conhecido: A e B entram na
mesma partida, A empurra o `map_state` inicial (v0→v1), B aplica uma edição
parcial (v1→v2), depois A tenta um "undo" ainda com `baseVersion=1` (calculado
antes de saber da edição de B). Sem o guard de versão, o undo de A
sobrescreveria a edição de B silenciosamente (era exatamente o bug do
`deep-diff`/`revertChange` restaurando por valor absoluto). Com o guard:

- o update de A é rejeitado (`Conflict`), nunca aplicado;
- A recebe de volta o estado canônico `{state, version}` via reenvio do
  evento `map_state` (não `map_state_update`);
- B não recebe nada relacionado ao update rejeitado de A;
- a edição de B (`x=10`) sobrevive.

## Achado durante a checagem manual

A primeira versão do script falhava com timeouts/valores errados por causa de
uma race no próprio harness de teste (fila de eventos não bufferizada antes do
primeiro `waitFor`) — não no broker. Depois de corrigir o harness, um segundo
problema real apareceu: `baseVersionOf` em `hub.go` só reconhecia
`int/int64/float64`, mas o decoder msgpack (`vmihailenco/msgpack`) escolhe o
tipo Go mais estreito pra caber o valor (`int8`/`uint8`/... para números
pequenos como `baseVersion: 1`), então um `baseVersion` legítimo caía no
`default: -1` e todo update pós-primeiro-sync era tratado como conflito falso.
Corrigido cobrindo todos os tipos inteiros/float que `diffpatch.asInt` já
tratava para `change.index` — mesma classe de bug, mesmo motivo.
