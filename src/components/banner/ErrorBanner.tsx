import { Box, Text } from "theme-ui";
import Banner from "./Banner";
import type { RequestCloseEventHandler } from "../../types/Events";

function ErrorBanner(args: { error: Error | undefined; onRequestClose: RequestCloseEventHandler }) {
  const text = args.error ? `Error: ${args.error.message}` : "Error:";
  return <Banner isOpen={!!args.error} onRequestClose={args.onRequestClose}>
    <Box p={1}><Text as="p" variant="body2">{text}</Text></Box>
  </Banner>;
}
export default ErrorBanner;
