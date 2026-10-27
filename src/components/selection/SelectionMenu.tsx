import { useEffect, useRef, useState } from "react";
import { Box, Flex, IconButton } from "theme-ui";
import { useToasts } from "react-toast-notifications";
import { v4 as uuid } from "uuid";

import { useKeyboard } from "../../contexts/KeyboardContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { useUserId } from "../../contexts/UserIdContext";
import { clipboardSupported } from "../../helpers/shared";
import { relocateClipboard, selectionClipboard } from "../../helpers/selectionClipboard";
import Vector2 from "../../helpers/Vector2";
import CopyIcon from "../../icons/CopyIcon";
import HideIcon from "../../icons/TokenHideIcon";
import LockIcon from "../../icons/TokenLockIcon";
import ShowIcon from "../../icons/TokenShowIcon";
import UnlockIcon from "../../icons/TokenUnlockIcon";
import shortcuts from "../../shortcuts";
import { RequestCloseEventHandler, SelectionItemsChangeEventHandler, SelectionItemsCreateEventHandler } from "../../types/Events";
import { getRelativePointerPosition } from "../../helpers/konva";
import { Map } from "../../types/Map";
import { MapState } from "../../types/MapState";
import { Selection } from "../../types/Select";
import { TokenState, TokenStates } from "../../types/TokenState";
import { isMapState } from "../../validators/MapState";
import { isSelection } from "../../validators/Selection";
import MapMenu from "../map/MapMenu";
import usePrevious from "../../hooks/usePrevious";

type SelectionMenuProps = Readonly<{
  map: Map | null;
  mapState: MapState | null;
  selection: Selection | null;
  isOpen: boolean;
  /** True while "Selecionar" is bound to a mouse button — scopes the
   * copy/paste keyboard shortcuts, nothing else. */
  active: boolean;
  onRequestClose: RequestCloseEventHandler;
  onSelectionItemsCreate: SelectionItemsCreateEventHandler;
  onSelectionItemsChange: SelectionItemsChangeEventHandler;
  onSelectionChange: React.Dispatch<React.SetStateAction<Selection | null>>;
}>;

type MenuPosition = { left: number; top: number };

function selectedItemsState(selection: Selection | null, mapState: MapState | null) {
  if (!selection || !mapState) return { visible: false, locked: false };
  return selection.items.reduce(
    (state, item) => ({
      visible: state.visible && mapState.tokens[item.id]?.visible,
      locked: state.locked && mapState.tokens[item.id]?.locked,
    }),
    { visible: true, locked: true }
  );
}

function useMenuAnchor(isOpen: boolean, selection: Selection | null, width: number) {
  const wasOpen = usePrevious(isOpen);
  const stageRef = useMapStage();
  const [position, setPosition] = useState<MenuPosition>({ left: 0, top: 0 });

  useEffect(() => {
    const image = stageRef.current?.findOne("#mapImage");
    const mapElement = document.querySelector(".map");
    if (!isOpen || wasOpen || !image || !mapElement) return;
    const point = selection
      ? Vector2.multiply(
          { x: Vector2.getBoundingBox(selection.type === "path" ? selection.data.points : [{ x: selection.data.x, y: selection.data.y }, { x: selection.data.x + selection.data.width, y: selection.data.y + selection.data.height }]).center.x + selection.x,
            y: Vector2.getBoundingBox(selection.type === "path" ? selection.data.points : [{ x: selection.data.x, y: selection.data.y }, { x: selection.data.x + selection.data.width, y: selection.data.y + selection.data.height }]).max.y + selection.y },
          { x: image.width(), y: image.height() }
        )
      : getRelativePointerPosition(image);
    if (!point) return;
    const absolute = image.getAbsoluteTransform().copy().point(point);
    const bounds = mapElement.getBoundingClientRect();
    setPosition({ left: bounds.left + absolute.x - width / 2, top: bounds.top + absolute.y + 12 });
  }, [isOpen, selection, stageRef, wasOpen, width]);

  return [position, setPosition] as const;
}

function successToast(addToast: (message: string) => void, action: string, tokens?: TokenStates) {
  const count = tokens ? Object.keys(tokens).length : 0;
  if (count) addToast(`${action} ${count} token${count === 1 ? "" : "s"}`);
}

function SelectionMenu({ isOpen, active, onRequestClose, selection, onSelectionChange, onSelectionItemsChange, onSelectionItemsCreate, map, mapState }: SelectionMenuProps) {
  const { addToast } = useToasts();
  const userId = useUserId();
  const stageRef = useMapStage();
  const width = 156;
  const [position, setPosition] = useMenuAnchor(isOpen, selection, width);
  const [states, setStates] = useState({ visible: false, locked: false });
  const fallbackClipboard = useRef("");

  useEffect(() => setStates(selectedItemsState(selection, mapState)), [isOpen, mapState, selection]);

  const updateSelectionItems = (change: Partial<TokenState>) => {
    if (!selection) return;
    onSelectionItemsChange(Object.fromEntries(selection.items.map((item) => [item.id, change])));
  };
  const toggle = (field: "visible" | "locked") => {
    const value = !states[field];
    updateSelectionItems({ [field]: value });
    setStates((current) => ({ ...current, [field]: value }));
  };
  const copy = async () => {
    const version = import.meta.env.VITE_VERSION;
    if (!version || !selection || !mapState) return;
    const payload = selectionClipboard(version, selection, mapState);
    const text = JSON.stringify(payload);
    if (await clipboardSupported()) await navigator.clipboard.writeText(text);
    else fallbackClipboard.current = text;
    successToast(addToast, "Copied", payload.data.tokens);
  };
  const paste = async () => {
    const version = import.meta.env.VITE_VERSION;
    if (!version || !mapState) return;
    try {
      const text = await clipboardSupported() ? await navigator.clipboard.readText() : fallbackClipboard.current;
      const parsed = JSON.parse(text);
      if (parsed.version !== version || !isMapState(parsed.data) || !isSelection(parsed.selection)) {
        addToast("Invalid data");
        return;
      }
      const image = stageRef.current?.findOne("#mapImage");
      const pointer = image && getRelativePointerPosition(image);
      if (!image || !pointer) return;
      const placement = relocateClipboard(parsed, Vector2.divide(pointer, { x: image.width(), y: image.height() }), uuid);
      onSelectionItemsCreate(placement.tokens);
      onSelectionChange(placement.selection);
      onRequestClose();
    } catch {
      addToast("Unable to paste");
    }
  };
  const clampToMap = (node: HTMLElement) => {
    const mapElement = document.querySelector(".map");
    if (!mapElement) return;
    const mapBounds = mapElement.getBoundingClientRect();
    const nodeBounds = node.getBoundingClientRect();
    setPosition((current) => ({ left: Math.min(mapBounds.right - nodeBounds.width, Math.max(mapBounds.left, current.left)), top: Math.min(mapBounds.bottom - nodeBounds.height, current.top) }));
  };

  useKeyboard((event) => {
    if (!active) return;
    if (selection && shortcuts.copy(event)) copy();
    if (shortcuts.paste(event)) paste();
  });

  const ownerActions = map?.owner === userId && selection ? (
    <>
      <IconButton title={states.visible ? "Hide Items" : "Show Items"} aria-label={states.visible ? "Hide Items" : "Show Items"} onClick={() => toggle("visible")}>{states.visible ? <ShowIcon /> : <HideIcon />}</IconButton>
      <IconButton title={states.locked ? "Unlock Items" : "Lock Items"} aria-label={states.locked ? "Unlock Items" : "Lock Items"} onClick={() => toggle("locked")}>{states.locked ? <LockIcon /> : <UnlockIcon />}</IconButton>
    </>
  ) : null;

  // Nothing to show without a selection. The menu used to ALSO pop up
  // with a lone "Colar" (clipboard) button on any short click on empty
  // canvas while "Selecionar" was bound — a floating button with no
  // counterpart anywhere else in the UI, which read as a glitch (it
  // appeared, for instance, right after clicking a token's edge cleared
  // the selection). Ctrl+V below is the paste path.
  if (!selection) {
    return null;
  }

  return (
    <MapMenu isOpen={isOpen} onRequestClose={onRequestClose} top={`${position.top}px`} left={`${position.left}px`} onModalContent={clampToMap}>
      <Box sx={{ width: `${width}px`, overflow: "hidden" }} p={1}>
        <Flex sx={{ alignItems: "center", justifyContent: "space-around" }}>
          {ownerActions}
          <IconButton title="Copy Items" aria-label="Copy Items" onClick={copy}><CopyIcon /></IconButton>
        </Flex>
      </Box>
    </MapMenu>
  );
}

export default SelectionMenu;
