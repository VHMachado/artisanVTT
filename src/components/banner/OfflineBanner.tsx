import OfflineIcon from "../../icons/OfflineIcon";
import Banner from "./Banner";
import { Flex } from "theme-ui";

const DOT_SX = { alignItems: "center", borderRadius: "28px", height: "28px", justifyContent: "center", width: "28px" };
const DESCRIPTION = "Unable to connect to game, refresh to reconnect.";

function neverClose() {
  // The offline indicator stays up until connectivity returns on its own.
}

function OfflineBanner(props: { isOpen: boolean }) {
  const dot = <Flex aria-label={DESCRIPTION} bg="overlay" sx={DOT_SX} title={DESCRIPTION}><OfflineIcon /></Flex>;
  return <Banner allowClose={false} backgroundColor="transparent" isOpen={props.isOpen} onRequestClose={neverClose}>{dot}</Banner>;
}

export default OfflineBanner;
