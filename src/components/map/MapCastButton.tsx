import { Box, IconButton } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import { useIsSpectator } from "../../contexts/SpectatorContext";
import { openWirelessDisplayPicker } from "../../helpers/cast";
import { floatingButtonSx } from "../../helpers/floatingButtonSx";
import CastIcon from "../../icons/CastIcon";

/**
 * "Transmitir via rede" — abre o seletor nativo de tela sem fio do
 * Windows (Win+K), não um SDK de Chromecast, então cobre qualquer
 * receptor Miracast da rede (ver helpers/cast.ts).
 *
 * Vive SÓ na janela de Espectador. O cast transmite a visão de
 * espectador, então o botão pertence à janela que mostra essa visão —
 * antes ele ficava no rail do Mestre (MapControls), que é exatamente a
 * janela que não deve ser transmitida. `useIsSpectator()` é o gate, não
 * um teste de dono/conta: a janela de Espectador compartilha a conta do
 * Mestre (ver helpers/spectator.ts), então só uma checagem de dono
 * acertaria o alvo errado nas duas direções.
 */
function MapCastButton() {
  const isSpectator = useIsSpectator();
  const { addToast } = useToasts();

  async function handleClick() {
    try {
      await openWirelessDisplayPicker();
    } catch (error) {
      addToast(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir a transmissão por rede",
        { appearance: "error" }
      );
    }
  }

  if (!isSpectator) {
    return null;
  }

  return (
    <Box sx={{ position: "absolute", right: "16px", top: "16px", zIndex: 2 }}>
      <IconButton
        aria-label="Transmitir via rede (Miracast)"
        title="Transmitir via rede (Miracast)"
        onClick={handleClick}
        sx={floatingButtonSx(38, 22)}
      >
        <CastIcon />
      </IconButton>
    </Box>
  );
}

export default MapCastButton;
