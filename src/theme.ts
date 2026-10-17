const colors = {
  background: "#101217",
  border: "hsla(210, 50%, 96%, 0.5)",
  danger: "#e5787f",
  gray: "hsl(0, 0%, 70%)",
  highlight: "hsl(30, 10%, 35%)",
  muted: "hsla(230, 20%, 0%, 20%)",
  overlay: "hsla(210, 15%, 8%, 80%)",
  primary: "#8B703D",
  purple: "#8B703D",
  secondary: "#B08D52",
  surface: "#15171C",
  text: "hsl(210, 50%, 96%)",
};

const fonts = {
  body: "'Archivo', system-ui, sans-serif",
  body2: "'Archivo', system-ui, sans-serif",
  display: "'Archivo', system-ui, sans-serif",
  heading: "'Archivo', system-ui, sans-serif",
  monospace: "Menlo, monospace",
  wordmark: "'Archivo Variable', 'Archivo', system-ui, sans-serif",
};

const focusless = { "&:focus": { outline: "none" } };
const fadedWhenDisabled = { "&:disabled": { opacity: 0.5 } };
const activeAccent = { "&:active": { color: "secondary" } };
const hoverPointer = { cursor: "pointer" };
const bodyFont = { fontFamily: "body" };

const disabledField = {
  backgroundColor: "muted",
  borderColor: "text",
  opacity: 0.5,
};

const transparentButton = {
  bg: "transparent",
  color: "text",
  ...bodyFont,
  ...focusless,
};

const outlineButton = {
  ...transparentButton,
  borderColor: "text",
  borderStyle: "solid",
  borderWidth: "1px",
  "&:active": { borderColor: "primary" },
  "&:disabled": { borderColor: "text", opacity: 0.5 },
  "&:hover": { borderColor: "highlight", ...hoverPointer },
};

// DESIGN.md-aligned context/dropdown menu row: icon + label, generous
// padding, hover highlight instead of a border/underline (reference: the
// rounded dark menu the user asked to match for right-click menus).
// `menuItemDestructive` below is the same row with red text/icon for
// actions like "Excluir" — never change the row's shape, only color.
const menuRow = {
  alignItems: "center",
  bg: "transparent",
  border: "none",
  borderRadius: "6px",
  color: "text",
  display: "flex",
  fontFamily: "body",
  fontSize: 1,
  fontWeight: "body",
  gap: "10px",
  px: 2,
  py: 2,
  textAlign: "left" as const,
  width: "100%",
  "& svg": { flexShrink: 0, height: "18px", width: "18px" },
  "&:disabled": { opacity: 0.5 },
  "&:focus": { outline: "none" },
  "&:hover": { bg: "rgba(255, 255, 255, 0.06)", ...hoverPointer },
};

const field = {
  "&:disabled": disabledField,
  "&:focus": { outlineColor: "primary" },
  fontFamily: "body2",
};

const theme = {
  breakpoints: ["12em", "24em", "40em", "56em", "64em"],
  buttons: {
    close: {
      ...focusless,
      "&:active": activeAccent["&:active"],
      "&:hover": { color: "primary", ...hoverPointer },
    },
    // DESIGN.md "Components" button-cta: the one high-emphasis action per
    // screen (Alchemy's "CREATE"/"JOIN GAME") — solid fill in `text`
    // (near-white), dark text, pill shape. Never more than one per screen.
    cta: {
      bg: "text",
      border: "none",
      borderRadius: "9999px",
      color: "background",
      fontFamily: "body",
      fontWeight: "heading",
      px: 4,
      "&:active": { bg: "primary" },
      "&:disabled": { opacity: 0.5 },
      "&:focus": { outline: "none" },
      "&:hover": { bg: "secondary", ...hoverPointer },
    },
    // DESIGN.md-aligned destructive action OUTSIDE a context menu (e.g.
    // Settings' "Apagar todo o conteúdo") — same `danger` token and same
    // hover tint as `menuItemDestructive`, but keeping the bordered
    // button-outline shape instead of a menu row.
    danger: {
      variant: "buttons.primary",
      borderColor: "danger",
      color: "danger",
      "&:hover": { bg: "rgba(229, 120, 127, 0.12)", borderColor: "danger", ...hoverPointer },
    },
    icon: {
      ...focusless,
      "&:active": activeAccent["&:active"],
      "&:disabled": { color: "text", opacity: 0.5 },
      "&:hover": { color: "primary", ...hoverPointer },
    },
    menuItem: menuRow,
    menuItemDestructive: {
      variant: "buttons.menuItem",
      color: "danger",
      "&:hover": { bg: "rgba(229, 120, 127, 0.12)", ...hoverPointer },
    },
    // DESIGN.md "Components" button-outline-active: a CONTROLLED selected
    // state (not just :active/:hover) for a toggle rendered as a button —
    // e.g. CharacterSheetModal's spell/feature-choice chips. Per spec,
    // selection changes ONLY the text/border colour to `primary`, never
    // the background.
    outlineActive: {
      variant: "buttons.primary",
      borderColor: "primary",
      color: "primary",
    },
    primary: outlineButton,
    secondary: {
      ...transparentButton,
      border: "none",
      "&:active": activeAccent["&:active"],
      "&:disabled": fadedWhenDisabled["&:disabled"],
      "&:hover": { color: "primary", ...hoverPointer },
    },
    // DESIGN.md "Layout": "Abas com estado ativo por sublinhado, não por
    // fundo preenchido" — 2px underline in `primary` under the active tab,
    // active label in full `text`, inactive in `gray` (muted-text). Never
    // give a tab a filled background: that would introduce a new
    // selected-state colour the spec deliberately avoids.
    tab: {
      variant: "text.labelCaps",
      bg: "transparent",
      border: "none",
      borderBottom: "2px solid transparent",
      borderRadius: 0,
      color: "gray",
      px: 2,
      py: 2,
      "&:focus": { outline: "none" },
      "&:hover": { color: "text", ...hoverPointer },
    },
    tabActive: {
      variant: "buttons.tab",
      borderBottomColor: "primary",
      color: "text",
    },
  },
  cards: {
    // A line/block of content inside a panel that ended up
    // TRANSPARENTE sobre a arte do mapa (a barra da Party). O fundo é
    // `overlay`, não `surface`: DESIGN.md define `overlay` exatamente como
    // "véu semitransparente sobre arte de fundo para garantir legibilidade
    // de texto sobreposto", e é a regra do "Do's and Don'ts" que proíbe
    // texto direto sobre imagem sem véu. `surface` é opaco e apagaria a
    // arte que o painel transparente existe para mostrar. Sem borda: o
    // contraste com a arte já separa o bloco, e uma hairline sobre imagem
    // variável lê como sujeira. DESIGN.md: `card-panel-item`.
    panelItem: { bg: "overlay", border: "none", borderRadius: "8px", padding: 0 },
    // DESIGN.md "Shapes"/"Components": card-table/card-scene — surface
    // fill, rounded corners inherited by children (TableCard's banner Box
    // already reads borderTopLeftRadius: "inherit"). No `overflow: hidden`
    // here on purpose — that clipped the 3-dot dropdown before (see git
    // log "fix: menu de 3 pontinhos da Mesa não abria").
    primary: {
      bg: "surface",
      border: "1px solid",
      borderColor: "rgba(255, 255, 255, 0.06)",
      borderRadius: "8px",
      padding: 0,
    },
  },
  colors,
  config: { useColorSchemeMediaQuery: false },
  fontSizes: [12, 14, 16, 20, 24, 32, 48, 64, 72],
  fontWeights: { body: 400, caption: 200, display: 400, heading: 700, wordmark: 900 },
  fonts,
  forms: {
    input: field,
    label: { fontWeight: 400 },
    slider: fadedWhenDisabled,
    textarea: field,
  },
  lineHeights: { body: 1.3, body2: 1.5, display: 1.1, heading: 1.25, wordmark: 1 },
  links: {
    footer: {
      variant: "text.caption",
      textDecoration: "underline",
      "&:active": { textDecorationColor: "#B08D52" },
      "&:hover": { cursor: "pointer", textDecorationColor: "#8B703D" },
    },
  },
  messages: {
    note: { backgroundColor: "#ca871e", borderLeftColor: "#ebd2ac" },
    warning: { backgroundColor: "#d65c64", borderLeftColor: "#ff939b" },
  },
  prism: {
    ".atrule,.attr-value,.keyword": { color: "primary" },
    ".comment": { fontStyle: "italic" },
    ".comment,.prolog,.doctype,.cdata,.punctuation,.operator,.entity,.url": { color: "gray" },
    ".property,.tag,.boolean,.number,.constant,.symbol,.deleted,.function,.class-name,.regex,.important,.variable": {
      color: "purple",
    },
    ".selector,.attr-name,.string,.char,.bultin,.inserted": { color: "secondary" },
  },
  styles: {
    Container: { maxWidth: 1024, p: 3 },
    a: {
      variant: "text.body2",
      color: "text",
      "&:active": { color: "secondary" },
      "&:hover": { color: "primary" },
    },
    code: { color: "secondary", fontFamily: "monospace", fontSize: 1 },
    h1: { variant: "text.display" },
    h2: { variant: "text.heading", fontSize: 5 },
    h3: { variant: "text.heading", fontSize: 4 },
    h4: { variant: "text.heading", fontSize: 3 },
    h5: { variant: "text.heading", fontSize: 2 },
    h6: { variant: "text.heading", fontSize: 1 },
    hr: { border: 0, borderBottom: "1px solid", borderColor: "muted" },
    img: { maxWidth: "100%" },
    inlineCode: { bg: "muted", color: "secondary", fontFamily: "monospace" },
    pre: {
      variant: "prism",
      bg: "muted",
      color: "text",
      fontFamily: "monospace",
      fontSize: 1,
      overflow: "auto",
      p: 3,
      code: { color: "inherit" },
    },
    progress: { backgroundColor: "overlay", color: "text" },
    root: { fontFamily: "body", fontWeight: "body", lineHeight: "body" },
  },
  text: {
    body2: { fontFamily: "body2", fontSize: 0, fontWeight: "body", lineHeight: "body2" },
    caption: { color: "gray", fontFamily: "body2", fontSize: 0, fontWeight: "caption" },
    display: {
      variant: "text.heading",
      fontFamily: "display",
      fontSize: [5, 6],
      fontWeight: "display",
      mt: 3,
    },
    heading: { fontFamily: "heading", fontSize: 1, fontWeight: "heading", lineHeight: "heading" },
    // DESIGN.md "Typography" label-caps: uppercase, open tracking, weight
    // 700 — navigation labels, tab names and card badges. The most
    // recognisable typographic detail of the reference UI; never used for
    // running text.
    labelCaps: {
      fontFamily: "heading",
      fontSize: 0,
      fontWeight: "heading",
      letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
    },
    // Archivo Variable's own wght/wdth axes stand in for the
    // retired Freigeist Black wordmark face — 900/125% is the exact
    // combination measured as closest to the Alchemy reference's
    // Nominee-BlackExtended (fontWeight above already requests 900; this
    // pushes width to the variable axis's max).
    wordmark: {
      fontFamily: "wordmark",
      fontSize: [6, 7],
      fontVariationSettings: "'wdth' 125",
      fontWeight: "wordmark",
      letterSpacing: "0.01em",
      lineHeight: "wordmark",
    },
  },
};

export default theme;
