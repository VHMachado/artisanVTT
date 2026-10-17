# Auditoria e spike de ativos CC0 para dados 3D

## Auditoria de licença (concluída)

Fonte escolhida: **PolyhedralDice** por TSE-WEI-CHEN ("Gary").

- Repositório: https://github.com/tse-wei-chen/PolyhedralDice (commit da
  branch `main` em 2026-10-09, 14 commits, 1 star).
- Também publicado no Godot Asset Store:
  https://store.godotengine.org/asset/gary/polyhedraldice/ (v1.0.2).
- **Licença: CC0 1.0 Universal.** Texto legal completo baixado e verificado
  em `vendor/PolyhedralDice/LICENSE` (não é só uma alegação no README — é o
  texto oficial da Creative Commons). Uso comercial permitido, atribuição
  NÃO exigida.
- Conteúdo: D4, D6, D8, D10 (ones/unidades), D10 Percentile (dezenas), D12,
  D20 — cobre exatamente os 7 tipos que `src/types/Dice.ts`/`PROCEDURAL_DICE_GEOMETRY`
  já modelam, incluindo a composição percentual d10+d100.
- Formato: glTF 2.0 (`.gltf` + `.bin` externo), texturas PBR separadas
  (BaseColor/Normal/Metallic/Roughness) em dois materiais por dado:
  `Dice_Recess_BlackRed_UV_PBR` (corpo) e `Antique_Gold_UV_PBR` (números
  gravados/dorados). Fonte original também inclui `.blend`, não baixado
  (não necessário para runtime).
- Tamanho total baixado: 6,0 MB (`.gltf`+`.bin`+texturas), abaixo do ~6,4MB
  dos ativos Owlbear originais substituídos por esta rota.

Arquivos baixados em `spikes/005-dice-cc0-assets/vendor/PolyhedralDice/`
(gltf, bin, texturas, LICENSE, README) — **fora de `src/`**, isolado até
a validação abaixo terminar.

## Spike de compatibilidade (em andamento)

### Geometria (medida via Node, sem browser)

| Dado | Vértices | Triângulos | Rotação do nó raiz |
|---|---|---|---|
| D4  | 5230 | 3152 | identidade |
| D6  | 3375 | 2140 | quaternion não-identidade (leve tilt) |
| D8  | 4597 | 2572 | identidade |
| D10 (ones) | 5734 | 3548 | identidade |
| D10 (percentile) | 8139 | 5628 | identidade |
| D12 | 8569 | 5080 | identidade |
| D20 | 13542 | 8464 | identidade |

Malhas são **otimizadas/chanfradas** (muito mais triângulos que o mínimo de
uma malha convexa simples: ex. D6 tem 2140 triângulos, não 12), com os
números **esculpidos/gravados na geometria e no material dourado**, não
como decalques de textura plana. Isso é estruturalmente melhor que o
`DynamicTexture` em plano usado pela abordagem procedural anterior —
aqui o número já é parte do modelo.

### Pendências antes de integrar ao motor (`src/dice/`)

1. **Mapeamento face→valor.** O glTF não carrega metadado semântico
   dizendo "este triângulo é o 7". É preciso derivar isso: provavelmente
   por normal de face + qual região de UV do material dourado está visível
   lá. Nenhuma ferramenta de edição 3D está disponível neste ambiente —
   abordagem planejada é renderizar headless (Babylon via CDN + loader
   glTF em Edge headless/CDP, mesmo padrão usado para validar a
   abordagem procedural anterior) e ler os números por `vision_analyze`,
   construindo a tabela normal→valor por die.
2. **Convexidade para o impostor Ammo.** A malha é chanfrada/otimizada, não
   um poliedro platônico perfeito — confirmar que `PhysicsImpostor.ConvexHullImpostor`
   aceita essa contagem de vértices sem explodir o solver (D20 tem 13542
   vértices, ordens de magnitude acima da malha procedural atual).
   Possível mitigação: usar a malha visual completa, mas um casco convexo
   simplificado separado só para física (Babylon tem `ConvexHullImpostor`
   que já faz isso internamente via Ammo, mas nunca foi testado com uma
   malha deste tamanho no projeto).
3. **Escala e origem.** Confirmar que o centro geométrico de cada dado
   coincide com a origem do nó (necessário para `distance`/normal usados
   pelos locators) e qual a extensão real (não necessariamente raio 1).
4. **Carregador glTF.** `@babylonjs/loaders` não está no `package.json`
   (a geometria procedural anterior removeu a dependência). Precisa ser
   readicionada só se esta rota for confirmada — isolar essa decisão até
   o mapeamento face→valor estar provado no spike.

### Próximo passo concreto

Montar uma página HTML autônoma em `spikes/005-dice-cc0-assets/` (Babylon
via CDN, sem tocar `package.json`/`src/`) que carregue cada `.gltf`,
oriente a câmera para cada normal de face única e capture via CDP. Ler os
números por `vision_analyze` para fechar a tabela de mapeamento antes de
qualquer mudança em `src/dice/`.

### Resultado do spike no D6 (prova de conceito — concluído)

Construído `viewer.html` (Babylon 4 via CDN, carregando os `.gltf`
baixados por HTTP local, servido com `python -m http.server`). Validado
via Edge headless + CDP, mesmo padrão usado nos spikes anteriores.

**Achado chave:** os números NÃO são identificáveis por normal única de
vértice (o relevo esculpido com bisel gera ~194 normais distintas no D6
sozinho). O caminho que funciona é **componentes conectados** na malha do
material dourado (`*_primitive1`, separada do corpo `*_primitive0`): cada
dígito gravado é seu próprio componente desconectado, com um componente
grande adicional para o aro/moldura de cada face. Algoritmo: soldar
vértices por posição (glTF duplica vértice por triângulo), BFS por
triângulo compartilhado, agrupar por componente, pegar centróide e normal
média — a normal média do componente aponta para fora da face correta.

**D6 mapeado e fechado por auto-consistência** (regra do dado: faces
opostas somam 7):

| Normal local | Valor |
|---|---|
| +X | 2 |
| -X | 5 |
| +Y | 1 |
| -Y | 6 |
| +Z | 3 |
| -Z | 4 |

2+5=7, 1+6=7, 3+4=7 — confere. Método provado ponta-a-ponta: carregar
glTF headless → agrupar componentes → apontar câmera pela normal →
capturar → ler por `vision_analyze` → validar por invariante conhecido do
dado (soma de faces opostas, quando aplicável).

### Escala do trabalho restante (continuação)

O D6 tem 6 faces. D20 tem 20, D12 tem 12, e os dois D10 (ones + percentile)
têm 10 cada — **68 capturas e leituras adicionais**, mais a extração de
componentes conectados por dado. Cada normal lida por `vision_analyze` é
uma chamada; dado o volume, o próximo passo é automatizar a leitura do
dígito (ex.: renderizar a textura dourada 2D isolada e recortar cada
componente sem precisar girar câmera por face), ou delegar a leitura em
lote a um subagente. Script de mapeamento (`connectedComponents` em
`viewer.html`) já generaliza para qualquer um dos 7 arquivos — só falta
rodar e ler.

### Resultado do spike no D10_Ones (concluído)

Mapeado em `mapping-d10ones.json`. Confirmado por leitura visual de todos
os 10 glifos: é o D10 de **unidades 0-9** (não 1-10) — dígitos gravados são
literalmente 0,1,2,...,9, um por face, sem repetição.

**Peculiaridades específicas deste asset (além das já documentadas em
D4/D6/D8):**

1. Corpo e dígitos compartilham o mesmo material dourado
   (`Antique_Gold_UV_PBR`, `D10_Ones_primitive1`), como no D4 — o corpo é o
   componente 0 (2088 vértices, centróide na origem); o mesh
   `Dice_Recess_BlackRed_UV_PBR` (`primitive0`) tem só 40 vértices (um trim
   fino, não o corpo).
2. O nó raiz tem um **scale não-trivial** (não é rotação/quaternion como no
   D8): a composição `D10_Ones.scaling=[1.1158,1.1158,1.1158]` com
   `__root__.scaling=[1,1,-1]` produz um espelhamento efetivo em X no
   espaço mundial. É preciso espelhar X antes de apontar a câmera.
3. **Achado novo (não visto em D4/D6/D8): a normal média por vértice do
   componente do glifo é pouco confiável** nesta malha — para várias faces
   ela apontava quase na direção oposta à face real (dot product até
   -0.87 contra a direção correta), causando screenshots com 2-3 faces
   simultaneamente visíveis e leituras contraditórias do `vision_analyze`.
   A correção: usar a **direção radial do centróide** do componente
   (centróide normalizado, espelhado em X) para apontar a câmera —
   verificado projetando os próprios vértices do componente com
   `BABYLON.Vector3.Project` e confirmando que o centro da bounding box
   cai a poucos pixels do centro exato da tela (320,320 em canvas
   640x640) antes de aceitar qualquer leitura.
4. Também foi necessário `Page.captureScreenshot` com
   `captureBeyondViewport: true` e um `clip` explícito 640x640 — a janela
   do Edge headless tinha viewport real menor que o canvas Babylon, então
   screenshots sem essas opções devolviam pixels obsoletos/incorretos fora
   da área visível.

Como pentagonal trapezohedron, o D10 **não tem simetria de inversão
central** — não existe par antipodal perfeito como no D6/D8, então não há
invariante de "soma de faces opostas" aplicável. A validação usada foi
apenas: conjunto completo {0,1,...,9} sem repetição, confirmado por
igualdade de conjuntos em Python.

### Resultado do spike no D10_Percentile (concluído)

Mapeado em `mapping-d10percentile.json`. Mesma família geométrica do
D10_Ones (pentagonal trapezohedron, 10 faces em forma de pipa), mas é o
dado de **dezenas** do par percentual: cada face mostra **dois dígitos
gravados lado a lado** (não um só), formando os valores 00, 10, 20, 30,
40, 50, 60, 70, 80, 90 — confirmado por leitura visual literal de todas
as 10 faces, sem assumir o formato de antemão. Nenhuma face mostrou ponto
decimal ou marca de "x10" separada; são sempre dois caracteres numéricos
completos.

**Diferença estrutural chave vs D10_Ones:** na malha `D10_primitive1`
(Antique_Gold_UV_PBR, 8099 vértices, corpo+dígitos compartilhando
material como no D10_Ones/D4), os componentes conectados do glifo vêm em
**pares** — 20 componentes de dígito (11-30) agrupados em 10 pares por
face (cada face tem 2 componentes de ~157-409 vértices, um por caractere),
ao invés de 1 componente por face como no D10_Ones. Isso por si só já
indicou, antes mesmo da leitura visual, que este asset é o dado de duas
casas decimais.

**Reaproveitado do D10_Ones sem surpresas:** (1) o nó raiz tem a mesma
composição de escala-espelho em X (`D10.scaling=[1.1158,...]` ×
`__root__.scaling=[1,1,-1]` com rotationQuaternion 180° em Y — confirmado
via `mesh.getWorldMatrix()` = diag(-1.1158, 1.1158, 1.1158)); (2) a normal
média do componente NÃO foi usada para apontar a câmera — em vez disso,
`aimAtComponentCentroid()` (nova função adicionada a `viewer.html`) usa a
direção radial do centróide do componente-stud (o pequeno componente
decorativo de canto, 70-78 vértices por face), transformada pela matriz de
mundo completa; (3) verificação via `projectComponentBBox()` (também nova)
reprojetando os próprios componentes de glifo com `BABYLON.Vector3.Project`
após mover a câmera — centros de bounding box ficaram entre (313,334) e
(326,301) de um canvas 640×640 (centro exato 320,320), confirmando
enquadramento correto antes de aceitar qualquer leitura; (4)
`Page.captureScreenshot` com `captureBeyondViewport:true` + `clip` 640×640
explícito, necessário pois o viewport real da janela (`innerHeight=488`)
era menor que o canvas.

Validação: conjunto completo {0,10,20,...,90} sem repetição, confirmado em
Python. Sem invariante de soma de faces opostas (mesma razão do
D10_Ones — trapezohedro pentagonal não tem simetria de inversão central).

**OBSERVAÇÃO vs INFERÊNCIA (documentado explicitamente no JSON):** o que
está literalmente gravado em cada face é o numeral de dois dígitos
completo ('00' a '90'). A combinação com o D10_Ones para formar um d100
(somar o valor das dezenas + o valor das unidades do D10_Ones, com a
convenção usual de que '00'+'0' significa 100) é uma INFERÊNCIA de uso de
jogo, não algo gravado no modelo — deixado para a integração com o motor
decidir.

### Resultado do spike no D4 (concluído)

O bloqueio de revalidação world-space foi encerrado. A tentativa anterior
agrupava os 12 glifos em quatro triplas incorretas sem usar a topologia mínima
do próprio asset. `D4_Corrected_primitive0` tem exatamente 12 vértices e 4
triângulos, permitindo recuperar as quatro faces reais; os glifos de
`D4_Corrected_primitive1` foram atribuídos primeiro à face de maior produto
escalar e depois ao vértice físico mais próximo.

`validate-d4-worldspace.cjs` recarrega o glTF em Edge headless isolado,
executa `mesh.computeWorldMatrix(true)`, transforma a normal local da face por
`Vector3.TransformNormal`, confirma que cada centróide fica em `(320,320)` via
`Vector3.Project` e captura com `captureBeyondViewport:true` + clip explícito
de 640×640. A matriz real do mesh é `diag[-0.935429,+0.935429,+0.935429,1]`,
portanto a leitura local crua seria incorreta.

As três leituras visuais independentes para cada vértice foram:

| vértice físico | componentes-glifo | leituras | valor |
|---|---|---|---|
| V1 | 8, 9, 10 | 2, 2, 2 | 2 |
| V2 | 5, 6, 7 | 1, 1, 1 | 1 |
| V3 | 11, 12, 13 | 3, 3, 3 | 3 |
| V4 | 14, 15, 16 | 4, 4, 4 | 4 |

O conjunto é exatamente `{1,2,3,4}` sem repetição. `mapping-d4.json` agora
está `validated:true`, guarda as direções locais dos quatro vértices e pode
ser consumido pela integração com o motor. Isso completa o mapeamento
face→valor para os sete dados.

