import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { useLocation, useParams } from "react-router-dom";
import { Flex } from "theme-ui";

import LoadingOverlay from "../components/LoadingOverlay";
import OfflineBanner from "../components/banner/OfflineBanner";
import ReconnectBanner from "../components/banner/ReconnectBanner";
import MapLoadingOverlay from "../components/map/MapLoadingOverlay";
import UpgradingLoadingOverlay from "../components/UpgradingLoadingOverlay";

import CharacterGateModal from "../modals/CharacterGateModal";
import ForceUpdateModal from "../modals/ForceUpdateModal";

import { useAccount } from "../contexts/AccountContext";
import { AssetURLsProvider, AssetsProvider } from "../contexts/AssetsContext";
import { DatabaseStatus, useDatabase } from "../contexts/DatabaseContext";
import { MapDataProvider } from "../contexts/MapDataContext";
import { MapLoadingProvider } from "../contexts/MapLoadingContext";
import { MapNpcsProvider } from "../contexts/MapNpcsContext";
import { MapStageProvider } from "../contexts/MapStageContext";
import { MapTokenCreateProvider } from "../contexts/MapTokenCreateContext";
import { PartyProvider } from "../contexts/PartyContext";
import { PlayerProvider } from "../contexts/PlayerContext";
import { SpectatorProvider } from "../contexts/SpectatorContext";

import { AccountSession, accountsAvailable } from "../helpers/account";
import { isSpectatorSearch } from "../helpers/spectator";
import { joinTable } from "../helpers/tablesApi";

import { useTable } from "../hooks/useTable";
import { useTableCharacters } from "../hooks/useTableCharacters";
import { useTablesSync } from "../hooks/useTablesSync";

import NetworkedMapAndTokens from "../network/NetworkedMapAndTokens";
import NetworkedParty from "../network/NetworkedParty";
import Session, { SessionStatus } from "../network/Session";

import { TokensStateCreateHandler } from "../types/Events";

type MapStageRef = React.RefObject<Konva.Stage | null>;
type MapTokenCreateRef = React.RefObject<TokensStateCreateHandler | null>;
type Characters = ReturnType<typeof useTableCharacters>;

/**
 * Tracks the session's broadcast "status" events in React state so the rest
 * of the component tree can react to them (banners, loading overlays, etc).
 */
function useSessionStatus(session: Session): SessionStatus | undefined {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>();

  useEffect(() => {
    const handleStatus = (status: SessionStatus) => setSessionStatus(status);
    session.on("status", handleStatus);
    return () => {
      session.off("status", handleStatus);
    };
  }, [session]);

  return sessionStatus;
}

function useJoinGameWhenReady(
  session: Session,
  gameId: string,
  sessionStatus: SessionStatus | undefined,
  databaseStatus: DatabaseStatus
) {
  // Join game
  useEffect(() => {
    if (
      sessionStatus === "ready" &&
      (databaseStatus === "loaded" || databaseStatus === "disabled")
    ) {
      session.joinGame(gameId);
    }
  }, [gameId, databaseStatus, session, sessionStatus]);
}

function useMesaMembershipRegistration(
  accountSession: AccountSession | undefined,
  gameId: string
) {
  // Register this account as a member of the Mesa (idempotent trigger:
  // idempotent, only decides role/capacity — never gates access, the
  // tailnet already does that). Best-effort: failure just
  // means role assignment is retried on a future visit, nothing blocks the
  // live session over it.
  useEffect(() => {
    if (accountSession) {
      joinTable(accountSession, gameId).catch(() => undefined);
    }
  }, [accountSession, gameId]);
}

function useSessionConnection(
  session: Session,
  isAccountLoaded: boolean,
  accountSession: AccountSession | undefined
) {
  useEffect(() => {
    async function connect() {
      await session.connect(accountSession?.token);
    }
    // Wait for the account session to finish loading (the WS
    // connection needs the bearer token up front, at upgrade time — see
    // Session.connect/httpapi.RegisterGameSocket — unlike the HTTP sync
    // routes there is no way to attach it after the fact). When this
    // build has no accounts configured at all (accountsAvailable false),
    // isLoaded still flips true immediately (AccountProvider's initial
    // loadAccountSession resolves to undefined), so this never hangs.
    if (isAccountLoaded) {
      connect();
    }

    return () => {
      session.disconnect();
    };
  }, [session, isAccountLoaded, accountSession]);
}

type CharacterGateState = {
  isOwner: boolean;
  ownsACharacter: boolean;
  unownedCharacters: Characters;
};

function useCharacterGateState(
  gameId: string,
  accountSession: AccountSession | undefined,
  isSpectator: boolean
): CharacterGateState {
  // A player who joins the session without a character is required to
  // adopt an existing one or create a new one (blocking modal, before
  // the table unlocks). Builds without accounts (accountsAvailable false)
  // never gate — there's no identity to own a character against. The
  // Mesa's owner (GM, "Mestre move e edita todos") is
  // never gated either — a GM opening their own Mesa has full rights
  // with or without a character, so blocking them behind this modal (with
  // no way to dismiss it, see CharacterGateModal's allowClose={false})
  // trapped the GM on their own table with no way back to Home.
  const table = useTable(gameId);
  const isOwner = Boolean(
    accountSession && table && table.ownerId === accountSession.accountId
  );
  const characters = useTableCharacters(gameId);
  const ownsACharacter =
    !accountsAvailable ||
    !accountSession ||
    isOwner ||
    isSpectator ||
    characters.some((c) => c.ownerAccountId === accountSession.accountId);
  const unownedCharacters = characters.filter(
    (c) => c.ownerAccountId === null
  );

  return { isOwner, ownsACharacter, unownedCharacters };
}

type GameProvidersProps = {
  session: Session;
  mapStageRef: MapStageRef;
  mapTokenCreateRef: MapTokenCreateRef;
  isSpectator: boolean;
  children: React.ReactNode;
};

/**
 * Nests every context provider the Mesa needs around its subtree. Pulled
 * out of Game() itself purely to break up one giant JSX return — the
 * nesting order and every provider here is unchanged from before.
 */
function GameProviders({
  session,
  mapStageRef,
  mapTokenCreateRef,
  isSpectator,
  children,
}: GameProvidersProps) {
  return (
    <AssetsProvider>
      <AssetURLsProvider>
        <MapLoadingProvider>
          <MapDataProvider>
            <MapNpcsProvider>
              <PlayerProvider session={session}>
                <PartyProvider session={session}>
                  <MapStageProvider value={mapStageRef}>
                    <MapTokenCreateProvider value={mapTokenCreateRef}>
                      <SpectatorProvider value={isSpectator}>
                        {children}
                      </SpectatorProvider>
                    </MapTokenCreateProvider>
                  </MapStageProvider>
                </PartyProvider>
              </PlayerProvider>
            </MapNpcsProvider>
          </MapDataProvider>
        </MapLoadingProvider>
      </AssetURLsProvider>
    </AssetsProvider>
  );
}

type GameBoardProps = {
  session: Session;
  gameId: string;
  isSpectator: boolean;
  mapTokenCreateRef: MapTokenCreateRef;
};

function GameBoard({
  session,
  gameId,
  isSpectator,
  mapTokenCreateRef,
}: GameBoardProps) {
  return (
    <Flex
      sx={{
        justifyContent: "space-between",
        flexGrow: 1,
        height: "100%",
        // A barra da Party passou a flutuar
        // SOBRE o mapa (`position: absolute`, ver
        // Party.tsx) em vez de ocupar largura aqui —
        // isto é o que a ancora. Sem o `relative` ela se
        // posicionaria contra o viewport e escaparia do
        // quadro do jogo.
        position: "relative",
      }}
    >
      {/* The Espectador window is a read-only
          map viewer — the Party sidebar (character
          creation/management, dice tray) has
          nothing it should be doing here, and hiding it
          entirely is simpler and safer than threading a
          read-only flag through every one of its
          actions, several of which (isOwner/canManage)
          would otherwise incorrectly read as "yes" since
          this window shares the Mestre's own account
          (see helpers/spectator.ts). */}
      {!isSpectator && <NetworkedParty session={session} gameId={gameId} />}
      <NetworkedMapAndTokens
        session={session}
        mapTokenCreateRef={mapTokenCreateRef}
        gameId={gameId}
      />
    </Flex>
  );
}

type GameOverlaysProps = {
  sessionStatus: SessionStatus | undefined;
  databaseStatus: DatabaseStatus;
  gameId: string;
  isSpectator: boolean;
  accountSession: AccountSession | undefined;
  gate: CharacterGateState;
};

function GameOverlays({
  sessionStatus,
  databaseStatus,
  gameId,
  isSpectator,
  accountSession,
  gate,
}: GameOverlaysProps) {
  return (
    <>
      <OfflineBanner isOpen={sessionStatus === "offline"} />
      <ReconnectBanner isOpen={sessionStatus === "reconnecting"} />
      <ForceUpdateModal isOpen={sessionStatus === "needs_update"} />
      {!sessionStatus && <LoadingOverlay />}
      {sessionStatus && databaseStatus === "upgrading" && (
        <UpgradingLoadingOverlay />
      )}
      {accountSession && !isSpectator && (
        <CharacterGateModal
          isOpen={sessionStatus === "joined" && !gate.ownsACharacter}
          tableId={gameId}
          session={accountSession}
          unownedCharacters={gate.unownedCharacters}
          onResolved={() => undefined}
        />
      )}
      <MapLoadingOverlay />
    </>
  );
}

function Game() {
  const { id: gameId }: { id: string } = useParams();
  const { search } = useLocation();
  // A window opened via the eye button's "abrir uma segunda
  // instância do Artisan em modo de Espectador" carries ?spectator=1 (see
  // helpers/spectator.ts) — a dedicated read-only viewer that always
  // follows the Mestre's camera and can't move/edit anything, distinct
  // from an ordinary Jogador even though it's launched under the SAME
  // account (see helpers/spectator.ts's session hand-off): components that
  // gate an action on account/table ownership must ALSO check this flag,
  // since sharing the Mestre's account would otherwise make every
  // GM-only check (isOwner, canManage, ...) pass for this window too.
  const isSpectator = isSpectatorSearch(search);
  const { databaseStatus } = useDatabase();
  const { session: accountSession, isLoaded: isAccountLoaded } = useAccount();

  const [session] = useState(new Session());
  const sessionStatus = useSessionStatus(session);

  useJoinGameWhenReady(session, gameId, sessionStatus, databaseStatus);
  useMesaMembershipRegistration(accountSession, gameId);
  useSessionConnection(session, isAccountLoaded, accountSession);

  // A ref to the Konva stage
  // the ref will be assigned in the MapInteraction component
  const mapStageRef = useRef<Konva.Stage | null>(null);

  // Shares NetworkedMapAndTokens's live token-create handler with
  // its CharacterRoster sibling under NetworkedParty — see
  // contexts/MapTokenCreateContext.tsx.
  const mapTokenCreateRef = useRef<TokensStateCreateHandler | null>(null);

  // Table/character sync: pulls this Mesa's tables + characters at least once per
  // visit (Home's useTablesSync already covers the periodic case, but a
  // client that joined straight from a game link never mounted Home).
  useTablesSync(accountSession);

  const gate = useCharacterGateState(gameId, accountSession, isSpectator);

  return (
    <GameProviders
      session={session}
      mapStageRef={mapStageRef}
      mapTokenCreateRef={mapTokenCreateRef}
      isSpectator={isSpectator}
    >
      <GameBoard
        session={session}
        gameId={gameId}
        isSpectator={isSpectator}
        mapTokenCreateRef={mapTokenCreateRef}
      />
      <GameOverlays
        sessionStatus={sessionStatus}
        databaseStatus={databaseStatus}
        gameId={gameId}
        isSpectator={isSpectator}
        accountSession={accountSession}
        gate={gate}
      />
    </GameProviders>
  );
}

export default Game;
