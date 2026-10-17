import { useEffect, useState } from "react";
import { Box, Button, Checkbox, Flex, Input, Label, Text } from "theme-ui";

import Modal from "../components/Modal";
import RadioIconButton from "../components/RadioIconButton";

import LightCircleIcon from "../icons/LightCircleIcon";
import LightConeIcon from "../icons/LightConeIcon";

import {
  maxLightAngle,
  maxLightRadius,
  minLightAngle,
  minLightRadius,
  normalizeTokenLight,
} from "../helpers/light";

import { RequestCloseEventHandler } from "../types/Events";
import { TokenLight, TokenLightShape } from "../types/TokenState";

type TokenLightModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  /** The token's current light, if it has one. */
  light?: TokenLight;
  /** Persists the edited light, or removes it entirely (undefined). */
  onChange: (light: TokenLight | undefined) => void;
  /** The token's name, shown so a GM editing several lights in a row can
   * tell which one this is. */
  tokenLabel?: string;
};

/**
 * Edits the light/vision a single token projects through the
 * map's darkness ("objetos que iluminam; token de
 * Jogador com raio de visão. Raio ajustável e formas diferentes (círculo,
 * cone)").
 *
 * Radii are expressed in GRID CELLS, which is how the table talks about
 * them ("sees 6 squares") and what types/TokenState.ts's TokenLight
 * stores — see helpers/light.ts for the conversion to pixels. The cone's
 * direction isn't editable here on purpose: it follows the token's own
 * rotation, which the drag-to-face feature already keeps current.
 *
 * Opened from the token's right-click menu (the repo's convention for
 * per-item actions — never a persistent icon button), whose owning hook
 * holds this modal's open state so closing the menu can't unmount it
 * mid-open.
 *
 * Numeric `<Input type="number">` fields replace the
 * original sliders for every number here — a slider's drag gesture makes
 * picking an EXACT square count fiddly, and the table cares about the
 * precise number ("tocha ilumina 6 quadrados"), not an approximate drag
 * position. The penumbra ("raio de penumbra") field was removed in the
 * same pass, also at the user's request — a light is now a hard-edged
 * circle/cone, no soft falloff.
 */
function numberFromInput(
  e: React.ChangeEvent<HTMLInputElement>,
  fallback: number
): number {
  // valueAsNumber is NaN while the field is transiently empty (the user
  // selected-all and is about to type a replacement, or cleared it and
  // tabbed away) — fall back to the previous value instead of writing
  // NaN into the draft and, on Save, onto the wire. Clamping into range
  // still happens on READ (normalizeTokenLight), not here, matching this
  // module's existing "clamp late" discipline.
  const parsed = e.target.valueAsNumber;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function TokenLightModal({
  isOpen,
  onRequestClose,
  light,
  onChange,
  tokenLabel,
}: TokenLightModalProps) {
  // Local draft, committed on "Salvar" — writing straight to onChange on
  // every keystroke would enqueue one versioned map_state update per
  // digit typed.
  const [draft, setDraft] = useState<TokenLight>(() =>
    normalizeTokenLight(light)
  );

  // Re-seed whenever the modal opens (or is pointed at another token), so
  // a reopen never shows the previous token's values.
  useEffect(() => {
    if (isOpen) {
      setDraft(normalizeTokenLight(light));
    }
  }, [isOpen, light]);

  const hasLight = light !== undefined;

  function handleSave() {
    onChange(draft);
    onRequestClose();
  }

  function handleRemove() {
    onChange(undefined);
    onRequestClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={{ content: { maxWidth: "320px", width: "100%" } }}
    >
      <Flex sx={{ flexDirection: "column" }}>
        <Text as="h2" variant="heading" mb={1}>
          Luz
        </Text>
        {tokenLabel && (
          <Text as="p" variant="caption" mb={2} sx={{ color: "gray" }}>
            {tokenLabel}
          </Text>
        )}

        <Label py={2}>
          <Checkbox
            checked={draft.enabled}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, enabled: e.target.checked }))
            }
          />
          Acesa
        </Label>

        <Box py={2}>
          <Text as="p" variant="body2" mb={1}>
            Formato
          </Text>
          <Flex>
            {(
              [
                { shape: "circle", title: "Círculo", icon: <LightCircleIcon /> },
                { shape: "cone", title: "Cone", icon: <LightConeIcon /> },
              ] as { shape: TokenLightShape; title: string; icon: JSX.Element }[]
            ).map((option) => (
              <RadioIconButton
                key={option.shape}
                title={option.title}
                isSelected={draft.shape === option.shape}
                onClick={() =>
                  setDraft((prev) => ({ ...prev, shape: option.shape }))
                }
              >
                {option.icon}
              </RadioIconButton>
            ))}
          </Flex>
        </Box>

        <Label py={2} sx={{ flexDirection: "column", alignItems: "stretch" }}>
          <Text as="span" variant="body2" mb={1}>
            Raio iluminado
          </Text>
          <Flex sx={{ alignItems: "center", gap: 2 }}>
            <Input
              type="number"
              step={1}
              min={minLightRadius}
              max={maxLightRadius}
              value={draft.radius}
              sx={{ width: "88px" }}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  radius: numberFromInput(e, prev.radius),
                }))
              }
            />
            <Text as="span" variant="caption" sx={{ color: "gray" }}>
              quadrados
            </Text>
          </Flex>
        </Label>

        {draft.shape === "cone" && (
          <Label py={2} sx={{ flexDirection: "column", alignItems: "stretch" }}>
            <Text as="span" variant="body2" mb={1}>
              Abertura do cone
            </Text>
            <Flex sx={{ alignItems: "center", gap: 2 }}>
              <Input
                type="number"
                step={5}
                min={minLightAngle}
                max={maxLightAngle}
                value={draft.angle}
                sx={{ width: "88px" }}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    angle: numberFromInput(e, prev.angle),
                  }))
                }
              />
              <Text as="span" variant="caption" sx={{ color: "gray" }}>
                °
              </Text>
            </Flex>
            <Text as="p" variant="caption" mt={1} sx={{ color: "gray" }}>
              O cone aponta para a frente do token.
            </Text>
          </Label>
        )}

        <Flex py={2}>
          <Button sx={{ flexGrow: 1 }} m={1} ml={0} onClick={onRequestClose}>
            Cancelar
          </Button>
          <Button sx={{ flexGrow: 1 }} m={1} mr={0} onClick={handleSave}>
            Salvar
          </Button>
        </Flex>
        {hasLight && (
          <Button variant="menuItemDestructive" onClick={handleRemove}>
            Excluir
          </Button>
        )}
      </Flex>
    </Modal>
  );
}

export default TokenLightModal;
