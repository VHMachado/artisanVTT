import {
  Box as DialogBody,
  Button as DialogButton,
  Flex as ActionRow,
  Label as DialogTitle,
  Text as DialogDescription,
} from "theme-ui";

import Modal from "../components/Modal";

type ConfirmModalProps = {
  isOpen: boolean;
  onRequestClose: () => void;
  onConfirm: () => void;
  confirmText?: string;
  label?: string;
  description?: string;
};

const compactDialog = { content: { maxWidth: "300px" } };

function ConfirmModal({
  isOpen,
  onRequestClose: dismiss,
  onConfirm: confirm,
  confirmText: confirmLabel = "Yes",
  label: title = "Are you sure?",
  description: message = "",
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onRequestClose={dismiss} style={compactDialog}>
      <DialogBody>
        <DialogTitle py={2}>{title}</DialogTitle>
        {message ? (
          <DialogDescription as="p" mb={2} variant="caption">
            {message}
          </DialogDescription>
        ) : null}
        <ActionRow py={2}>
          <DialogButton sx={{ flexGrow: 1 }} m={1} ml={0} onClick={dismiss}>
            Cancel
          </DialogButton>
          <DialogButton sx={{ flexGrow: 1 }} m={1} mr={0} onClick={confirm}>
            {confirmLabel}
          </DialogButton>
        </ActionRow>
      </DialogBody>
    </Modal>
  );
}

export default ConfirmModal;
