---
version: alpha
name: Artisan
description: VTT de mesa em modo escuro cinematográfico — canvas quase preto, arte de campanha em destaque, detalhe em dourado/bronze aplicado com parcimônia.
colors:
  primary: "#8B703D"
  secondary: "#B08D52"
  background: "#101217"
  surface: "#15171C"
  overlay: "hsla(210, 15%, 8%, 0.8)"
  text: "hsl(210, 50%, 96%)"
  muted-text: "hsl(0, 0%, 70%)"
  border: "hsla(210, 50%, 96%, 0.5)"
  ink: "#101217"
  danger: "#d65c64"
  warning: "#ca871e"
typography:
  wordmark:
    fontFamily: "Freigeist Wordmark"
    fontSize: 4rem
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0.01em"
  h1:
    fontFamily: Archivo
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.25
  h2:
    fontFamily: Archivo
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.25
  body-md:
    fontFamily: Archivo
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.3
  body-sm:
    fontFamily: Archivo
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label-caps:
    fontFamily: Archivo
    fontSize: 0.75rem
    fontWeight: 700
    letterSpacing: "0.08em"
rounded:
  sm: 4px
  md: 8px
  lg: 16px
  pill: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
components:
  button-cta:
    backgroundColor: "{colors.text}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: 12px
  button-cta-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.ink}"
  button-outline:
    backgroundColor: transparent
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 8px
  button-outline-active:
    textColor: "{colors.primary}"
  card-scene:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 16px
  card-table:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 16px
  card-meta:
    textColor: "{colors.muted-text}"
  # Content line/block inside a TRANSPARENT panel overlaid on the map
  # art (the game screen's sidebar). Uses `overlay` instead of `surface`
  # because the background here is art, not the app chrome: the rule
  # "cover any background art with overlay before writing text on top"
  # applies. theme.ts: `cards.panelItem`.
  card-panel-item:
    backgroundColor: "{colors.overlay}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 8px
  modal-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: 24px
  modal-scrim:
    backgroundColor: "{colors.overlay}"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 8px
  card-border:
    backgroundColor: "{colors.border}"
  # Right-panel tabs (Tokens / Monsters) — active state marked by an
  # accent underline, NEVER by a filled background: gold/bronze is a
  # pointer accent, and filling it behind text fails the contrast
  # measurement below. theme.ts: `buttons.tab` / `buttons.tabActive`.
  tab:
    backgroundColor: transparent
    textColor: "{colors.muted-text}"
    padding: 8px
  tab-active:
    backgroundColor: transparent
    textColor: "{colors.text}"
  # O sublinhado de 2px da aba ativa, modelado como superfície própria pelo
  # mesmo motivo que `card-border`: o spec não tem sub-token de borda.
  tab-active-underline:
    backgroundColor: "{colors.primary}"
  banner-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 12px
  banner-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 12px
  # Destructive action rendered as a bordered button rather than a
  # context-menu row (e.g. Settings' "Apagar todo o conteúdo") — same
  # `danger` token the menu-item-destructive/banner-danger components
  # already use. theme.ts: `buttons.danger`.
  button-danger:
    backgroundColor: transparent
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: 8px
---

## Overview

Artisan é um VTT de mesa privada, usado sempre no escuro, sessão longa, foco
total no mapa e na arte da campanha — não é um SaaS de produtividade. A
referência pedida foi o **Alchemy** (`app.alchemyrpg.com`): pesquisei o que
mais se parece com ele para confirmar que a linguagem não é uma invenção da
Alchemy, é um gênero já estabelecido de "launcher de jogo escuro e
cinematográfico" que várias ferramentas de RPG convergiram para o mesmo
lugar:

| Referência | O que tem em comum com o Alchemy |
|---|---|
| **LegendKeeper** | Canvas quase preto, tipografia limpa, dark mode como *o* modo (não opcional); UI redesenhada do zero na v0.19 pelo mesmo motivo que este documento existe: consistência visual como característica de produto, não acidente. |
| **Foundry VTT + tema "Twilight UI"** | Um dos temas mais instalados da comunidade Foundry é descrito pelo próprio autor como *"inspirado quase 1:1 na interface do LegendKeeper"* — confirma que esse estilo (painéis escuros, bordas sutis, tipografia carregada) já é o padrão de fato entre VTTs modernos, não modismo passageiro. |
| **Fantasy Grounds — tema "Hearth"** | Reduz o UI padrão (que é clarinho e cheio de textura 3D) para paleta escura, flat, contraste 7:1 — mesmo raciocínio de acessibilidade que já guia o Artisan (dourado é detalhe, nunca texto corrido, por causa do contraste baixo sobre fundo escuro). |
| **Epic Games Store / Steam** | Não são apps de RPG, mas são a origem do padrão "hero cinematográfico + carrossel de cards" que o Alchemy usa na Home — vale reconhecer a fonte: é linguagem de *launcher de jogo*, adaptada para tabuleiro. |
| **D&D Beyond** | Contra-exemplo deliberado: o tema claro/cinza é criticado publicamente (inclusive por extensões de terceiros nascidas só para escurecer o site) por falta de hierarquia visual e por não usar as cores associadas à marca. Serve de lembrete do que evitar: paleta sem hierarquia clara entre fundo, superfície e destaque.

**Decisão para o Artisan:** adotar a *estrutura* do Alchemy (canvas escuro,
hero cinematográfico, cards de conteúdo, abas com sublinhado ativo, CTA em
pílula de alto contraste) mas manter a paleta **dourado/bronze** já
implementada no código, em vez do vermelho/carmesim do Alchemy — decisão
do usuário, e também a paleta já está testada quanto a contraste e já está
no código (`src/theme.ts`). Isto é reuso de linguagem visual, não clonagem
de marca.

## Colors

- **`background` (#101217):** fundo da aplicação inteira — a "sala escura"
  onde a arte do mapa e das mesas se destaca. Nunca usar para texto.
- **`surface` (#15171C):** camada acima do fundo — drawers, painéis
  laterais, cards, modais. A diferença de luminosidade entre `background` e
  `surface` é sutil de propósito (ver "Elevation & Depth").
- **`primary` (#8B703D) / `secondary` (#B08D52):** dourado/bronze — **cor de
  detalhe, nunca de texto corrido** (contraste insuficiente sobre fundo
  escuro, medido diretamente contra WCAG). Uso correto: sublinhado de aba ativa, borda de
  estado `:active`, ícone selecionado, glow sutil atrás de um avatar em
  destaque. `secondary` é o tom mais claro, para hover.
- **`text` (hsl(210,50%,96%)):** quase-branco levemente azulado — texto
  corrido, títulos, ícones ativos.
- **`muted-text` (cinza 70%):** legendas, timestamps, texto secundário —
  papel equivalente ao "UNIVERSE"/badges pequenos do Alchemy.
- **`overlay`:** véu semitransparente sobre arte de fundo para garantir
  legibilidade de texto sobreposto (hero banners, modais flutuando sobre
  cena) — é o "vignette" que aparece em todo screenshot do Alchemy.
- **`border`:** bordas discretas de card/input — nunca a cor `primary`, que
  fica reservada para estado ativo/selecionado.
- **`ink` (#101217):** texto escuro usado *só* em cima de uma superfície
  clara — hoje, o único caso é o texto do botão CTA cheio (ver Components).
- **`danger` / `warning`:** já existiam como `messages.warning`/erro no
  tema; mantidos para banners de reconexão e avisos de conflito de sync.
  **Achado do lint** (`contrast-ratio`, ver `## Do's and Don'ts`): texto
  quase-branco sobre esses fundos mede 3.43:1 e 2.74:1 — abaixo do mínimo
  WCAG AA (4.5:1). Ação recomendada: usar `ink` (texto escuro) em vez de
  `text` sobre esses dois fundos, ou escurecer o próprio fundo — decisão
  pendente, não implementada nesta rodada.

## Typography

Wordmark "Artisan" em **Archivo Variable** (`wght 900 / wdth 125%`,
aproximando a referência Nominee-BlackExtended) — usar **só** na wordmark,
nunca em corpo de texto. Toda a UI usa **Archivo**, que já é a fonte
carregada no projeto.

Labels de navegação, nome de aba e badges de card seguem `label-caps`:
caixa alta, `letter-spacing` aberto, peso 700 — é o detalhe tipográfico mais
reconhecível do Alchemy ("MODULES", "UNIVERSE", "READY TO JOIN?") e do
Foundry/Twilight UI. Título de página usa `h1`; título de seção dentro de
uma página (ex.: "Mesas" na Home) usa `h2`. Texto corrido de card/descrição
usa `body-md`; metadados (data, dono, contagem) usam `body-sm` com
`muted-text`.

## Layout

- **Canvas primeiro:** o mapa/arte ocupa o máximo de área possível; UI de
  navegação é fina e, quando possível, só ícone (o rail lateral do
  Alchemy). O Artisan já segue isso na tela de jogo (`Game.tsx`): dois
  painéis (`NetworkedParty`, `NetworkedMapAndTokens`) ladeando o mapa, sem
  chrome extra.
- **Hero cinematográfico na Home:** em vez de uma lista de texto, a mesa em
  destaque (última acessada, ou a única existente) ganha uma faixa grande
  com a arte de capa da mesa, texto sobreposto com `overlay`, e um botão
  CTA — o padrão "Jump Back In" do Alchemy. Mesas restantes seguem em grid
  de cards abaixo, como já é hoje.
- **Espaçamento:** escala de 4px (`spacing.xs`…`xl`); `md` (16px) para
  espaçamento interno de componente, `lg` (24px) entre componentes, `xl`
  (48px) entre seções de página — mesma convenção que o resto do
  `theme-ui`/Artisan já usa implicitamente.
- **Abas com estado ativo por sublinhado**, não por fundo preenchido:
  sublinhado de 2px em `primary` sob o texto ativo, texto ativo em `text`
  pleno, texto inativo em `muted-text`. É o padrão "MODULES / GAMES /
  CHARACTERS" do Alchemy e evita introduzir uma cor de fundo nova para
  estado selecionado.

## Elevation & Depth

Sem sombras pesadas nem gradientes 3D (Fantasy Grounds Hearth e Twilight UI
fazem a mesma escolha, pelo mesmo motivo: textura/sombra em tema escuro
cansa a vista em sessões longas). Profundidade vem de **luminosidade**, não
de `box-shadow`:

1. `background` (#101217) — o chão.
2. `surface` (#15171C) — um degrau acima: cards, painéis, modais.
3. **Glow pontual**, não caixa de sombra: um halo suave em `primary` atrás
   de um elemento circular de destaque (avatar do personagem ativo, ícone
   de "pronto para entrar") — efeito visto no modal "READY TO JOIN?" do
   Alchemy. Usar com moderação: no máximo um elemento glowing por tela.
4. `overlay` some por cima de arte de fundo sempre que houver texto ou
   controles sobrepostos — nunca texto direto sobre imagem sem véu.

## Shapes

- `rounded.sm` (4px): inputs, botões outline, badges pequenos.
- `rounded.md` (8px): cards (mesa, cena, personagem).
- `rounded.lg` (16px): modais e painéis flutuantes.
- `rounded.pill` (9999px): **um único** botão de alta ênfase por tela — o
  equivalente ao "CREATE" do Alchemy. Reservar pílula para essa ação;
  usá-la em mais de um lugar na mesma tela dilui o sinal.

## Components

- **`button-cta`**: a única ação de alta ênfase visível por tela — fundo
  sólido em `text` (quase-branco), letra em `ink` (escura), formato pílula.
  É o "CREATE"/"JOIN GAME" do Alchemy: alto contraste against o fundo quase
  preto, sem depender da cor de marca para chamar atenção. Hover
  (`button-cta-hover`) troca o fundo para `secondary`, mantendo o texto
  escuro.
- **`button-outline`**: ação secundária — texto em `text`, sem fundo,
  borda sutil (`border`). Estado ativo/pressed (`button-outline-active`)
  troca só a cor do texto para `primary`, nunca o fundo — é o botão
  "primary" que já existe em `src/theme.ts`, sem mudança de comportamento,
  só de vocabulário. A mesma troca de cor (texto/borda para `primary`, sem
  fundo) também cobre um TOGGLE controlado por estado — não só `:hover`/
  `:active` do mouse — como os chips de escolha de magia/talento da ficha
  de personagem (`buttons.outlineActive` em `theme.ts`): selecionado usa
  `outlineActive`, não selecionado usa o `button-outline` comum.
- **`button-danger`**: mesma forma do `button-outline` (sem fundo, borda
  sutil), mas em `danger` — para uma ação destrutiva que não está dentro
  de um menu de contexto (ex.: "Apagar todo o conteúdo" em Settings).
  Reaproveita o token `danger` já usado em `banner-danger`/
  `menu-item-destructive`, nunca uma cor nova. theme.ts: `buttons.danger`.
- **`card-table`** / **`card-scene`**: superfície `surface`, cantos `md`,
  imagem de capa no topo (ocupando a largura toda, sem padding) e um
  rodapé com título (`body-md`) + metadado (`body-sm`/`muted-text`) —
  mesmo padrão dos cards de "Jump Back In" e das miniaturas de cena do
  Alchemy. Um badge `label-caps` no canto (papel do jogador, sistema, "GM")
  é opcional e fica sobre a imagem, nunca no rodapé de texto.
- **`modal-panel`**: fundo `surface`, cantos `lg`, usado para diálogos que
  flutuam sobre a cena ativa (ex.: `CreateTableModal`, `CharacterGateModal`)
  — combinar com `overlay` no fundo por trás do modal para manter o
  contraste com o que está atrás.
- **`tab`** / **`tab-active`**: as abas do painel direito da tela de jogo
  (Tokens / Monstros, `components/monster/RightPanel.tsx`) — a primeira
  aplicação real da regra de abas descrita em "Layout". Texto em
  `label-caps`, inativo em `muted-text`, ativo em `text` pleno com um
  sublinhado de 2px (`tab-active-underline`, em `primary`) e **fundo
  sempre transparente nos dois estados**. O sublinhado é modelado como
  componente de superfície própria porque o spec do design.md não tem
  sub-token de borda — mesma solução já usada por `card-border`.

## Do's and Don'ts

- **Do** usar `primary`/`secondary` só como destaque pontual: sublinhado,
  borda ativa, glow, ícone selecionado.
- **Do** manter um único `button-cta` por tela — é o que dá ao botão seu
  peso visual; dois botões-pílula competem entre si.
- **Do** cobrir toda arte de fundo com `overlay` antes de escrever texto
  por cima — sem isso a legibilidade varia com a imagem escolhida por cada
  mesa.
- **Don't** usar `primary`/`secondary` como cor de texto corrido ou de
  fundo de superfície grande — contraste insuficiente, motivo pelo qual a
  medição de contraste acima já rejeitou isso.
- **Don't** introduzir `box-shadow`/gradiente 3D para simular profundidade
  — a hierarquia visual vem da escala `background → surface`, não de
  sombra.
- **Don't** reintroduzir o roxo do tema antigo (`purple` em `theme.ts`
  ainda aponta para o dourado por compatibilidade com o Prism/código
  syntax highlight — não reverter isso).
