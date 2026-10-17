import ReconnectingIcon from "../../icons/ReconnectingIcon";
import Banner from "./Banner";
import { Flex } from "theme-ui";

const DOT_SX = { alignItems: "center", borderRadius: "28px", height: "28px", justifyContent: "center", width: "28px" };
const DESCRIPTION = "Disconnected. Attempting to reconnect...";

function neverClose() {
  // The reconnect indicator stays up until the socket recovers on its own.
}

function ReconnectBanner(props: { isOpen: boolean }) {
  const dot = <Flex aria-label={DESCRIPTION} bg="overlay" sx={DOT_SX} title={DESCRIPTION}><ReconnectingIcon /></Flex>;
  return <Banner allowClose={false} backgroundColor="transparent" isOpen={props.isOpen} onRequestClose={neverClose}>{dot}</Banner>;
}

export default ReconnectBanner;
