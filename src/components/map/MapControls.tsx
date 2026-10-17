import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Box, Button, Flex, IconButton, Text } from "theme-ui";

import { useAccount } from "../../contexts/AccountContext";
import { useKeyboard } from "../../contexts/KeyboardContext";
import { useIsSpectator } from "../../contexts/SpectatorContext";
import { useUserId } from "../../contexts/UserIdContext";
import { floatingButtonSx } from "../../helpers/floatingButtonSx";
import { normalizeMapDarkness } from "../../helpers/light";
import {
  AssignableMouseTool,
  MOUSE_BUTTON_TOOL_ORDER,
  MouseButtonBindings,
  MouseButtonToolId,
  mouseButtonToolLabels,
} from "../../helpers/mouseBindings";
import { openSpectatorWindow } from "../../helpers/spectator";
import { MapActions } from "../../hooks/useMapActions";
import useSetting from "../../hooks/useSetting";
import EyeIcon from "../../icons/EyeIcon";
import FogToolIcon from "../../icons/FogToolIcon";
import FullScreenExitIcon from "../../icons/FullScreenExitIcon";
import FullScreenIcon from "../../icons/FullScreenIcon";
import LightIcon from "../../icons/LightIcon";
import MeasureToolIcon from "../../icons/MeasureToolIcon";
import MoveToolIcon from "../../icons/MoveToolIcon";
import PointerToolIcon from "../../icons/PointerToolIcon";
import SelectToolIcon from "../../icons/SelectToolIcon";
import SettingsIcon from "../../icons/SettingsIcon";
import DarknessModal from "../../modals/DarknessModal";
import shortcuts from "../../shortcuts";
import { MapChangeEventHandler, MapResetEventHandler } from "../../types/Events";
import { Map, MapTool, MapToolId } from "../../types/Map";
import { MapDarkness, MapState } from "../../types/MapState";
import { Settings } from "../../types/Settings";
import FogToolSettings from "../controls/FogToolSettings";
import PointerToolSettings from "../controls/PointerToolSettings";
import SelectToolSettings from "../controls/SelectToolSettings";
import Popover from "../Popover";
import RadioIconButton from "../RadioIconButton";

import SelectMapButton from "./SelectMapButton";

/**
 * Rail da direita — círculos de diâmetro
 * igual, fundo escuro translúcido PRÓPRIO por botão (em vez do `Box`
 * único com `overlay` que envolvia a coluna inteira), espaçamento
 * uniforme entre eles (o `gap` do `Flex` abaixo, não mais `<Divider>`
 * entre seções — a imagem separa por espaço, não por régua). A cor
 * ativa/hover continua vindo de `RadioIconButton` (`primary` quando
 * selecionado) — este objeto só cuida de forma e tamanho, mesclado por
 * cima pelo `sx` de `RadioIconButton`.
 *
 * `floatingButtonSx` (vidro fosco) é compartilhado com o dock inferior
 * (`MapDock.tsx`'s `sideButtonSx`) — mesma linguagem visual para os dois
 * conjuntos de botões circulares que flutuam sobre o mapa.
 */
const railButtonSx = floatingButtonSx(38, 22);

type ToolSettingsKey = "fog" | "pointer" | "select";

interface ToolSpec {
  id: string;
  icon: React.ReactNode;
  title: string;
  SettingsComponent?: MapTool["SettingsComponent"];
}

const TOOL_SPECS: ToolSpec[] = [
  { id: "move", icon: <MoveToolIcon />, title: "Move Tool (W)" },
  { id: "select", icon: <SelectToolIcon />, title: "Select Tool (S)", SettingsComponent: SelectToolSettings },
  { id: "fog", icon: <FogToolIcon />, title: "Fog Tool (F)", SettingsComponent: FogToolSettings },
  { id: "measure", icon: <MeasureToolIcon />, title: "Measure Tool (M)" },
  { id: "pointer", icon: <PointerToolIcon />, title: "Pointer Tool (Q)", SettingsComponent: PointerToolSettings },
];

function buildToolCatalog(): Record<string, MapTool> {
  return Object.fromEntries(TOOL_SPECS.map((spec) => [spec.id, spec as unknown as MapTool]));
}

interface MapControlsProps {
  onMapChange: MapChangeEventHandler;
  onMapReset: MapResetEventHandler;
  map: Map | null;
  mapState: MapState | null;
  mapActions: MapActions;
  allowMapChange: boolean;
  bindings: MouseButtonBindings;
  onBindingsChange: (bindings: MouseButtonBindings) => void;
  /** Ferramenta usada mais recentemente: escolhe qual faixa de configurações
   * aparece enquanto os dois bindings seguem ativos simultaneamente. */
  settingsToolId: AssignableMouseTool;
  onSettingsToolChange: (tool: AssignableMouseTool) => void;
  toolSettings: Settings;
  onToolSettingChange: (change: Partial<Settings>) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** True while this client is the current map's owner (already
   * accounts for the Espectador window never being one, see Map.tsx). */
  isMapOwner: boolean;
  /** The Mesa being played — the eye button opens the Espectador viewer
   * for this specific Mesa (helpers/spectator.ts). */
  gameId: string;
  /** Toggles/adjusts the map's darkness (lives in mapState, see
   * types/MapState.ts) — the Escuridão tool's settings strip calls it. */
  onMapDarknessChange: (darkness: MapDarkness) => void;
}

function computeDisabledControls(
  map: Map | null,
  mapState: MapState | null,
  mapActions: MapActions,
  allowMapChange: boolean,
  userId: string | undefined,
  isSpectator: boolean
): MapToolId[] {
  const isOwner = map && map.owner === userId && !isSpectator;
  const allowFogDrawing = isOwner || mapState?.editFlags.includes("fog");
  const disabled: MapToolId[] = [];

  // The Espectador window can't do ANYTHING on the map —
  // move tokens, draw, place fog, or even switch the active map —
  // so every tool is disabled outright rather than threading the
  // read-only flag through each tool's own individual permission check.
  if (isSpectator || !allowMapChange) {
    disabled.push("map");
  }
  if (!map || isSpectator) {
    disabled.push("move", "measure", "pointer", "select");
  }
  if (!map || !allowFogDrawing || isSpectator) {
    disabled.push("fog");
  }
  if (!map || mapActions.actionIndex < 0 || isSpectator) {
    disabled.push("undo");
  }
  const isAtLatestAction = mapActions.actionIndex === mapActions.actions.length - 1;
  if (!map || isAtLatestAction || isSpectator) {
    disabled.push("redo");
  }
  return disabled;
}

function MapContols(props: MapControlsProps) {
  const {
    onMapChange,
    onMapReset,
    map,
    mapState,
    mapActions,
    allowMapChange,
    bindings,
    onBindingsChange,
    settingsToolId,
    onSettingsToolChange,
    toolSettings,
    onToolSettingChange,
    onUndo,
    onRedo,
    isMapOwner,
    gameId,
    onMapDarknessChange,
  } = props;

  const [fullScreen, setFullScreen] = useSetting("map.fullScreen");
  // O modal de configuração da escuridão (intensidade + oclusão). O
  // liga/desliga continua sendo um botão de toggle próprio na barra,
  // porque é o que se aperta no meio da sessão.
  const [isDarknessModalOpen, setIsDarknessModalOpen] = useState(false);
  const darknessButtonRef = useRef<HTMLButtonElement>(null);
  const darkness = normalizeMapDarkness(mapState?.darkness);

  const userId = useUserId();
  const isSpectator = useIsSpectator();
  const { session } = useAccount();

  const disabledControls = useMemo(
    () => computeDisabledControls(map, mapState, mapActions, allowMapChange, userId, isSpectator),
    [map, mapState, mapActions, allowMapChange, userId, isSpectator]
  );

  const [isLeftPickerOpen, setIsLeftPickerOpen] = useState(false);
  const [isRightPickerOpen, setIsRightPickerOpen] = useState(false);
  const leftPickerRef = useRef<HTMLButtonElement>(null);
  const rightPickerRef = useRef<HTMLButtonElement>(null);
  // Qual botão (esquerdo/direito) está com o mouse
  // em cima AGORA — hover mostra a faixa de configurações DAQUELE botão
  // mesmo que ele não seja o "dono" global (`settingsOwnerButton`
  // abaixo), pedido explícito do usuário ("hover acima do botão do
  // mouse direito também deve mostrar essas opções"). Uma vez fixado
  // por hover, a faixa PERMANECE visível mesmo depois do mouse saltar
  // para fora do botão — só desaparece quando o usuário realmente clica
  // no mapa (ver o listener de "pointerdown" abaixo), não ao simples
  // `onMouseLeave`.
  const [hoveredButton, setHoveredButton] = useState<keyof MouseButtonBindings | null>(null);

  // "Até que o outro clique seja realizado": um clique genuíno no MAPA
  // (identificado pelo elemento `<canvas>` do Konva, o mesmo critério
  // que `MapInteraction.tsx` usa para distinguir "é realmente o mapa" de
  // "é um botão da UI") desfixa o hover e devolve a decisão de qual
  // faixa mostrar para `settingsOwnerButton`. Clicar nos PRÓPRIOS botões
  // do rail (abrir o seletor de ferramentas, por exemplo) não conta como
  // esse clique — o target ali é um `<button>`, não o canvas.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const isCanvasClick = (event.target as HTMLElement | null)?.tagName === "CANVAS";
      if (isCanvasClick) setHoveredButton(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const disabledSettings: Partial<Record<ToolSettingsKey, string[]>> = {};

  // Qual botão (esquerdo/direito) é o "dono" da
  // faixa de configurações quando os dois estão atribuídos à MESMA
  // ferramenta — sem isto, `settingsToolId === tool` seria verdade para
  // os dois botões simultaneamente e a faixa apareceria duplicada, uma
  // vez embaixo de cada botão. Critério: o botão direito só é o dono se
  // ELE especificamente carrega a ferramenta atual E o esquerdo não
  // carrega a mesma — em qualquer outro caso (incluindo ambos iguais) o
  // esquerdo vence, uma escolha arbitrária mas determinística.
  const rightOwnsSettings = bindings.right === settingsToolId && bindings.left !== settingsToolId;
  const settingsOwnerButton: keyof MouseButtonBindings = rightOwnsSettings ? "right" : "left";

  const toolsById = useMemo(buildToolCatalog, []);

  function getMouseToolIcon(tool: MouseButtonToolId) {
    if (tool === "none") {
      return <Text sx={{ fontSize: 2, lineHeight: 1 }}>—</Text>;
    }
    return toolsById[tool].icon;
  }

  function updateBinding(button: keyof MouseButtonBindings, tool: MouseButtonToolId) {
    onBindingsChange({ ...bindings, [button]: tool });
    if (tool !== "none") {
      onSettingsToolChange(tool);
    }
    const closePicker = button === "left" ? setIsLeftPickerOpen : setIsRightPickerOpen;
    closePicker(false);
  }

  /** O componente de configuração da ferramenta atualmente atribuída a
   * ESTE botão especificamente (não a `settingsToolId` global) — hover
   * precisa mostrar a faixa do botão sob o mouse mesmo quando o outro
   * botão é quem está "ativo" no momento. */
  function getButtonSettingsComponent(tool: MouseButtonToolId) {
    return tool === "none" ? undefined : toolsById[tool]?.SettingsComponent;
  }

  function bindingPicker(
    button: keyof MouseButtonBindings,
    label: string,
    anchorRef: React.RefObject<HTMLButtonElement>,
    open: boolean,
    setOpen: React.Dispatch<React.SetStateAction<boolean>>
  ) {
    const tool = bindings[button];
    const SettingsComponent = getButtonSettingsComponent(tool);
    // A faixa aparece ao passar o mouse OU quando
    // este botão é o "dono" global da ferramenta ativa no momento
    // (clique/arraste no mapa, ver MapInteraction.tsx) — nunca os dois
    // botões ao mesmo tempo quando ambos carregam a mesma ferramenta
    // (ver `settingsOwnerButton`).
    const isHoveredOrOwner =
      hoveredButton === button || (tool === settingsToolId && settingsOwnerButton === button);
    const showSettings = Boolean(SettingsComponent) && isHoveredOrOwner;

    return (
      <Fragment key={button}>
        {/* Botão + faixa de configurações
            compartilham o MESMO fundo "vidro fosco" (imagem de
            referência: dois botões no mesmo fundo arredondado), em vez
            do botão flutuar sozinho e a faixa abrir num popover
            separado à esquerda. O raio igual a metade do diâmetro do
            botão (railButtonSx é 38px) mantém o efeito "cápsula"
            mesmo quando a faixa expande para baixo. */}
        <Box
          onMouseEnter={() => setHoveredButton(button)}
          sx={{
            alignItems: "center",
            backdropFilter: "blur(8px)",
            backgroundColor: "overlay",
            borderRadius: "19px",
            display: "flex",
            flexDirection: "column",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          <IconButton
            ref={anchorRef}
            aria-label={`${label}: ${mouseButtonToolLabels[tool]}`}
            title={`${label}: ${mouseButtonToolLabels[tool]}`}
            onClick={() => setOpen((value) => !value)}
            sx={{
              color: tool === "none" ? "muted" : "text",
              height: "38px",
              position: "relative",
              width: "38px",
              "& svg": { height: "22px", width: "22px" },
              "&::after": {
                backgroundColor: "primary",
                borderRadius: "50%",
                bottom: "-2px",
                color: "background",
                // "E"/"D" (Esquerda/Direita) em vez de
                // "L"/"R" (Left/Right) — pedido explícito do usuário para
                // manter tudo em português, igual já vale para o rótulo.
                content: `"${button === "left" ? "E" : "D"}"`,
                fontSize: "9px",
                fontWeight: "bold",
                height: "14px",
                lineHeight: "14px",
                position: "absolute",
                right: "-2px",
                width: "14px",
              },
            }}
          >
            {getMouseToolIcon(tool)}
          </IconButton>
          {showSettings && SettingsComponent && (
            <Box p={1}>
              <SettingsComponent
                settings={toolSettings[tool as ToolSettingsKey]}
                onSettingChange={(change: Partial<Settings[ToolSettingsKey]>) =>
                  onToolSettingChange({
                    [tool]: { ...toolSettings[tool as ToolSettingsKey], ...change },
                  })
                }
                disabledActions={disabledSettings[tool as ToolSettingsKey]}
              />
            </Box>
          )}
        </Box>
        {open && (
          // O seletor de ferramentas (escolher QUAL
          // ferramenta vai neste botão) continua um popover flutuante à
          // esquerda — diferente da faixa de configurações acima, que
          // agora é inline/"grudada". Os dois convivem: clicar abre o
          // seletor, passar o mouse mostra a faixa.
          <Popover anchorRef={anchorRef} onRequestClose={() => setOpen(false)} side="left" variant="glass">
            <Box p={2} sx={{ minWidth: "176px" }}>
              <Text as="div" sx={{ color: "muted", fontSize: 0, pb: 1, px: 2 }}>
                {label}
              </Text>
              {MOUSE_BUTTON_TOOL_ORDER.map((option) => (
                <Button
                  key={option}
                  variant="menuItem"
                  disabled={option !== "none" && disabledControls.includes(option)}
                  onClick={() => updateBinding(button, option)}
                  sx={{
                    color: tool === option ? "primary" : undefined,
                    justifyContent: "flex-start",
                    width: "100%",
                  }}
                >
                  {getMouseToolIcon(option)}
                  <Text as="span" ml={2}>
                    {mouseButtonToolLabels[option]}
                  </Text>
                </Button>
              ))}
            </Box>
          </Popover>
        )}
      </Fragment>
    );
  }

  const sections: Array<{ id: string; component: React.ReactNode }> = [
    {
      id: "map",
      component: (
        <SelectMapButton
          onMapChange={onMapChange}
          onMapReset={onMapReset}
          currentMap={map}
          currentMapState={mapState}
          disabled={disabledControls.includes("map")}
          sx={railButtonSx}
        />
      ),
    },
    {
      id: "bindings",
      component: (
        <>
          {bindingPicker("left", "Clique Esquerdo", leftPickerRef, isLeftPickerOpen, setIsLeftPickerOpen)}
          {bindingPicker("right", "Clique Direito", rightPickerRef, isRightPickerOpen, setIsRightPickerOpen)}
        </>
      ),
    },
  ];

  if (isMapOwner) {
    sections.push({
      id: "darkness",
      component: (
        <>
          {/* GM-only, and deliberately NOT one of the radio
              tools above: darkness has nothing to draw on the canvas, so
              selecting it as a tool would pointlessly take the GM out of
              move mode. A plain toggle button whose "on" state mirrors
              the live mapState. No intensity to adjust anymore — darkness
              is always 100% opaque where there's no light, so the
              settings button/modal that used to sit
              beside this was removed. */}
          <RadioIconButton
            title={
              darkness.enabled
                ? "Escuridão ativa — clique para acender as luzes"
                : "Escuridão desligada — clique para apagar as luzes"
            }
            isSelected={darkness.enabled}
            onClick={() => onMapDarknessChange({ ...darkness, enabled: !darkness.enabled })}
            sx={railButtonSx}
          >
            <LightIcon />
          </RadioIconButton>
          {/* Configuração da escuridão: intensidade e oclusão por paredes
              vivem no modal, não como botões próprios — são ajuste de
              mapa, não ação de sessão, e três botões lado a lado para uma
              única feature estava pesado. Só aparece com a escuridão
              acesa: nada ali dentro significa algo com ela apagada, e um
              botão que abre um modal inerte lê como defeito. */}
          {darkness.enabled && (
            <IconButton
              ref={darknessButtonRef}
              aria-label="Configurar escuridão"
              title="Configurar escuridão"
              onClick={() => setIsDarknessModalOpen((open) => !open)}
              sx={railButtonSx}
            >
              <SettingsIcon />
            </IconButton>
          )}
        </>
      ),
    });
    sections.push({
      id: "spectator",
      component: (
        <IconButton
          aria-label="Abrir Espectador"
          title="Abrir Espectador"
          onClick={() => openSpectatorWindow(gameId, session)}
          sx={railButtonSx}
        >
          <EyeIcon />
        </IconButton>
      ),
    });
  }

  let controls = null;
  if (sections.length === 1 && sections[0].id === "map") {
    // A própria SelectMapButton já carrega o círculo (railButtonSx
    // via sx), então o wrapper não precisa mais do próprio `overlay` —
    // duplicaria o fundo translúcido.
    controls = <Box m={2}>{sections[0].component}</Box>;
  } else if (sections.length > 0) {
    controls = (
      <Flex sx={{ alignItems: "center", flexDirection: "column", gap: 2 }}>
        {sections.map((section) => (
          <Fragment key={section.id}>{section.component}</Fragment>
        ))}
      </Flex>
    );
  }

  function selectLeftTool(tool: AssignableMouseTool) {
    onBindingsChange({ ...bindings, left: tool });
    onSettingsToolChange(tool);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (shortcuts.moveTool(event) && !disabledControls.includes("move")) {
      selectLeftTool("move");
    }
    if (shortcuts.selectTool(event) && !disabledControls.includes("select")) {
      selectLeftTool("select");
    }
    if (shortcuts.fogTool(event) && !disabledControls.includes("fog")) {
      selectLeftTool("fog");
    }
    if (shortcuts.measureTool(event) && !disabledControls.includes("measure")) {
      selectLeftTool("measure");
    }
    if (shortcuts.pointerTool(event) && !disabledControls.includes("pointer")) {
      selectLeftTool("pointer");
    }
    // Darkness isn't a tool (nothing to draw), so its shortcut
    // toggles the lights directly instead of selecting anything. GM-only,
    // same gate the button itself uses.
    if (shortcuts.darknessToggle(event) && isMapOwner) {
      onMapDarknessChange({ ...darkness, enabled: !darkness.enabled });
    }
    if (shortcuts.redo(event) && !disabledControls.includes("redo")) {
      onRedo();
    }
    if (shortcuts.undo(event) && !disabledControls.includes("undo")) {
      onUndo();
    }
  }

  useKeyboard(handleKeyDown);

  // The Espectador window has no use for any of these controls
  // — every tool is already force-disabled for it above and it can't
  // change the map either, so the whole panel (plus its full-screen
  // button) is hidden rather than shown fully greyed out. Placed after
  // all hooks above so their call order never changes between renders.
  if (isSpectator) {
    return null;
  }

  return (
    <>
      <Flex sx={{ alignItems: "center", flexDirection: "column", position: "absolute", right: "16px", top: "16px" }}>
        {controls}
      </Flex>
      <Box
        m={2}
        sx={{ backgroundColor: "overlay", borderRadius: "50%", bottom: 0, position: "absolute", right: "16px" }}
      >
        <IconButton
          onClick={() => setFullScreen(!fullScreen)}
          aria-label={fullScreen ? "Exit Full Screen" : "Enter Full Screen"}
          title={fullScreen ? "Exit Full Screen" : "Enter Full Screen"}
        >
          {fullScreen ? <FullScreenExitIcon /> : <FullScreenIcon />}
        </IconButton>
      </Box>
      {isDarknessModalOpen && darkness.enabled && (
        <Popover anchorRef={darknessButtonRef} onRequestClose={() => setIsDarknessModalOpen(false)} side="left">
          <DarknessModal darkness={mapState?.darkness} onChange={onMapDarknessChange} />
        </Popover>
      )}
    </>
  );
}

export default MapContols;
