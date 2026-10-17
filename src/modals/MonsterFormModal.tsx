import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { Box, Button, Flex, Input, Label, Text, Textarea } from "theme-ui";
import SimpleBar from "simplebar-react";

import Modal from "../components/Modal";
import ConfirmModal from "./ConfirmModal";
import MonsterArtFields from "../components/monster/MonsterArtFields";

import { useAccount } from "../contexts/AccountContext";
import {
  createTableMonsterLocally,
  editTableMonsterLocally,
  deleteTableMonsterLocally,
} from "../helpers/tablesSync";
import { parseOverrides, serialiseOverrides } from "../helpers/tableMonsters";
import { uploadAsset } from "../helpers/assetUpload";
import { accountsAvailable } from "../helpers/account";

import type { Monster } from "../types/Monster";
import type { MonsterOverrides, TableMonster } from "../types/TableMonster";
import { RequestCloseEventHandler } from "../types/Events";

type MonsterFormModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  tableId: string;
  /** Editing an existing homebrew creature; omitted when creating one. */
  monster?: TableMonster;
  /** The SRD creature a NEW monster derives from (right-click "Derivar" on
   * an SRD row), or the resolved parent of the one being edited. Undefined
   * for a from-scratch creature. */
  parent?: Monster;
  /** Slug of `parent`, carried separately because a monster being edited
   * keeps its stored parentIndex even if the dataset no longer has it. */
  parentIndex?: string;
};

/**
 * Create or edit a homebrew / derived creature — "Criar monstro/NPC do
 * zero ou derivado de um existente. Derivados
 * ficam atrelados ao monstro pai ('Fulana é uma Duergar comum, mas com x de
 * HP e habilidades de ladina')."
 *
 * Every field except the name is a DIFF over the parent: left blank, it
 * inherits, and the placeholder shows what it would inherit. That's why the
 * inputs are strings rather than numbers pre-filled with the parent's
 * values — a form pre-filled with 26 HP would store 26 as an override and
 * silently freeze the creature's HP if the parent ever changed, turning a
 * derivation into a copy.
 *
 * Only the Mesa's GM can reach this (applyMonsterOp rejects anyone else);
 * the callers gate on table ownership so nobody meets that rejection.
 */
function MonsterFormModal({
  isOpen,
  onRequestClose,
  tableId,
  monster,
  parent,
  parentIndex,
}: MonsterFormModalProps) {
  const { session } = useAccount();
  const [name, setName] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [abilities, setAbilities] = useState("");
  const [actions, setActions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // "Perfil" image (single) + token art variants (several, so a
  // GM can give the same creature "variações de aparência" — a right-click
  // carousel on the map cycles through them per placed token).
  const [portraitFile, setPortraitFile] = useState<File | undefined>();
  const [removePortrait, setRemovePortrait] = useState(false);
  // Asset hashes already stored on the monster, kept unless the GM removes
  // one via its own "x" button.
  const [existingTokenAssetIds, setExistingTokenAssetIds] = useState<string[]>([]);
  // New files picked this session, uploaded (and appended) only on submit —
  // matches CreateCharacterModal/EditCharacterModal's "upload on save, not
  // on pick" discipline.
  const [newTokenFiles, setNewTokenFiles] = useState<File[]>([]);

  const isEditing = Boolean(monster);
  const effectiveParentIndex = monster?.parentIndex ?? parentIndex;

  // react-modal keeps this mounted between opens, so the form is re-seeded
  // every time it opens rather than once at mount.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const stored = monster ? parseOverrides(monster.overrides) : {};
    setName(monster?.name ?? (parent ? `${parent.name} (variação)` : ""));
    setFields({
      size: stored.size ?? "",
      type: stored.type ?? "",
      alignment: stored.alignment ?? "",
      armorClass: numberField(stored.armorClass),
      hitPoints: numberField(stored.hitPoints),
      hitDice: stored.hitDice ?? "",
      speedWalk: stored.speedWalk ?? "",
      strength: numberField(stored.strength),
      dexterity: numberField(stored.dexterity),
      constitution: numberField(stored.constitution),
      intelligence: numberField(stored.intelligence),
      wisdom: numberField(stored.wisdom),
      charisma: numberField(stored.charisma),
      challengeRating: numberField(stored.challengeRating),
      languages: stored.languages ?? "",
      desc: stored.desc ?? "",
    });
    setAbilities(entriesToText(stored.extraAbilities));
    setActions(entriesToText(stored.extraActions));
    setPortraitFile(undefined);
    setRemovePortrait(false);
    setExistingTokenAssetIds(monster?.tokenAssetIds ?? []);
    setNewTokenFiles([]);
  }, [isOpen, monster, parent]);

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function removeExistingVariant(hash: string) {
    setExistingTokenAssetIds((prev) => prev.filter((h) => h !== hash));
  }

  function removeNewVariant(index: number) {
    setNewTokenFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function buildOverrides(): MonsterOverrides {
    const overrides: MonsterOverrides = {
      size: fields.size || undefined,
      type: fields.type || undefined,
      alignment: fields.alignment || undefined,
      hitDice: fields.hitDice || undefined,
      speedWalk: fields.speedWalk || undefined,
      languages: fields.languages || undefined,
      desc: fields.desc || undefined,
      armorClass: parseNumber(fields.armorClass),
      hitPoints: parseNumber(fields.hitPoints),
      strength: parseNumber(fields.strength),
      dexterity: parseNumber(fields.dexterity),
      constitution: parseNumber(fields.constitution),
      intelligence: parseNumber(fields.intelligence),
      wisdom: parseNumber(fields.wisdom),
      charisma: parseNumber(fields.charisma),
      challengeRating: parseNumber(fields.challengeRating),
      extraAbilities: textToEntries(abilities),
      extraActions: textToEntries(actions),
    };
    return overrides;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !name.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      const overrides = serialiseOverrides(buildOverrides());

      // Best-effort uploads, same offline-first reasoning as
      // CreateCharacterModal/EditCharacterModal: the monster still saves
      // locally even if the broker is unreachable right now — a file that
      // fails to upload is simply dropped rather than blocking the save.
      let portraitAssetId = removePortrait
        ? undefined
        : monster?.portraitAssetId;
      let tokenAssetIds = [...existingTokenAssetIds];
      if (accountsAvailable) {
        if (portraitFile) {
          try {
            portraitAssetId = await uploadAsset(session, portraitFile);
          } catch {
            // Ignored — see comment above.
          }
        }
        for (const file of newTokenFiles) {
          try {
            tokenAssetIds.push(await uploadAsset(session, file));
          } catch {
            // Ignored — see comment above.
          }
        }
      }

      if (monster) {
        await editTableMonsterLocally(monster.id, {
          name: name.trim(),
          overrides,
          portraitAssetId,
          tokenAssetIds,
        });
      } else {
        await createTableMonsterLocally(
          session,
          tableId,
          name.trim(),
          overrides,
          effectiveParentIndex,
          portraitAssetId,
          tokenAssetIds
        );
      }
      onRequestClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setIsConfirmDeleteOpen(false);
    if (monster) {
      await deleteTableMonsterLocally(monster.id, monster.tableId);
    }
    onRequestClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={{ content: { maxWidth: "420px", width: "100%" } }}
    >
      <Flex sx={{ flexDirection: "column", flexGrow: 1 }} m={2}>
        <Text as="h2" variant="heading" sx={{ fontSize: 3 }} mb={1}>
          {isEditing ? "Editar criatura" : "Nova criatura"}
        </Text>
        <Text as="p" variant="caption" mb={2}>
          {parent
            ? `Derivada de ${parent.name}. Campos em branco herdam do original.`
            : "Criatura do zero. Campos em branco usam valores padrão."}
        </Text>
        <SimpleBar style={{ maxHeight: "60vh", paddingRight: "12px" }}>
          <Box as="form" id="monster-form" onSubmit={handleSubmit}>
            <Label htmlFor="monster-name" mb={1}>
              Nome
            </Label>
            <Input
              id="monster-name"
              value={name}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setName(event.target.value)
              }
              mb={3}
              required
            />

            <MonsterArtFields
              portraitAssetId={monster?.portraitAssetId}
              portraitFile={portraitFile}
              removePortrait={removePortrait}
              onPortraitFileChange={(file) => {
                setPortraitFile(file);
                setRemovePortrait(false);
              }}
              onRemovePortrait={() => {
                setPortraitFile(undefined);
                setRemovePortrait(true);
              }}
              existingTokenAssetIds={existingTokenAssetIds}
              newTokenFiles={newTokenFiles}
              onAddTokenFiles={(files) =>
                setNewTokenFiles((prev) => [...prev, ...files])
              }
              onRemoveExistingVariant={removeExistingVariant}
              onRemoveNewVariant={removeNewVariant}
            />

            <Flex sx={{ gap: 2 }} mb={3}>
              <Field
                label="Pontos de vida"
                id="monster-hp"
                value={fields.hitPoints}
                placeholder={parent ? String(parent.hit_points) : "1"}
                onChange={(v) => setField("hitPoints", v)}
              />
              <Field
                label="CA"
                id="monster-ac"
                value={fields.armorClass}
                placeholder={
                  parent ? String(parent.armor_class[0]?.value ?? 10) : "10"
                }
                onChange={(v) => setField("armorClass", v)}
              />
              <Field
                label="ND"
                id="monster-cr"
                value={fields.challengeRating}
                placeholder={parent ? String(parent.challenge_rating) : "0"}
                onChange={(v) => setField("challengeRating", v)}
              />
            </Flex>

            <Flex sx={{ gap: 2 }} mb={3}>
              <Field
                label="Tamanho"
                id="monster-size"
                value={fields.size}
                placeholder={parent?.size ?? "Medium"}
                onChange={(v) => setField("size", v)}
              />
              <Field
                label="Tipo"
                id="monster-type"
                value={fields.type}
                placeholder={parent?.type ?? "humanoid"}
                onChange={(v) => setField("type", v)}
              />
            </Flex>

            <Flex sx={{ gap: 2 }} mb={3}>
              <Field
                label="Deslocamento"
                id="monster-speed"
                value={fields.speedWalk}
                placeholder={parent?.speed.walk ?? "30 ft."}
                onChange={(v) => setField("speedWalk", v)}
              />
              <Field
                label="Dados de vida"
                id="monster-hitdice"
                value={fields.hitDice}
                placeholder={parent?.hit_dice ?? "1d8"}
                onChange={(v) => setField("hitDice", v)}
              />
            </Flex>

            <Label mb={1}>Atributos</Label>
            <Flex sx={{ gap: 1, flexWrap: "wrap" }} mb={3}>
              {(
                [
                  ["strength", "FOR"],
                  ["dexterity", "DES"],
                  ["constitution", "CON"],
                  ["intelligence", "INT"],
                  ["wisdom", "SAB"],
                  ["charisma", "CAR"],
                ] as const
              ).map(([key, label]) => (
                <Box key={key} sx={{ width: "60px" }}>
                  <Text variant="labelCaps" sx={{ display: "block" }}>
                    {label}
                  </Text>
                  <Input
                    aria-label={label}
                    value={fields[key]}
                    placeholder={parent ? String(parent[key]) : "10"}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setField(key, event.target.value)
                    }
                    sx={{ fontSize: 0, py: 1 }}
                  />
                </Box>
              ))}
            </Flex>

            <Label htmlFor="monster-alignment" mb={1}>
              Tendência
            </Label>
            <Input
              id="monster-alignment"
              value={fields.alignment}
              placeholder={parent?.alignment ?? "unaligned"}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setField("alignment", event.target.value)
              }
              mb={3}
            />

            <Label htmlFor="monster-languages" mb={1}>
              Idiomas
            </Label>
            <Input
              id="monster-languages"
              value={fields.languages}
              placeholder={parent?.languages || "—"}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setField("languages", event.target.value)
              }
              mb={3}
            />

            <Label htmlFor="monster-abilities" mb={1}>
              Habilidades extras
            </Label>
            <Textarea
              id="monster-abilities"
              rows={3}
              value={abilities}
              placeholder={"Nome: descrição\nUma por linha"}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setAbilities(event.target.value)
              }
              mb={1}
            />
            <Text as="p" variant="caption" mb={3}>
              Somam-se às do original, não as substituem.
            </Text>

            <Label htmlFor="monster-actions" mb={1}>
              Ações extras
            </Label>
            <Textarea
              id="monster-actions"
              rows={3}
              value={actions}
              placeholder={"Ataque Furtivo: +2d6 de dano"}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setActions(event.target.value)
              }
              mb={3}
            />

            <Label htmlFor="monster-desc" mb={1}>
              Notas
            </Label>
            <Textarea
              id="monster-desc"
              rows={2}
              value={fields.desc}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setField("desc", event.target.value)
              }
              mb={3}
            />
          </Box>
        </SimpleBar>
        <Flex mt={2}>
          {isEditing && (
            <Button
              type="button"
              variant="secondary"
              sx={{ flexGrow: 1 }}
              mr={1}
              onClick={() => setIsConfirmDeleteOpen(true)}
              disabled={isSubmitting}
            >
              Excluir
            </Button>
          )}
          <Button
            form="monster-form"
            sx={{ flexGrow: 1 }}
            ml={isEditing ? 1 : 0}
            disabled={!name.trim() || isSubmitting}
          >
            Salvar
          </Button>
        </Flex>
      </Flex>
      <ConfirmModal
        isOpen={isConfirmDeleteOpen}
        onRequestClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        confirmText="Excluir"
        label="Excluir criatura"
        description={`Isso remove "${monster?.name}" da Mesa para sempre.`}
      />
    </Modal>
  );
}

function Field({
  label,
  id,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Box sx={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
      <Label htmlFor={id} mb={1}>
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
      />
    </Box>
  );
}

function numberField(value: number | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

/** "" stays undefined (inherit); anything non-numeric is discarded rather
 * than stored as NaN, which would render as "NaN HP" forever. */
function parseNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** "Name: description" per line — the lightest input that still produces
 * the {name, desc} pairs a stat block renders, without a repeating
 * sub-form for what is usually one or two entries. */
export function textToEntries(text: string): { name: string; desc: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator === -1) {
        return { name: line, desc: "" };
      }
      return {
        name: line.slice(0, separator).trim(),
        desc: line.slice(separator + 1).trim(),
      };
    });
}

export function entriesToText(
  entries: { name: string; desc: string }[] | undefined
): string {
  return (entries || [])
    .map((entry) => (entry.desc ? `${entry.name}: ${entry.desc}` : entry.name))
    .join("\n");
}

export default MonsterFormModal;
