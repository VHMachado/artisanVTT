import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Input, Label } from "theme-ui";
import Modal from "../components/Modal";
import type { RequestCloseEventHandler } from "../types/Events";

export type GroupNameEventHandler = (name: string) => void;
type GroupNameModalProps = { isOpen: boolean; onRequestClose: RequestCloseEventHandler; name: string; onSubmit: GroupNameEventHandler };

function GroupNameModal({ isOpen, name, onRequestClose, onSubmit }: GroupNameModalProps) {
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(name), [name]);

  return (
    <Modal isOpen={isOpen} onAfterOpen={() => inputRef.current?.focus()} onRequestClose={onRequestClose}>
      <Box as="form" onSubmit={(event: React.FormEvent<HTMLDivElement>) => { event.preventDefault(); onSubmit(draft); }}>
        <Label htmlFor="group-name" py={2}>Group Name</Label>
        <Input id="group-name" onChange={(event) => setDraft(event.target.value)} ref={inputRef} value={draft} />
        <Flex py={2}><Button sx={{ flexGrow: 1 }}>Save</Button></Flex>
      </Box>
    </Modal>
  );
}
export default GroupNameModal;
