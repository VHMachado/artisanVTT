import { Flex } from "theme-ui";

import BackButton from "../BackButton";

import useSetting from "../../hooks/useSetting";

/**
 * "Voltar para a Home", flutuando no canto superior esquerdo da área do
 * mapa.
 *
 * Este botão morava dentro de `DiceTrayButton`, que foi removido quando os
 * dados passaram a ser abertos pelo dock inferior
 * (`components/map/MapDock.tsx`) — e era o
 * ÚNICO caminho de volta para a Home a partir de uma sessão, então sair
 * junto com a bandeja teria deixado o usuário preso na mesa.
 *
 * Mantém a regra de posicionamento que ele já tinha ali: encostado na
 * borda direita da barra da Party quando ela está visível, e na borda da
 * janela em tela cheia (quando a barra não é renderizada). Por isso
 * precisa saber a largura da barra, e não só `left: 0`.
 */
function MapBackButton() {
  const [fullScreen] = useSetting<boolean>("map.fullScreen");
  const [partyWidth] = useSetting<number>("map.partyWidth");

  return (
    <Flex
      sx={{
        position: "absolute",
        top: 0,
        left: fullScreen ? "0" : `${partyWidth}px`,
        pointerEvents: "none",
        zIndex: 2,
      }}
      ml={1}
    >
      <BackButton
        sx={{
          display: "block",
          backgroundColor: "overlay",
          borderRadius: "50%",
          pointerEvents: "all",
        }}
        m={2}
      />
    </Flex>
  );
}

export default MapBackButton;
