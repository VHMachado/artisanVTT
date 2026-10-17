import { MapToolId } from "../types/Map";

/**
 * Atribuição de ferramenta por botão do mouse, substituindo a barra de
 * ferramentas de seleção única do rail da direita (decisão do usuário:
 * os dois seletores "LEFT CLICK"/"RIGHT CLICK" SUBSTITUEM a barra, não
 * coexistem com ela).
 *
 * Só as 6 ferramentas realmente interativas do mapa são atribuíveis —
 * "map"/"undo"/"redo" (os outros membros de `MapToolId`) não fazem
 * sentido como reação a um botão de arraste. "none" é a opção explícita
 * de "nenhuma ferramenta neste botão", necessária para o botão direito
 * continuar livre para o menu de contexto do token (ver Token.tsx).
 */
export type AssignableMouseTool =
  | "move"
  | "select"
  | "fog"
  | "measure"
  | "pointer";

export type MouseButtonToolId = AssignableMouseTool | "none";

export type MouseButtonBindings = {
  left: MouseButtonToolId;
  right: MouseButtonToolId;
};

/**
 * Qual ferramenta reage a um evento de ARRASTE (react-use-gesture via
 * `MapInteractionEmitter`), dado o bitmask `buttons` que esses eventos já
 * carregam (0 = nenhum/touch, 1 = esquerdo, 2 = direito, 4 = meio — a
 * mesma convenção que `leftMouseButton`/`middleMouseButton`/
 * `rightMouseButton` em `MapInteractionContext.tsx` já assumem).
 *
 * O botão do meio nunca é atribuível (retorna `undefined`, nunca uma
 * ferramenta) — é a garantia que já existia antes desta funcionalidade
 * (`useStageInteraction`'s `buttons > 2` sempre arrasta o mapa) e que
 * continua valendo: "nenhuma combinação deixa a grid sem
 * forma de panning".
 */
export function toolForDragButtons(
  buttons: number,
  bindings: MouseButtonBindings
): MouseButtonToolId | undefined {
  if (buttons <= 1) {
    // 0 é touch/nenhum botão explícito — mesma convenção que
    // `leftMouseButton` já usa (`event.buttons === undefined` em touch),
    // tratado como o botão esquerdo para touch continuar funcionando
    // exatamente como antes desta fase existir.
    return bindings.left;
  }
  if (buttons === 2) {
    return bindings.right;
  }
  return undefined;
}

/**
 * O mesmo, para handlers de evento Konva (`onMouseDown`/`onContextMenu`/
 * `mapStage.on("click", ...)`) cujo `event.evt.button` é um único id
 * (0 = esquerdo, 1 = meio, 2 = direito; `undefined` em touch) — uma
 * codificação DIFERENTE do bitmask acima, não intercambiável.
 */
export function toolForKonvaButton(
  button: number | undefined,
  bindings: MouseButtonBindings
): MouseButtonToolId | undefined {
  if (button === undefined || button === 0) {
    return bindings.left;
  }
  if (button === 2) {
    return bindings.right;
  }
  return undefined;
}

/**
 * Para call sites que recebem UM evento de forma variável (o mesmo
 * handler serve tanto um `MapDragEvent` do `interactionEmitter` quanto um
 * evento Konva nativo de `onMouseUp`/`onTouchEnd`) — mesma distinção que
 * `leftMouseButton` já fazia via `event.evt` antes desta fase existir.
 */
export function toolForAnyButtonEvent(
  event: any,
  bindings: MouseButtonBindings
): MouseButtonToolId | undefined {
  if (event && event.evt) {
    // Konva event
    return toolForKonvaButton(event.evt.button, bindings);
  }
  // No fim de um gesto de arraste `buttons` já é 0, mas o PointerEvent
  // original ainda informa QUAL botão acabou de soltar em `button`. Sem
  // esta exceção, soltar um desenho/fog/laser associado ao direito seria
  // interpretado como esquerdo e deixaria a operação aberta.
  if (event?.buttons === 0 && event?.event) {
    return toolForKonvaButton(event.event.button, bindings);
  }
  // Drag event (tem `.buttons`) ou toque (sem bitmask — trata como o
  // botão esquerdo, mesma convenção de `leftMouseButton`).
  return toolForDragButtons(event?.buttons ?? 0, bindings);
}

/** Se `toolId` (a identidade de UMA ferramenta específica, ex. "fog")
 * está atribuída a QUALQUER um dos dois botões — usado por cada
 * componente de ferramenta para decidir sua própria prop `active`. */
export function isToolBound(
  toolId: AssignableMouseTool,
  bindings: MouseButtonBindings
): boolean {
  return bindings.left === toolId || bindings.right === toolId;
}

export const MOUSE_BUTTON_TOOL_ORDER: MouseButtonToolId[] = [
  "move",
  "select",
  "fog",
  "measure",
  "pointer",
  "none",
];

export const mouseButtonToolLabels: Record<MouseButtonToolId, string> = {
  move: "Mover",
  select: "Selecionar",
  fog: "Névoa",
  measure: "Medir",
  pointer: "Laser",
  none: "Nenhuma",
};

/** `MapToolId` correspondente, para os pontos que ainda indexam por ele
 * (ex. `toolsById` em `MapControls.tsx`, a tira de configurações da
 * ferramenta). `"none"` não tem correspondente — quem chama já precisa
 * tratar esse caso separadamente. */
export function toMapToolId(tool: AssignableMouseTool): MapToolId {
  return tool;
}
