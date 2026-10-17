import { useEffect, useState } from "react";
import { Flex, Text, Box, Card, Grid, Button } from "theme-ui";
import { useHistory } from "react-router-dom";

import ConnectionStatusDot from "../components/ConnectionStatusDot";
import AccountMenu from "../components/AccountMenu";
import TableCard from "../components/table/TableCard";
import CreateTableModal from "../modals/CreateTableModal";

import { useAccount } from "../contexts/AccountContext";
import { useTablesSync } from "../hooks/useTablesSync";
import { useOnlineCounts } from "../hooks/useOnlineCounts";
import {
  getLaunchSpectatorGameId,
  buildSpectatorPath,
} from "../helpers/spectator";

// No hero background image is bundled in this public release (the asset
// this screen used to ship was not clearly licensed for redistribution).
// Plug one in by adding `import heroImage from "../assets/home-hero.jpg";`
// and restoring `, url(${heroImage})` to the backgroundImage below.

/**
 * "Mesas" carousel replacing Start Game/Join Game.
 * "Criar Mesa" is always the LAST card; every Mesa card before it is
 * visible to every account (no invite, no per-table password — the
 * tailnet is the perimeter).
 */
function Home() {
  const { session } = useAccount();
  const { tables, notices, clearNotice } = useTablesSync(session);
  const onlineCounts = useOnlineCounts(session);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const history = useHistory();

  // A desktop process launched via the eye button's
  // OpenSpectatorWindow (desktop/main.go's --spectator flag) starts here,
  // on Home, the same as any other launch — redirect it straight into the
  // Mesa it was opened for, in read-only Espectador mode, instead of
  // making the user click through. A normal launch (no --spectator flag)
  // resolves to undefined here and Home renders as usual.
  useEffect(() => {
    let cancelled = false;
    getLaunchSpectatorGameId().then((gameId) => {
      if (!cancelled && gameId) {
        history.replace(buildSpectatorPath(gameId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [history]);

  return (
    <Flex
      sx={{
        flexDirection: "column",
        // era `minHeight: "100%"` — com container column em
        // `height: auto`, o flexbox calcula o tamanho intrínseco ANTES de
        // aplicar min-height, então o `flexGrow: 1` do bloco de Mesas
        // nunca via o espaço extra que o min-height adicionava depois (o
        // card ficava colado no topo com espaço vazio embaixo). `height:
        // "100%"` torna o tamanho do container definido desde o início,
        // então o flex-grow abaixo consegue distribuir o espaço sobrando
        // e centralizar de verdade.
        height: "100%",
        position: "relative",
        // Hero cinematográfico de fundo, mesmo padrão
        // do Alchemy. O foco visual da arte (cabeça/chama do dragão) fica
        // no quadrante superior-direito, então o conteúdo (wordmark, Mesas)
        // permanece centralizado/à esquerda, sobre a metade inferior — ver
        // DESIGN.md "Layout" e "Do's and Don'ts" ("nunca texto direto sobre
        // imagem sem véu"). O gradiente é literal (não token), porque `sx`
        // só resolve tokens em propriedades simples como `bg`/`color`, não
        // dentro de uma string `backgroundImage` — os valores abaixo casam
        // com `colors.background` (#101217) do theme.
        backgroundImage: `linear-gradient(rgba(16, 18, 23, 0.55), rgba(16, 18, 23, 0.55)), linear-gradient(to bottom, rgba(16, 18, 23, 0) 0%, rgba(16, 18, 23, 0.96) 78%)`,
        backgroundSize: "cover",
        backgroundPosition: "center, center, center 30%",
        backgroundRepeat: "no-repeat",
      }}
    >
      <Box m={4} sx={{ position: "absolute", top: 0, left: 0 }}>
        <ConnectionStatusDot />
      </Box>
      <Box m={4} sx={{ position: "absolute", top: 0, right: 0 }}>
        <AccountMenu />
      </Box>
      <Flex
        sx={{
          flexDirection: "column",
          alignItems: "center",
          pt: 5,
        }}
      >
        <Text variant="wordmark" as="h1" sx={{ textAlign: "center" }}>
          Artisan
        </Text>
      </Flex>
      {/* Ajuste de posição pedido pelo usuário — a versão anterior
          usava flexGrow + justifyContent: center, que jogava o bloco para
          o meio exato da tela (baixo demais). Agora ancora perto do topo,
          logo abaixo do wordmark, com um respiro proporcional à altura da
          janela (vh) em vez de pixels fixos — se aproxima da altura
          marcada pelo usuário sem virar um layout quebradiço. */}
      <Flex
        sx={{
          flexDirection: "column",
          pt: "8vh",
        }}
      >
        <Box sx={{ maxWidth: "1200px", width: "100%", mx: "auto", px: 3, pb: 4 }}>
          <Text as="h2" sx={{ fontSize: 5, fontWeight: "heading" }} mb={3}>
            Mesas
          </Text>
          <Grid columns={[1, 2, 3]} gap={3}>
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                isOwner={session?.accountId === table.ownerId}
                onlineCount={onlineCounts[table.id] ?? 0}
              />
            ))}
            <Card
              sx={{
                // Ficava menor que os cards de Mesa reais porque
                // tinha altura fixa (168px) enquanto TableCard cresce com
                // o conteúdo (imagem + rodapé). height: "100%" faz este
                // card esticar até a altura da linha do grid, que o CSS
                // Grid já calcula pelo item mais alto da fileira (Grid
                // aplica align-items: stretch por padrão a cada item sem
                // altura própria).
                height: "100%",
                minHeight: "230px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              onClick={() => setIsCreateOpen(true)}
            >
              {/* DESIGN.md "Shapes": pílula reservada para o único CTA de
                  alta ênfase da tela — aqui, não há outro botão pill na
                  Home, então este cumpre esse papel. */}
              <Button variant="cta">+ Criar Mesa</Button>
            </Card>
          </Grid>
        </Box>
      </Flex>
      <CreateTableModal
        isOpen={isCreateOpen}
        onRequestClose={() => setIsCreateOpen(false)}
        onCreated={(tableId) => history.push(`/game/${tableId}`)}
      />
      {notices.length > 0 && (
        <Box
          sx={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {notices.map((notice, index) => (
            <Box
              key={index}
              bg="messages.warning"
              m={2}
              p={2}
              sx={{ borderRadius: "4px", cursor: "pointer" }}
              onClick={() => clearNotice(index)}
            >
              <Text as="p" variant="body2">
                {notice.kind === "conflict"
                  ? `Uma edição em "${notice.name ?? notice.id}" foi sobrescrita por outra pessoa.`
                  : `Uma alteração foi recusada: ${notice.error}`}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Flex>
  );
}

export default Home;
