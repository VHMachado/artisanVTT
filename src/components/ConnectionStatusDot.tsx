import { Flex, Text } from "theme-ui";

import {
  BrokerConnectionStatus,
  useBrokerConnectionStatus,
} from "../hooks/useBrokerConnectionStatus";

const colorFor: Record<BrokerConnectionStatus, string> = {
  online: "#4caf50",
  "no-broker": "#e0b23c",
  offline: "#d65c64",
};

const labelFor: Record<BrokerConnectionStatus, string> = {
  online: "Conectado",
  "no-broker": "Online, servidor offline",
  offline: "Offline",
};

type ConnectionStatusDotProps = {
  /** Show the text label next to the dot. Off by default in tight spaces
   * like the Party sidebar (112px wide), where only the dot fits. */
  showLabel?: boolean;
};

/**
 * Connectivity indicator: green (broker reachable),
 * yellow (online but no broker), red (offline). Purely informational — the
 * app already works offline by construction (the local-first sync layer
 * adds the outbox this
 * will eventually also report a pending count for).
 *
 * Carries no outer margin of its own — callers place it (absolute-
 * positioned corner on Home/AuthGate, inline before a heading in Party)
 * and control their own spacing, so this never fights a parent's padding.
 */
function ConnectionStatusDot({ showLabel = true }: ConnectionStatusDotProps) {
  const status = useBrokerConnectionStatus();

  return (
    <Flex
      title={labelFor[status]}
      aria-label={labelFor[status]}
      sx={{
        alignItems: "center",
        // Alinhado ao AccountMenu (IconButton de 32px, ver
        // AccountMenu.tsx) — mesma altura de linha para que o centro
        // vertical do texto/bolinha coincida com o centro do ícone de
        // perfil no canto oposto, em vez de cada um assumir a própria
        // altura intrínseca do conteúdo.
        height: "32px",
      }}
    >
      <Flex
        sx={{
          width: "12px",
          height: "12px",
          borderRadius: "50%",
          backgroundColor: colorFor[status],
          flexShrink: 0,
        }}
      />
      {showLabel && (
        <Text as="span" ml={2} sx={{ fontSize: 0, color: "text" }}>
          {labelFor[status]}
        </Text>
      )}
    </Flex>
  );
}

export default ConnectionStatusDot;
