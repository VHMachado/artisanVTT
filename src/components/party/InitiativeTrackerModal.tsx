import { useState, ChangeEvent } from "react";
import { Box, Button, Flex, Input, Text } from "theme-ui";
import SimpleBar from "simplebar-react";

import DeleteIcon from "../../icons/DeleteIcon";
import TokenCharacterIcon from "../../icons/TokenCharacterIcon";
import D20Icon from "../../icons/D20Icon";

import { resolveInitiativeEntry, sortedInitiativeEntries, combatElapsedSeconds, formatCombatTime } from "../../helpers/initiative";
import { initiativeBonusForToken, rollD20 } from "../../helpers/initiativeRoll";

import { useUserId } from "../../contexts/UserIdContext";

import { InitiativeEntry, InitiativeState } from "../../types/Initiative";
import { MapState } from "../../types/MapState";
import { TokenStateChangeEventHandler } from "../../types/Events";

type InitiativeTrackerModalProps = {
  state: InitiativeState;
  /** Para resolver o nome/HP de uma entrada vinculada a um token
   * (types/Initiative.ts's tokenId) a partir do próprio TokenState —
   * ver resolveInitiativeEntry. */
  mapState: MapState | null;
  onUpdateEntry: (
    id: string,
    patch: Partial<{ name: string; initiative: number; hp: number; maxHp: number }>
  ) => void;
  onRemoveEntry: (id: string) => void;
  onNextTurn: () => void;
  onClear: () => void;
  /** Quantos tokens estão selecionados no mapa agora — habilita/rotula o
   * botão "Adicionar selecionados ao combate" (pedido do usuário,
   * 2026-10-12). Zero some com o botão em vez de desabilitá-lo. */
  selectedTokenCount: number;
  onAddSelectedToCombat: () => void;
  /** Para escrever HP de volta no TOKEN quando a entrada editada tem
   * vínculo (tokenId) — o mesmo dado, não uma cópia (ver
   * types/TokenState.ts's TokenHp). */
  onMapTokenStateChange: TokenStateChangeEventHandler;
};

/**
 * The Mesa's initiative order and monster HP "no mesmo
 * painel": one row per combatant with an inline HP field and a delete
 * button, sorted by initiative (highest first), the active turn
 * highlighted. Mestre-only (the button that opens this, DiceTrayButton's
 * new sibling, is only rendered for the GM — see Party.tsx) — no
 * visibility/editing gate is duplicated here since this component is
 * never mounted for a Jogador in the first place.
 *
 * Ajuste do usuário (2026-10-12, segunda rodada): a adição manual por
 * nome/HP digitados foi REMOVIDA — o único jeito de entrar no combate
 * agora é "Adicionar selecionados ao combate" a partir de tokens no
 * mapa (characters/monstros/NPCs; props e veículos são filtrados antes
 * de chegar aqui, ver MapDock.tsx's handleAddSelectedToCombat). Toda
 * entrada carrega `tokenId` (vínculo PERMANENTE — ver
 * types/Initiative.ts) e seu nome/HP sempre espelham o token real via
 * `resolveInitiativeEntry`, editar um é editar o outro. A ORDEM de
 * iniciativa continua ajustável por entrada (input numérico editável
 * abaixo) e agora também pode ser ROLADA automaticamente (1d20 + bônus
 * de DEX da ficha/stat block — ver helpers/initiativeRoll.ts).
 */
function InitiativeTrackerModal({
  state,
  mapState,
  onUpdateEntry,
  onRemoveEntry,
  onNextTurn,
  onClear,
  selectedTokenCount,
  onAddSelectedToCombat,
  onMapTokenStateChange,
}: InitiativeTrackerModalProps) {
  const userId = useUserId();
  const [rollingEntryId, setRollingEntryId] = useState<string | null>(null);

  const entries = sortedInitiativeEntries(state).map((entry) =>
    resolveInitiativeEntry(entry, mapState)
  );

  /**
   * Edita HP de uma entrada. Toda entrada agora é vinculada a um token
   * (ver comentário acima) — a escrita vai para o PRÓPRIO TOKEN
   * (onMapTokenStateChange), nunca para a entrada: resolveInitiativeEntry
   * sempre prioriza o dado do token, então gravar na entrada ficaria
   * sem efeito visível.
   */
  function handleHpChange(tokenId: string | undefined, value: string) {
    if (!tokenId) {
      return;
    }
    const parsed = parseInt(value, 10);
    const hpValue = Number.isNaN(parsed) ? 0 : parsed;
    const token = mapState?.tokens[tokenId];
    onMapTokenStateChange({
      [tokenId]: {
        hp: { current: hpValue, max: token?.hp?.max ?? hpValue },
        lastModifiedBy: userId,
        lastModified: Date.now(),
      },
    });
  }

  function handleInitiativeChange(id: string, value: string) {
    const parsed = parseInt(value, 10);
    onUpdateEntry(id, { initiative: Number.isNaN(parsed) ? 0 : parsed });
  }

  /**
   * Pedido do usuário (2026-10-12): rolar 1d20 + bônus de iniciativa da
   * ficha/stat block automaticamente, sem exigir que o GM calcule o
   * bônus manualmente. `rollingEntryId` só evita cliques duplicados
   * enquanto o lookup assíncrono (ficha ou bestiário, ambos via Dexie)
   * está em voo — nunca persistido, nunca sincronizado.
   */
  async function handleRollInitiative(entry: InitiativeEntry) {
    if (rollingEntryId) {
      return;
    }
    setRollingEntryId(entry.id);
    try {
      const token = entry.tokenId ? mapState?.tokens[entry.tokenId] : undefined;
      const bonus = token ? await initiativeBonusForToken(token) : 0;
      onUpdateEntry(entry.id, { initiative: rollD20() + bonus });
    } finally {
      setRollingEntryId(null);
    }
  }

  return (
    <Box sx={{ width: "380px", maxWidth: "calc(100vw - 24px)" }} p={3}>
      <Flex sx={{ flexDirection: "column", flexGrow: 1 }}>
        <Flex sx={{ alignItems: "center", justifyContent: "space-between" }} mb={2}>
          <Text variant="heading" as="h2" sx={{ fontSize: 2 }}>
            Iniciativa
          </Text>
          <Button
            type="button"
            variant="secondary"
            onClick={onClear}
            disabled={entries.length === 0}
          >
            Limpar tudo
          </Button>
        </Flex>

        {/* Pedido do usuário (2026-10-12, terceira rodada): contador de
            rodadas ("uma rodada passa quando o turno de todos já
            passou" — state.round, ver helpers/initiative.ts's
            withNextTurn) e o monitor de tempo de combate que a regra
            do PHB 2014 deriva dele (1 rodada ≈ 6 segundos de jogo — ver
            combatElapsedSeconds). Sempre visível, mesmo com o combate
            zerado (rodada 1, 0:00), para a numeração nunca "aparecer do
            nada" só quando o GM avança o primeiro turno. */}
        <Flex
          sx={{ alignItems: "center", justifyContent: "space-between" }}
          mb={2}
          px={1}
        >
          <Text as="span" variant="body2">
            Rodada {state.round ?? 1}
          </Text>
          <Text as="span" variant="caption" title="Tempo de combate (1 rodada ≈ 6s)">
            {formatCombatTime(combatElapsedSeconds(state))}
          </Text>
        </Flex>

        {/* Pedido do usuário (2026-10-12): adicionar os tokens
            selecionados no mapa diretamente ao combate, em vez de
            digitar nome/HP manualmente. Só aparece com algo selecionado
            — zero tokens selecionados é o estado comum (navegando o
            mapa sem combate em mente) e não merece um botão
            desabilitado ocupando espaço. */}
        {selectedTokenCount > 0 && (
          <Button
            type="button"
            variant="secondary"
            onClick={onAddSelectedToCombat}
            mb={2}
            sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}
          >
            <TokenCharacterIcon />
            Adicionar {selectedTokenCount > 1 ? `${selectedTokenCount} selecionados` : "selecionado"} ao combate
          </Button>
        )}

        <SimpleBar style={{ maxHeight: "50vh", paddingRight: "8px" }}>
          {entries.length === 0 && (
            <Text as="p" variant="caption" mb={2}>
              Nenhum combatente ainda. Selecione tokens no mapa e use
              "Adicionar ao combate".
            </Text>
          )}
          {entries.map((entry) => {
            const isActive = state.activeEntryId === entry.id;
            return (
              <Flex
                key={entry.id}
                sx={{
                  alignItems: "center",
                  gap: 2,
                  borderRadius: "6px",
                  bg: isActive ? "rgba(139, 112, 61, 0.18)" : "transparent",
                }}
                px={2}
                py={2}
                mb={1}
              >
                <Input
                  aria-label={`Iniciativa de ${entry.name}`}
                  inputMode="numeric"
                  value={String(entry.initiative)}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    handleInitiativeChange(entry.id, event.target.value)
                  }
                  sx={{
                    width: "40px",
                    textAlign: "center",
                    px: 1,
                    py: 1,
                    fontWeight: isActive ? "heading" : "body",
                  }}
                />
                <Button
                  type="button"
                  variant="menuItem"
                  onClick={() => handleRollInitiative(entry)}
                  disabled={rollingEntryId === entry.id}
                  title="Rolar iniciativa (1d20 + bônus)"
                  aria-label={`Rolar iniciativa de ${entry.name}`}
                  sx={{ width: "auto", p: 1, flexShrink: 0 }}
                >
                  <D20Icon />
                </Button>
                <Text
                  as="p"
                  variant="body2"
                  sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: isActive ? "heading" : "body",
                  }}
                  title={entry.name}
                >
                  {entry.name}
                </Text>
                <Input
                  aria-label={`HP de ${entry.name}`}
                  inputMode="numeric"
                  value={String(entry.hp)}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    handleHpChange(entry.tokenId, event.target.value)
                  }
                  sx={{ width: "48px", textAlign: "center", px: 1, py: 1 }}
                />
                <Text as="span" variant="caption" sx={{ width: "44px" }}>
                  / {entry.maxHp}
                </Text>
                <Button
                  type="button"
                  variant="menuItemDestructive"
                  onClick={() => onRemoveEntry(entry.id)}
                  title="Excluir"
                  aria-label={`Excluir ${entry.name}`}
                  sx={{ width: "auto", p: 1 }}
                >
                  <DeleteIcon />
                </Button>
              </Flex>
            );
          })}
        </SimpleBar>

        <Button
          type="button"
          sx={{ mt: 2 }}
          onClick={onNextTurn}
          disabled={entries.length === 0}
        >
          Próximo turno
        </Button>
      </Flex>
    </Box>
  );
}

export default InitiativeTrackerModal;
