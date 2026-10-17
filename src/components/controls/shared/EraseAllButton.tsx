import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "theme-ui";

import EraseAllIcon from "../../../icons/EraseAllIcon";
import MapMenu from "../../map/MapMenu";

type EraseAllButtonProps = {
  onToolAction: (action: string) => void;
  disabled: boolean;
};

type MenuPosition = { left: number; top: number };

type ConfirmationProps = { disabled: boolean; onConfirm: () => void };

const confirmationStyle = { transform: "translateX(-50%)" };

function positionUnder(button: HTMLButtonElement): MenuPosition {
  const bounds = button.getBoundingClientRect();
  return { left: bounds.left + bounds.width / 2, top: bounds.bottom + 8 };
}

function useConfirmationPosition(ref: React.RefObject<HTMLButtonElement>, isOpen: boolean) {
  const [position, setPosition] = useState<MenuPosition>({ left: 0, top: 0 });

  useEffect(() => {
    const button = ref.current;
    if (!isOpen || !button) return;
    setPosition(positionUnder(button));
  }, [isOpen, ref]);

  return position;
}

function EraseConfirmation({ disabled, onConfirm }: ConfirmationProps) {
  return <Button disabled={disabled} onClick={onConfirm}>Erase All</Button>;
}

function EraseAllButton({ onToolAction, disabled }: EraseAllButtonProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const position = useConfirmationPosition(anchor, confirmationOpen);
  const dismiss = () => setConfirmationOpen(false);
  const executeErase = () => {
    dismiss();
    onToolAction("eraseAll");
  };

  return (
    <>
      <IconButton aria-label="Erase All" title="Erase All" onClick={() => setConfirmationOpen(true)} disabled={disabled} ref={anchor}>
        <EraseAllIcon />
      </IconButton>
      <MapMenu isOpen={confirmationOpen} onRequestClose={dismiss} {...position} style={confirmationStyle}>
        <EraseConfirmation disabled={disabled} onConfirm={executeErase} />
      </MapMenu>
    </>
  );
}

export default EraseAllButton;
