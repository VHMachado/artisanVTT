import { Box, Label, Text } from "theme-ui";
import Modal from "../components/Modal";

const UPDATE_MESSAGE = "Please refresh your browser to update to the latest version.";
const DIALOG_WIDTH = { content: { maxWidth: "450px" } };

function ForceUpdateModal({ isOpen }: { isOpen: boolean }) {
  return <Modal isOpen={isOpen} allowClose={false} style={DIALOG_WIDTH}>
    <Box><Label py={2}>New Update Available</Label><Text as="p" mb={2} variant="caption">{UPDATE_MESSAGE}</Text></Box>
  </Modal>;
}
export default ForceUpdateModal;
