import { Flex, Text, Link } from "theme-ui";

import D4Icon from "../../icons/D4Icon";
import D6Icon from "../../icons/D6Icon";
import D8Icon from "../../icons/D8Icon";
import D10Icon from "../../icons/D10Icon";
import D12Icon from "../../icons/D12Icon";
import D20Icon from "../../icons/D20Icon";
import D100Icon from "../../icons/D100Icon";

import { getDiceRollTotal } from "../../helpers/dice";
import type { DiceRoll, DiceType } from "../../types/Dice";

const DICE_ICONS: Record<DiceType, JSX.Element> = {
  d4: <D4Icon />,
  d6: <D6Icon />,
  d8: <D8Icon />,
  d10: <D10Icon />,
  d12: <D12Icon />,
  d20: <D20Icon />,
  d100: <D100Icon />,
};

type DiceRollResultCardProps = {
  rolls: DiceRoll[];
  /** Apaga a rolagem da tela — só esconde este cartão, não desfaz nada na
   * cena (os dados já pararam de rolar; "limpar" aqui é puramente visual,
   * igual ao antigo botão "Clear Dice" da bandeja lateral). */
  onClear: () => void;
};

/**
 * Cartão de resultado que aparece sozinho assim que uma rolagem LOCAL
 * termina — referência visual "ROLL / dados / total /
 * DICE ROLL" pedida pelo usuário. Diferente de `DiceRolls.tsx` (a lista
 * compacta e expansível no roster da Party, que mostra o HISTÓRICO de
 * rolagens de um personagem): este cartão é efêmero, mostra só a última
 * rolagem local, e tem seu próprio "Limpar" para sumir da tela.
 */
function DiceRollResultCard({ rolls, onClear }: DiceRollResultCardProps) {
  const total = getDiceRollTotal(rolls);

  return (
    <Flex
      bg="surface"
      sx={{
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        borderRadius: "16px",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
        pointerEvents: "all",
        minWidth: "160px",
      }}
      px={4}
      py={3}
    >
      <Text variant="labelCaps" sx={{ color: "text" }}>
        Rolagem
      </Text>
      <Flex sx={{ alignItems: "center", gap: 2 }}>
        {rolls.map((roll, index) => (
          <Flex
            key={index}
            sx={{
              flexDirection: "column",
              alignItems: "center",
              color: "gray",
              "& svg": { width: "28px", height: "28px" },
            }}
          >
            {DICE_ICONS[roll.type]}
            <Text as="p" variant="caption">
              {roll.roll === "unknown" ? "" : roll.roll}
            </Text>
          </Flex>
        ))}
      </Flex>
      <Text
        as="p"
        variant="heading"
        sx={{ fontSize: 6, lineHeight: 1, color: "text" }}
      >
        {total}
      </Text>
      <Text variant="labelCaps" sx={{ color: "primary" }}>
        Resultado
      </Text>
      <Link
        href="#"
        variant="footer"
        onClick={(event) => {
          event.preventDefault();
          onClear();
        }}
        sx={{ mt: 1 }}
      >
        <Text variant="caption">Limpar</Text>
      </Link>
    </Flex>
  );
}

export default DiceRollResultCard;
