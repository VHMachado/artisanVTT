import { Box, Checkbox, Flex, Label, Text } from "theme-ui";

import Slider from "../components/Slider";

import { normalizeMapDarkness } from "../helpers/light";

import { MapDarkness } from "../types/MapState";

type DarknessModalProps = {
  darkness?: MapDarkness;
  onChange: (darkness: MapDarkness) => void;
};

/**
 * Configuração da escuridão do mapa: quão escura a área não iluminada
 * fica, e se a luz é bloqueada pelas paredes delimitadas pelo fog.
 *
 * O liga/desliga da escuridão NÃO vive aqui: é o botão de toggle ao lado
 * do botão que abre este modal, em MapControls, porque é o que o GM
 * aperta no meio da sessão ("a tocha apaga"). O que está aqui é o que se
 * ajusta uma vez por mapa e depois se esquece.
 *
 * Histórico, porque o arquivo já foi deletado uma vez: a intensidade foi
 * removida a pedido do usuário ("escuridão deve ser sempre 100%"), o
 * modal inteiro foi apagado junto, e depois a funcionalidade foi pedida
 * de volta. O default permanece 100% (o comportamento daquele pedido) —
 * só voltou a ser ajustável.
 *
 * A oclusão morava num segundo botão na barra do mapa e foi
 * movida para cá no mesmo pedido: é configuração de mapa como a
 * intensidade, não ação de sessão, e três botões lado a lado para uma
 * única feature estava pesado.
 *
 * Deixou de ser um `Modal` centralizado para virar o
 * conteúdo de um `Popover` ancorado no botão de configuração de
 * escuridão do rail da direita — ver `MapControls.tsx`. O botão de
 * liga/desliga continua fora, como sempre foi.
 *
 * Escreve direto a cada movimento do slider em vez de montar um draft:
 * diferente da luz de um token (TokenLightModal, onde os valores só
 * significam algo depois de confirmados), o GM precisa VER o mapa
 * escurecendo para escolher o valor. A mudança viaja pelo mesmo canal
 * map_state versionado e debounced de todo o resto, então arrastar o
 * slider não inunda a rede.
 */
function DarknessModal({
  darkness,
  onChange,
}: DarknessModalProps) {
  const current = normalizeMapDarkness(darkness);

  return (
    <Box sx={{ width: "280px", maxWidth: "calc(100vw - 24px)" }} p={3}>
      <Flex sx={{ flexDirection: "column" }}>
        <Text as="h2" variant="heading" mb={2}>
          Escuridão
        </Text>
        <Label py={2} sx={{ flexDirection: "column", alignItems: "stretch" }}>
          <Text as="span" variant="body2" mb={1}>
            Intensidade
          </Text>
          <Slider
            step={0.02}
            min={0}
            max={1}
            value={current.opacity ?? 1}
            onChange={(e) =>
              onChange({ ...current, opacity: parseFloat(e.target.value) })
            }
            labelFunc={(value: number) => `${Math.round(value * 100)}%`}
          />
        </Label>

        {/* Convenção do app para checkbox: <Label><Checkbox/>texto</Label>,
            checkbox primeiro e o texto como irmão simples. */}
        <Label py={2}>
          <Checkbox
            checked={current.occlusion !== false}
            onChange={(e) =>
              onChange({ ...current, occlusion: e.target.checked })
            }
          />
          Luz bloqueada pelas paredes
        </Label>
        <Text as="p" variant="caption" mb={2} sx={{ color: "gray" }}>
          As paredes são as bordas do fog desenhado por você. Desligue em
          mapas cujo fog não acompanha paredes.
        </Text>

        <Text as="p" variant="caption" mb={2} sx={{ color: "gray" }}>
          Tokens com luz configurada (clique direito no token → Luz)
          revelam a área ao redor deles.
        </Text>
      </Flex>
    </Box>
  );
}

export default DarknessModal;
