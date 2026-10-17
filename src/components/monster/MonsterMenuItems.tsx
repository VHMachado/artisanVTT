import { Button, Divider } from "theme-ui";

import StatBlockIcon from "../../icons/StatBlockIcon";
import AddIcon from "../../icons/AddIcon";
import EditTileIcon from "../../icons/EditTileIcon";
import DeleteIcon from "../../icons/DeleteIcon";

type MonsterMenuItemsProps = {
  isHomebrew: boolean;
  /** Opens this monster's stat block — the menu's always-present entry. */
  onOpen: () => void;
  /** GM only, SRD row only: derive a new homebrew creature from this one.
   * Absent for a Player, who sees only "Abrir ficha". */
  onDerive?: () => void;
  /** GM only, homebrew row only: edit/delete it. */
  onEdit?: () => void;
  /** GM only, SRD row only: attach a Perfil image and/or token variants
   * directly, no "Criar variação" detour. */
  onEditArt?: () => void;
  /** GM only, homebrew row only: deletes the creature itself (not just a
   * map placement) straight from the context menu, no detour through
   * "Editar criatura" — the caller owns the confirmation step. Distinct
   * from `onRemove` below, which only unlinks a map roster entry. */
  onDelete?: () => void;
  /** NPCs tab only: removes this entry from the current map's NPCs roster
   * (components/party/NpcRoster.tsx) without touching the underlying
   * bestiary/homebrew creature — a plain unlink, not a creature delete.
   * Rendered unconditionally when present, independent of every other
   * prop above (mirrors the token-menu's own universal "Excluir" entry). */
  onRemove?: () => void;
};

/**
 * The "Abrir ficha / Criar variação / Editar imagens / Editar
 * criatura" action list, shared by BestiaryRow's right-click menu (a
 * bestiary panel row) and a placed monster token's right-click menu
 * (components/monster/TokenMonsterMenu.tsx) — the same actions apply to a
 * monster whether the GM is looking at it in the panel list or already on
 * the board, so the two menus never drift apart. Each caller owns its own
 * ContextMenu/position state and passes already-bound callbacks (closing
 * its own menu is the caller's job, not this component's).
 */
function MonsterMenuItems({
  isHomebrew,
  onOpen,
  onDerive,
  onEdit,
  onEditArt,
  onDelete,
  onRemove,
}: MonsterMenuItemsProps) {
  return (
    <>
      <Button variant="menuItem" onClick={onOpen}>
        <StatBlockIcon />
        Abrir ficha
      </Button>
      {onDerive && !isHomebrew && (
        <Button variant="menuItem" onClick={onDerive}>
          <AddIcon />
          Criar variação
        </Button>
      )}
      {onEditArt && !isHomebrew && (
        <Button variant="menuItem" onClick={onEditArt}>
          <EditTileIcon />
          Editar imagens
        </Button>
      )}
      {isHomebrew && (onEdit || onDelete) && (
        <>
          <Divider sx={{ my: 1, opacity: 0.15 }} />
          {onEdit && (
            <Button variant="menuItem" onClick={onEdit}>
              <EditTileIcon />
              Editar criatura
            </Button>
          )}
          {onDelete && (
            <Button variant="menuItemDestructive" onClick={onDelete}>
              <DeleteIcon />
              Excluir
            </Button>
          )}
        </>
      )}
      {onRemove && (
        <>
          <Divider sx={{ my: 1, opacity: 0.15 }} />
          <Button variant="menuItemDestructive" onClick={onRemove}>
            <DeleteIcon />
            Excluir
          </Button>
        </>
      )}
    </>
  );
}

export default MonsterMenuItems;
