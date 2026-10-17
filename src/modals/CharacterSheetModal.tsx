import { useEffect, useMemo, useState } from "react";
import { Box, Button, Flex, Input, Label, Select, Text, Textarea } from "theme-ui";
import SimpleBar from "simplebar-react";

import Modal from "../components/Modal";
import Divider from "../components/Divider";

import { loadCompendium, Compendium } from "../5e/compendium";
import {
  AbilityKey,
  allSkillModifiers,
  featuresByLevel,
  parseSheet,
  racialTraits,
  resolveAbilities,
  savingThrowProficiencies,
  serialiseSheet,
  sheetSummary,
  spellSlots,
  totalArmorClass,
  totalInitiativeBonus,
  totalSpeed,
} from "../5e/characterSheet";
import {
  eligibleSpells,
  eligibleSubclasses,
  eligibleSubraces,
  pendingChoices,
  sheetProblems,
  subclassLevel,
  type HomebrewContext,
} from "../5e/prerequisites";
import { editCharacterLocally } from "../helpers/tablesSync";
import { useAccount } from "../contexts/AccountContext";
import { useTableRuleOptions } from "../hooks/useTableRuleOptions";
import RuleOptionFormModal from "./RuleOptionFormModal";

import { Character } from "../types/Character";
import { CharacterSheet } from "../types/CharacterSheet";
import type { RuleOptionKind, TableRuleOption } from "../types/HomebrewOption";
import { RequestCloseEventHandler } from "../types/Events";

type CharacterSheetModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  character: Character;
  /** False for a viewer who may read but not change the sheet (another
   * player's character). The broker enforces the same rule in
   * applyCharacterOp; this only keeps the UI honest. */
  canEdit: boolean;
  /** The Mesa, so the sheet can read and author its homebrew subraces and
   * subclasses. */
  tableId: string;
  /** The GM may edit anyone's homebrew option; an author may edit their
   * own. Mirrors applyRuleOptionOp. */
  isTableOwner: boolean;
};

const MAX_LEVEL = 20;

/**
 * The character sheet: the UI over 5e/prerequisites.ts.
 *
 * Its one rule: **only eligible options are offered.** Every
 * picker below is fed by the engine, never by a raw dataset list — the
 * subclass dropdown shows only this class's subclasses (and only once the
 * level allows one), the spell list only what this class+subclass may
 * learn at this level, and each "choose N" only the options its own
 * feature defines. A sheet whose earlier picks stopped being legal shows
 * `sheetProblems` at the top rather than silently dropping them.
 *
 * Choices are stored, derived numbers are not (types/CharacterSheet.ts) —
 * so the AC, HP and feature list below are recomputed on every render from
 * the current picks, and changing class can't leave a stale total behind.
 */
function CharacterSheetModal({
  isOpen,
  onRequestClose,
  character,
  canEdit,
  tableId,
  isTableOwner,
}: CharacterSheetModalProps) {
  const [compendium, setCompendium] = useState<Compendium>();
  const [sheet, setSheet] = useState<CharacterSheet>({});
  const [isSaving, setIsSaving] = useState(false);
  const { session } = useAccount();
  // The Mesa's own subraces/subclasses, live: an option the GM adds while
  // a player has the sheet open appears in their picker without a reload.
  const ruleOptions = useTableRuleOptions(tableId);
  const homebrew = useMemo<HomebrewContext>(
    () => ({ options: ruleOptions }),
    [ruleOptions]
  );
  // Authoring state: either a new option (kind+parent) or an existing one.
  const [newOption, setNewOption] = useState<{
    kind: RuleOptionKind;
    parentIndex: string;
    parentName: string;
  } | null>(null);
  const [editingOption, setEditingOption] = useState<TableRuleOption | null>(
    null
  );

  // Loaded lazily and only when the sheet is actually opened: the eight
  // datasets are ~1.6MB, and a session that never opens a sheet must not
  // pay for them (same reasoning as the bestiary's dynamic import).
  useEffect(() => {
    if (isOpen && !compendium) {
      let cancelled = false;
      loadCompendium().then((loaded) => {
        if (!cancelled) {
          setCompendium(loaded);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, compendium]);

  // Re-read from the character whenever a different one is opened —
  // react-modal keeps this mounted between opens.
  useEffect(() => {
    if (isOpen) {
      setSheet(parseSheet(character.sheet));
    }
  }, [isOpen, character.sheet]);

  const problems = useMemo(
    () => (compendium ? sheetProblems(compendium, sheet, homebrew) : []),
    [compendium, sheet, homebrew]
  );

  async function persist(next: CharacterSheet) {
    setSheet(next);
    if (!canEdit) {
      return;
    }
    setIsSaving(true);
    try {
      await editCharacterLocally(character.id, {
        sheet: serialiseSheet(next),
      });
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Changing class or race invalidates what depended on it. The dependent
   * pick is CLEARED here rather than left to fail validation later:
   * keeping a Valor-bard subclass on a freshly-chosen wizard would be a
   * state the engine can only ever report as broken.
   */
  function changeClass(classIndex: string) {
    persist({
      ...sheet,
      classIndex: classIndex || undefined,
      subclassIndex: undefined,
      spells: [],
      featureChoices: {},
    });
  }

  function changeRace(raceIndex: string) {
    persist({ ...sheet, raceIndex: raceIndex || undefined, subraceIndex: undefined });
  }

  function toggleSpell(index: string) {
    const spells = sheet.spells || [];
    persist({
      ...sheet,
      spells: spells.includes(index)
        ? spells.filter((s) => s !== index)
        : [...spells, index],
    });
  }

  function toggleChoice(key: string, index: string, choose: number) {
    const current = sheet.featureChoices?.[key] || [];
    let next: string[];
    if (current.includes(index)) {
      next = current.filter((i) => i !== index);
    } else if (current.length >= choose) {
      // At the limit the oldest pick makes way, so the player is never
      // stuck having to deselect before selecting.
      next = [...current.slice(1), index];
    } else {
      next = [...current, index];
    }
    persist({
      ...sheet,
      featureChoices: { ...(sheet.featureChoices || {}), [key]: next },
    });
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      allowClose
      style={{ content: { maxWidth: "480px", width: "100%" } }}
    >
      <Flex sx={{ flexDirection: "column", flexGrow: 1 }} m={2}>
        <Text as="h2" variant="heading" sx={{ fontSize: 3 }} mb={1}>
          {character.name}
        </Text>
        {!compendium ? (
          <Text sx={{ fontSize: 1, color: "gray" }}>Carregando regras…</Text>
        ) : (
          <SheetBody
            compendium={compendium}
            sheet={sheet}
            problems={problems}
            canEdit={canEdit}
            isSaving={isSaving}
            homebrew={homebrew}
            onPersist={persist}
            onChangeClass={changeClass}
            onChangeRace={changeRace}
            onToggleSpell={toggleSpell}
            onToggleChoice={toggleChoice}
            onCreateOption={(kind, parentIndex, parentName) =>
              setNewOption({ kind, parentIndex, parentName })
            }
            onEditOption={setEditingOption}
            canEditOption={(option) =>
              isTableOwner || option.ownerAccountId === session?.accountId
            }
          />
        )}
      </Flex>
      {/* Authoring the Mesa's options from inside the sheet: the moment a
          player discovers the SRD list is short is the moment they want to
          add to it, so the form is one click from the picker rather than in
          a separate settings screen. Grouped in a fragment because Modal's
          children type rejects a bare conditional's null. */}
      <>
        {newOption && (
          <RuleOptionFormModal
            isOpen
            onRequestClose={() => setNewOption(null)}
            tableId={tableId}
            kind={newOption.kind}
            parentIndex={newOption.parentIndex}
            parentName={newOption.parentName}
          />
        )}
        {editingOption && (
          <RuleOptionFormModal
            isOpen
            onRequestClose={() => setEditingOption(null)}
            tableId={tableId}
            option={editingOption}
            canDelete={
              isTableOwner ||
              editingOption.ownerAccountId === session?.accountId
            }
          />
        )}
      </>
    </Modal>
  );
}

type SheetBodyProps = {
  compendium: Compendium;
  sheet: CharacterSheet;
  problems: string[];
  canEdit: boolean;
  isSaving: boolean;
  homebrew: HomebrewContext;
  onPersist: (sheet: CharacterSheet) => void;
  onChangeClass: (index: string) => void;
  onChangeRace: (index: string) => void;
  onToggleSpell: (index: string) => void;
  onToggleChoice: (key: string, index: string, choose: number) => void;
  onCreateOption: (
    kind: RuleOptionKind,
    parentIndex: string,
    parentName: string
  ) => void;
  onEditOption: (option: TableRuleOption) => void;
  canEditOption: (option: TableRuleOption) => boolean;
};

function SheetBody({
  compendium,
  sheet,
  problems,
  canEdit,
  isSaving,
  homebrew,
  onPersist,
  onChangeClass,
  onChangeRace,
  onToggleSpell,
  onToggleChoice,
  onCreateOption,
  onEditOption,
  canEditOption,
}: SheetBodyProps) {
  // Two tabs, same underline pattern already used in
  // AddNpcModal/MonsterStatBlockModal (buttons.tab/tabActive) — PERSONAGEM
  // reúne raça/classe/atributos/Core Stats/perícias (o que se consulta o
  // tempo todo à mesa), HABILIDADES o conteúdo de leitura mais longa
  // (magias, traços raciais, habilidades de classe, anotações).
  const [tab, setTab] = useState<"character" | "features">("character");

  // Notes are edited as a local draft and flushed on blur — see the
  // Textarea's onBlur below. Declared before the derived reads so every
  // hook in this component sits at the top.
  const [notesDraft, setNotesDraft] = useState(sheet.notes || "");
  useEffect(() => {
    setNotesDraft(sheet.notes || "");
  }, [sheet.notes]);

  const summary = sheetSummary(compendium, sheet);
  const abilities = resolveAbilities(compendium, sheet, homebrew);
  const saves = savingThrowProficiencies(compendium, sheet);
  const skills = allSkillModifiers(compendium, sheet, homebrew);
  const slots = spellSlots(compendium, sheet);
  const traits = racialTraits(compendium, sheet);
  const features = featuresByLevel(compendium, sheet, homebrew);
  const choices = pendingChoices(compendium, sheet);
  const armorClass = totalArmorClass(compendium, sheet);
  const initiativeBonus = totalInitiativeBonus(compendium, sheet);
  const speed = totalSpeed(compendium, sheet);

  function toggleSkillProficiency(index: string) {
    const proficiencies = sheet.proficiencies || [];
    onPersist({
      ...sheet,
      proficiencies: proficiencies.includes(index)
        ? proficiencies.filter((p) => p !== index)
        : [...proficiencies, index],
    });
  }

  function changeCoreStat(
    key: "acBonus" | "initiativeBonus" | "speedOverride",
    value: number
  ) {
    onPersist({
      ...sheet,
      coreStats: { ...(sheet.coreStats || {}), [key]: value },
    });
  }

  // Only eligible options are OFFERED — the ineligible ones the engine
  // returns are kept out of the picker and explained instead.
  const subclassOptions = eligibleSubclasses(compendium, sheet, homebrew);
  const openSubclasses = subclassOptions.filter((o) => o.eligible);
  const lockedReason = subclassOptions.find((o) => !o.eligible)?.reason;
  const subraceOptions = eligibleSubraces(compendium, sheet, homebrew);
  const spells = eligibleSpells(compendium, sheet);

  // The selected homebrew option, when the pick is one — for the "edit
  // this option" affordance next to the picker.
  const pickedSubrace = homebrew.options.find(
    (o) => o.id === sheet.subraceIndex && !o.deleted
  );
  const pickedSubclass = homebrew.options.find(
    (o) => o.id === sheet.subclassIndex && !o.deleted
  );
  const raceName = sheet.raceIndex
    ? compendium.raceByIndex.get(sheet.raceIndex)?.name
    : undefined;
  const className = sheet.classIndex
    ? compendium.classByIndex.get(sheet.classIndex)?.name
    : undefined;

  return (
    <SimpleBar style={{ maxHeight: "60vh" }}>
      <Box pr={2}>
        <Text sx={{ fontSize: 1, color: "gray", mb: 2 }}>{summary.line}</Text>

        {problems.length > 0 && (
          <Box
            sx={{
              border: "1px solid",
              borderColor: "warning",
              bg: "rgba(202, 135, 30, 0.12)",
              borderRadius: "4px",
              p: 2,
              mb: 3,
            }}
          >
            <Text sx={{ fontSize: 0, fontWeight: "heading", mb: 1 }}>
              Escolhas que não valem mais
            </Text>
            {problems.map((problem) => (
              <Text key={problem} sx={{ fontSize: 0, color: "gray" }}>
                {problem}
              </Text>
            ))}
          </Box>
        )}

        {/* Section title with descending ruler — the
            Divider fill já usado por SettingsModal/InitiativeTrackerModal,
            sublinhado nunca fundo preenchido para a aba ativa. */}
        <Flex
          sx={{
            borderBottom: "1px solid",
            borderColor: "rgba(255, 255, 255, 0.06)",
            mb: 3,
          }}
        >
          <Button
            variant={tab === "character" ? "tabActive" : "tab"}
            onClick={() => setTab("character")}
            aria-pressed={tab === "character"}
          >
            Personagem
          </Button>
          <Button
            variant={tab === "features" ? "tabActive" : "tab"}
            onClick={() => setTab("features")}
            aria-pressed={tab === "features"}
          >
            Habilidades
          </Button>
        </Flex>

        {tab === "character" && (
          <>
        <Flex sx={{ gap: 2, mb: 3 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Label sx={{ fontSize: 0 }}>Raça</Label>
            <Select
              value={sheet.raceIndex || ""}
              disabled={!canEdit}
              onChange={(e) => onChangeRace(e.target.value)}
            >
              <option value="">—</option>
              {compendium.races.map((race) => (
                <option key={race.index} value={race.index}>
                  {race.name}
                </option>
              ))}
            </Select>
          </Box>
          {sheet.raceIndex && (
            <Box sx={{ flexGrow: 1 }}>
              <Label sx={{ fontSize: 0 }}>Sub-raça</Label>
              <Select
                value={sheet.subraceIndex || ""}
                disabled={!canEdit}
                onChange={(e) =>
                  onPersist({ ...sheet, subraceIndex: e.target.value || undefined })
                }
              >
                <option value="">—</option>
                {subraceOptions.map((option) => (
                  <option key={option.index} value={option.index}>
                    {option.name}
                    {option.source === "table" ? " (da Mesa)" : ""}
                  </option>
                ))}
              </Select>
              {/* The SRD ships one subrace per race, so an empty or
                  one-item list is the norm, not a bug — say so, and offer
                  the fix right here instead of leaving the player to
                  wonder where Drow went. */}
              <Text sx={{ fontSize: 0, color: "gray", mt: 1 }}>
                {subraceOptions.length === 0
                  ? "O SRD não traz sub-raças para esta raça."
                  : `${subraceOptions.length} opç${
                      subraceOptions.length === 1 ? "ão" : "ões"
                    } — o SRD livre traz poucas.`}
              </Text>
              {canEdit && raceName && (
                <Flex sx={{ gap: 2, mt: 1 }}>
                  <Button
                    variant="secondary"
                    sx={{ fontSize: 0, py: 1 }}
                    onClick={() =>
                      onCreateOption("subrace", sheet.raceIndex!, raceName)
                    }
                  >
                    + Sub-raça da Mesa
                  </Button>
                  {pickedSubrace && canEditOption(pickedSubrace) && (
                    <Button
                      variant="secondary"
                      sx={{ fontSize: 0, py: 1 }}
                      onClick={() => onEditOption(pickedSubrace)}
                    >
                      Editar {pickedSubrace.name}
                    </Button>
                  )}
                </Flex>
              )}
            </Box>
          )}
        </Flex>

        <Flex sx={{ gap: 2, mb: 3 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Label sx={{ fontSize: 0 }}>Classe</Label>
            <Select
              value={sheet.classIndex || ""}
              disabled={!canEdit}
              onChange={(e) => onChangeClass(e.target.value)}
            >
              <option value="">—</option>
              {compendium.classes.map((klass) => (
                <option key={klass.index} value={klass.index}>
                  {klass.name}
                </option>
              ))}
            </Select>
          </Box>
          <Box sx={{ width: "90px" }}>
            <Label sx={{ fontSize: 0 }}>Nível</Label>
            <Select
              value={String(sheet.level ?? 1)}
              disabled={!canEdit}
              onChange={(e) =>
                onPersist({ ...sheet, level: Number(e.target.value) })
              }
            >
              {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          </Box>
        </Flex>

        {sheet.classIndex && (
          <Box mb={3}>
            <Label sx={{ fontSize: 0 }}>Subclasse</Label>
            {openSubclasses.length > 0 ? (
              <Select
                value={sheet.subclassIndex || ""}
                disabled={!canEdit}
                onChange={(e) =>
                  onPersist({
                    ...sheet,
                    subclassIndex: e.target.value || undefined,
                    // A subclass change can strip spells and features that
                    // only that subclass granted; the engine reports them
                    // rather than this dropping them behind the player's
                    // back.
                  })
                }
              >
                <option value="">—</option>
                {openSubclasses.map((option) => (
                  <option key={option.index} value={option.index}>
                    {option.name}
                    {option.source === "table" ? " (da Mesa)" : ""}
                  </option>
                ))}
              </Select>
            ) : (
              <Text sx={{ fontSize: 0, color: "gray" }}>
                {lockedReason ||
                  `Disponível a partir do nível ${
                    subclassLevel(compendium, sheet.classIndex) ?? "?"
                  }`}
              </Text>
            )}
            {/* One printed subclass per class is all the SRD has, so the
                Mesa's own are the normal way to get the rest. */}
            {canEdit && className && (
              <Flex sx={{ gap: 2, mt: 1 }}>
                <Button
                  variant="secondary"
                  sx={{ fontSize: 0, py: 1 }}
                  onClick={() =>
                    onCreateOption("subclass", sheet.classIndex!, className)
                  }
                >
                  + Subclasse da Mesa
                </Button>
                {pickedSubclass && canEditOption(pickedSubclass) && (
                  <Button
                    variant="secondary"
                    sx={{ fontSize: 0, py: 1 }}
                    onClick={() => onEditOption(pickedSubclass)}
                  >
                    Editar {pickedSubclass.name}
                  </Button>
                )}
              </Flex>
            )}
          </Box>
        )}

        {/* Section titles with descending ruler,
            mesmo `Divider fill` que SettingsModal/InitiativeTrackerModal
            já usam — nunca uma linha cheia de borda, que não é a
            convenção deste repo. */}
        <Divider fill sx={{ my: 2 }} />
        <Label sx={{ fontSize: 0 }}>Atributos</Label>
        <Flex sx={{ flexWrap: "wrap", gap: 1, mb: 1 }}>
          {abilities.map((ability) => (
            <Box key={ability.key} sx={{ width: "70px" }}>
              <Text sx={{ fontSize: 0, color: "gray" }}>
                {ability.label}
                {saves.includes(ability.key as AbilityKey) ? " ●" : ""}
              </Text>
              <Input
                type="number"
                min={1}
                max={30}
                value={sheet.abilities?.[ability.key] ?? 10}
                disabled={!canEdit}
                sx={{ p: 1, fontSize: 1 }}
                onChange={(e) =>
                  onPersist({
                    ...sheet,
                    abilities: {
                      ...(sheet.abilities || {}),
                      [ability.key]: Number(e.target.value),
                    },
                  })
                }
              />
              <Text sx={{ fontSize: 0, color: "gray", textAlign: "center" }}>
                {ability.total} ({ability.modifierText})
              </Text>
            </Box>
          ))}
        </Flex>
        <Text sx={{ fontSize: 0, color: "gray", mb: 3 }}>
          ● = proficiente em salvaguarda. O bônus racial já está somado ao total.
        </Text>

        {/* Core Stats: CA, bônus de iniciativa e
            deslocamento como campos EDITÁVEIS — mas sobre um AJUSTE
            opcional por cima do valor derivado (types/CharacterSheet.ts's
            coreStats), nunca substituindo o cálculo. Contagem exata ->
            <Input type="number">, nunca slider, lido por valueAsNumber com
            guarda de NaN (convenção já fixada em TokenLightModal). */}
        <Divider fill sx={{ my: 2 }} />
        <Label sx={{ fontSize: 0 }}>Core Stats</Label>
        <Flex sx={{ gap: 2, mb: 1 }}>
          <Box sx={{ width: "90px" }}>
            <Text sx={{ fontSize: 0, color: "gray" }}>CA</Text>
            <Input
              type="number"
              disabled={!canEdit}
              sx={{ p: 1, fontSize: 1 }}
              value={armorClass}
              onChange={(e) => {
                const parsed = e.target.valueAsNumber;
                if (Number.isFinite(parsed)) {
                  changeCoreStat(
                    "acBonus",
                    (sheet.coreStats?.acBonus ?? 0) +
                      (parsed - armorClass)
                  );
                }
              }}
            />
          </Box>
          <Box sx={{ width: "90px" }}>
            <Text sx={{ fontSize: 0, color: "gray" }}>Iniciativa</Text>
            <Input
              type="number"
              disabled={!canEdit}
              sx={{ p: 1, fontSize: 1 }}
              value={initiativeBonus}
              onChange={(e) => {
                const parsed = e.target.valueAsNumber;
                if (Number.isFinite(parsed)) {
                  changeCoreStat(
                    "initiativeBonus",
                    (sheet.coreStats?.initiativeBonus ?? 0) +
                      (parsed - initiativeBonus)
                  );
                }
              }}
            />
          </Box>
          <Box sx={{ width: "90px" }}>
            <Text sx={{ fontSize: 0, color: "gray" }}>Deslocamento</Text>
            <Input
              type="number"
              disabled={!canEdit}
              sx={{ p: 1, fontSize: 1 }}
              value={speed}
              onChange={(e) => {
                const parsed = e.target.valueAsNumber;
                if (Number.isFinite(parsed)) {
                  changeCoreStat("speedOverride", parsed);
                }
              }}
            />
          </Box>
        </Flex>
        <Text sx={{ fontSize: 0, color: "gray", mb: 3 }}>
          CA e Iniciativa somam um ajuste ao valor derivado (classe/raça
          continuam valendo); Deslocamento substitui a base racial
          diretamente.
        </Text>

        <Flex sx={{ gap: 3, mb: 3 }}>
          <Stat label="CA" value={armorClass} />
          <Stat label="PV máx." value={summary.maxHitPoints} />
          <Stat label="Proficiência" value={`+${summary.proficiencyBonus}`} />
        </Flex>

        {/* The 18 perícias com bolinha de proficiência
            e modificador calculado — a ESCOLHA mora em
            `sheet.proficiencies` (o mesmo campo que o passo de
            class-proficiency-choice acima já escreve), o modificador é
            SEMPRE derivado na leitura (5e/characterSheet.ts's
            allSkillModifiers). */}
        <Divider fill sx={{ my: 2 }} />
        <Label sx={{ fontSize: 0 }}>Perícias</Label>
        <Flex sx={{ flexWrap: "wrap", gap: 1, mb: 3 }}>
          {skills.map((skill) => (
            <Button
              key={skill.index}
              type="button"
              disabled={!canEdit}
              onClick={() => toggleSkillProficiency(skill.index)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                width: "calc(50% - 4px)",
                textAlign: "left",
                color: "text",
                bg: "transparent",
                border: "none",
                borderRadius: "4px",
                fontFamily: "body",
                fontSize: 0,
                px: 1,
                py: 1,
                "&:hover": {
                  bg: "rgba(255, 255, 255, 0.06)",
                  cursor: canEdit ? "pointer" : "default",
                },
                "&:focus": { outline: "none" },
                "&:disabled": { opacity: 1, cursor: "default" },
              }}
            >
              <Box
                sx={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: "1px solid",
                  borderColor: skill.proficient ? "primary" : "gray",
                  bg: skill.proficient ? "primary" : "transparent",
                }}
              />
              <Text as="span" sx={{ flexGrow: 1, minWidth: 0 }}>
                {skill.label}
              </Text>
              <Text as="span" sx={{ color: "gray", flexShrink: 0 }}>
                {skill.modifierText}
              </Text>
            </Button>
          ))}
        </Flex>
          </>
        )}

        {tab === "features" && (
          <>
        {slots.length > 0 && (
          <Box mb={3}>
            <Label sx={{ fontSize: 0 }}>Espaços de magia</Label>
            <Text sx={{ fontSize: 1 }}>
              {slots.map((s) => `${s.level}º: ${s.slots}`).join("  ·  ")}
            </Text>
          </Box>
        )}

        {choices.map((choice) => (
          <Box key={choice.key} mb={3}>
            <Label sx={{ fontSize: 0 }}>
              {choice.source} — escolha {choice.choose}
            </Label>
            {choice.options.length === 0 ? (
              <Text sx={{ fontSize: 0, color: "gray" }}>{choice.desc}</Text>
            ) : (
              <Flex sx={{ flexWrap: "wrap", gap: 1 }}>
                {choice.options.map((option) => {
                  const selected = choice.chosen.includes(option.index);
                  return (
                    <Button
                      key={option.index}
                      type="button"
                      variant={selected ? "outlineActive" : "primary"}
                      disabled={!canEdit}
                      sx={{ fontSize: 0, py: 1, px: 2 }}
                      onClick={() =>
                        onToggleChoice(choice.key, option.index, choice.choose)
                      }
                    >
                      {option.name}
                    </Button>
                  );
                })}
              </Flex>
            )}
          </Box>
        ))}

        {spells.length > 0 && (
          <Box mb={3}>
            <Label sx={{ fontSize: 0 }}>
              Magias disponíveis ({(sheet.spells || []).length} conhecidas)
            </Label>
            <SimpleBar style={{ maxHeight: "160px" }}>
              <Flex sx={{ flexWrap: "wrap", gap: 1, pr: 2 }}>
                {spells.map((spell) => {
                  const known = (sheet.spells || []).includes(spell.index);
                  return (
                    <Button
                      key={spell.index}
                      type="button"
                      variant={known ? "outlineActive" : "primary"}
                      disabled={!canEdit}
                      sx={{ fontSize: 0, py: 1, px: 2 }}
                      onClick={() => onToggleSpell(spell.index)}
                    >
                      {spell.name}
                      <Text as="span" sx={{ opacity: 0.7 }}>
                        {" "}
                        {spell.level === 0 ? "truque" : `${spell.level}º`}
                      </Text>
                    </Button>
                  );
                })}
              </Flex>
            </SimpleBar>
          </Box>
        )}

        {traits.length > 0 && (
          <Box mb={3}>
            <Label sx={{ fontSize: 0 }}>Traços raciais</Label>
            {traits.map((trait) => (
              <Box key={trait.index} mb={2}>
                {trait.desc.map((paragraph, index) => (
                  <Text key={index} as="p" sx={{ fontSize: 0 }}>
                    {index === 0 && <b>{trait.name}. </b>}
                    {paragraph}
                  </Text>
                ))}
              </Box>
            ))}
          </Box>
        )}

        {features.length > 0 && (
          <Box mb={3}>
            <Label sx={{ fontSize: 0 }}>Habilidades de classe</Label>
            {features.map((group) => (
              <Box key={group.level} mb={1}>
                <Text sx={{ fontSize: 0, color: "gray" }}>
                  Nível {group.level}
                </Text>
                {group.features.map((feature) => (
                  <Box key={feature.name} mb={2}>
                    <Text as="p" sx={{ fontSize: 0, fontWeight: "heading" }}>
                      {feature.name}
                    </Text>
                    {feature.desc.map((paragraph, index) => (
                      <Text key={index} as="p" sx={{ fontSize: 0 }}>
                        {paragraph}
                      </Text>
                    ))}
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        )}

        <Label sx={{ fontSize: 0 }}>Anotações</Label>
        <Textarea
          rows={3}
          value={notesDraft}
          disabled={!canEdit}
          sx={{ fontSize: 1, mb: 2 }}
          onChange={(e) => setNotesDraft(e.target.value)}
          // Persisted on blur, not per keystroke: editCharacterLocally
          // enqueues a sync op, and one op per typed character would flood
          // the outbox with edits nobody asked for.
          onBlur={() => {
            if (notesDraft !== (sheet.notes || "")) {
              onPersist({ ...sheet, notes: notesDraft });
            }
          }}
        />
          </>
        )}

        {isSaving && (
          <Text sx={{ fontSize: 0, color: "gray" }}>Salvando…</Text>
        )}
        {!canEdit && (
          <Text sx={{ fontSize: 0, color: "gray" }}>
            Somente leitura: esta ficha não é sua.
          </Text>
        )}
      </Box>
    </SimpleBar>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Box>
      <Text sx={{ fontSize: 0, color: "gray" }}>{label}</Text>
      <Text sx={{ fontSize: 2 }}>{value}</Text>
    </Box>
  );
}

export default CharacterSheetModal;
