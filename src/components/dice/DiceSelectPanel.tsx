import { Box, Flex, IconButton } from "theme-ui";

import D4Icon from "../../icons/D4Icon";
import D6Icon from "../../icons/D6Icon";
import D8Icon from "../../icons/D8Icon";
import D10Icon from "../../icons/D10Icon";
import D12Icon from "../../icons/D12Icon";
import D20Icon from "../../icons/D20Icon";
import D100Icon from "../../icons/D100Icon";
import ShareDiceOnIcon from "../../icons/ShareDiceOnIcon";
import ShareDiceOffIcon from "../../icons/ShareDiceOffIcon";

import type { DiceType } from "../../types/Dice";
import {
  DICE_TYPES,
  MAX_DICE_PER_TYPE,
} from "../../helpers/diceRoll";
import type { DiceCounts } from "../../helpers/diceRoll";

/** Quantos de cada tipo a rolagem pendente acumulou. */
export type PendingDiceCounts = DiceCounts;

/** Ordem de exibição, do menor para o maior — a mesma da referência
 * visual, e a ordem em que uma pessoa pensa em dados. O d100 vem por
 * último porque é o caso raro. */
export const DICE_ORDER = DICE_TYPES;

const DICE_ICONS: Record<DiceType, JSX.Element> = {
  d4: <D4Icon />,
  d6: <D6Icon />,
  d8: <D8Icon />,
  d10: <D10Icon />,
  d12: <D12Icon />,
  d20: <D20Icon />,
  d100: <D100Icon />,
};

/** Teto por tipo: evita que um clique acidental repetido jogue 400 meshes
 * de física na cena e derrube o framerate. Mantido como export local para
 * o dock não conhecer detalhes do helper. */
export const MAX_PER_TYPE = MAX_DICE_PER_TYPE;

export function totalPending(counts: PendingDiceCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + (n || 0), 0);
}

/** "2d6 + 1d20", para o rótulo/estado do botão central do dock. */
export function describePending(counts: PendingDiceCounts): string {
  return DICE_ORDER.filter((type) => (counts[type] || 0) > 0)
    .map((type) => `${counts[type]}${type}`)
    .join(" + ");
}

type DiceSelectPanelProps = {
  counts: PendingDiceCounts;
  onAdd: (type: DiceType) => void;
  onRemove: (type: DiceType) => void;
  shareDice: boolean;
  onShareDiceChange: (share: boolean) => void;
  /** Bloqueia a interação enquanto as malhas/texturas carregam. */
  loading: boolean;
};

/**
 * A fileira horizontal de dados com contagem por tipo, aberta pelo botão
 * central do dock.
 *
 * "Rolar"/"cancelar" deixaram de ser botões AQUI DENTRO — o botão
 * central do dock (MapDock.tsx) assume os dois papéis diretamente (vira um
 * "X" para fechar com a seleção vazia, uma seta para cima para arremessar
 * assim que algo é selecionado), como a referência visual pede. Este
 * painel passou a ser só a fileira de seleção: dados, estilo, compartilhar.
 *
 * A diferença de fundo em relação ao `DiceButtons` que ele substituiu não é
 * o layout (vertical → horizontal): é que a contagem aqui é uma **intenção
 * pendente**, não o estado da cena. O painel antigo derivava a contagem de
 * `diceRolls` porque cada clique JÁ criava um dado na bandeja; com
 * confirmação explícita ("rolar") os dados são somados antes de qualquer
 * malha existir, e "cancelar" não precisa desfazer nada.
 *
 * Clique esquerdo soma, clique direito subtrai — é a forma de corrigir um
 * clique a mais sem um segundo botão por dado, que deixaria a fileira com
 * 14 alvos em vez de 7.
 */
function DiceSelectPanel({
  counts,
  onAdd,
  onRemove,
  shareDice,
  onShareDiceChange,
  loading,
}: DiceSelectPanelProps) {
  return (
    <Flex
      // Mesmo tratamento dos outros menus flutuantes do app (surface,
      // sombra em vez de borda — ver ContextMenu.tsx), mas com o raio
      // elevado a "pílula" (DESIGN.md `rounded.pill`, 9999px): pedido
      // explícito do usuário a partir da referência visual, mais
      // arredondado que o raio-12px padrão de menu flutuante.
      bg="surface"
      sx={{
        alignItems: "center",
        gap: 1,
        borderRadius: "9999px",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
        pointerEvents: "all",
      }}
      p={2}
    >
      {DICE_ORDER.map((type) => {
        const count = counts[type] || 0;
        return (
          <IconButton
            key={type}
            title={`Adicionar ${type} (clique direito remove)`}
            aria-label={`Adicionar ${type}`}
            disabled={loading}
            onClick={() => onAdd(type)}
            onContextMenu={(event) => {
              event.preventDefault();
              onRemove(type);
            }}
            sx={{
              position: "relative",
              width: "40px",
              height: "40px",
              color: count > 0 ? "primary" : "text",
              "& svg": { width: "28px", height: "28px" },
            }}
          >
            {DICE_ICONS[type]}
            {count > 0 && (
              <Box
                sx={{
                  position: "absolute",
                  bottom: "-2px",
                  right: "-2px",
                  minWidth: "16px",
                  borderRadius: "9999px",
                  bg: "surface",
                  // O número é o único lugar onde o accent aparece como
                  // texto aqui, e é curto e grande o bastante para não
                  // repetir o problema de contraste medido para accent em
                  // texto corrido.
                  color: "primary",
                  fontWeight: "heading",
                  fontSize: "11px",
                  lineHeight: "16px",
                  textAlign: "center",
                }}
              >
                {count}
              </Box>
            )}
          </IconButton>
        );
      })}
      <IconButton
        aria-label={
          shareDice ? "Ocultar minhas rolagens" : "Compartilhar rolagens"
        }
        title={
          shareDice ? "Ocultar minhas rolagens" : "Compartilhar rolagens"
        }
        onClick={() => onShareDiceChange(!shareDice)}
        disabled={loading}
      >
        {shareDice ? <ShareDiceOnIcon /> : <ShareDiceOffIcon />}
      </IconButton>
    </Flex>
  );
}

export default DiceSelectPanel;
