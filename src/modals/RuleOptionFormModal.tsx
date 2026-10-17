import { useEffect, useMemo, useState, FormEvent } from "react";
import { Box, Button, Flex, Input, Label, Text, Textarea } from "theme-ui";
import SimpleBar from "simplebar-react";

import Modal from "../components/Modal";
import ConfirmModal from "./ConfirmModal";

import { useAccount } from "../contexts/AccountContext";
import {
  createRuleOptionLocally,
  editRuleOptionLocally,
  deleteRuleOptionLocally,
} from "../helpers/tablesSync";
import { ABILITY_KEYS, ABILITY_LABELS } from "../5e/characterSheet";

import {
  parseRuleOptionPayload,
  serialiseRuleOptionPayload,
  type HomebrewFeature,
  type RuleOptionKind,
  type RuleOptionPayload,
  type TableRuleOption,
} from "../types/HomebrewOption";
import { RequestCloseEventHandler } from "../types/Events";

type RuleOptionFormModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  tableId: string;
  /** Editing an existing option; omitted when creating one. */
  option?: TableRuleOption;
  /** For a NEW option: what it is and what it hangs off. Both are fixed at
   * creation (the broker refuses to change them), so they're shown as text
   * rather than as pickers. */
  kind?: RuleOptionKind;
  parentIndex?: string;
  parentName?: string;
  /** True when the signed-in account may delete/edit — the author or the
   * Mesa's GM. */
  canDelete?: boolean;
};

const EMPTY_FEATURE: HomebrewFeature = { name: "", desc: "" };

/**
 * Create or edit a subrace/subclass belonging to the Mesa.
 *
 * Why this form exists: the vendored 2014 SRD carries 4 subraces and one
 * subclass per class, so Drow, Wood Elf, College of Valor and the rest —
 * Player's Handbook content, not SRD — can never ship with the app. The app
 * supplies the mechanism; the table types in the options it owns.
 *
 * `kind` and `parentIndex` are deliberately not editable after creation:
 * every ability bonus and feature below was written against that parent, so
 * re-parenting would silently reinterpret all of it (applyRuleOptionOp
 * enforces the same rule server-side).
 */
function RuleOptionFormModal({
  isOpen,
  onRequestClose,
  tableId,
  option,
  kind,
  parentIndex,
  parentName,
  canDelete,
}: RuleOptionFormModalProps) {
  const { session } = useAccount();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [bonuses, setBonuses] = useState<Record<string, string>>({});
  const [features, setFeatures] = useState<HomebrewFeature[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const effectiveKind = option?.kind ?? kind ?? "subrace";
  const isSubclass = effectiveKind === "subclass";

  // Reset from props every time the modal opens, so a previous edit never
  // bleeds into the next one.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const payload = option
      ? parseRuleOptionPayload(option.payload)
      : ({} as RuleOptionPayload);
    setName(option?.name ?? "");
    setDesc(payload.desc ?? "");
    setBonuses(
      Object.fromEntries(
        Object.entries(payload.abilityBonuses ?? {}).map(([k, v]) => [
          k,
          String(v),
        ])
      )
    );
    setFeatures(
      (payload.features ?? []).length
        ? (payload.features as HomebrewFeature[]).map((f) => ({ ...f }))
        : [{ ...EMPTY_FEATURE }]
    );
    setError("");
    setSaving(false);
  }, [isOpen, option]);

  const title = useMemo(() => {
    const what = isSubclass ? "subclasse" : "subraça";
    const parent = option ? undefined : parentName;
    if (option) {
      return `Editar ${what}`;
    }
    return parent ? `Nova ${what} de ${parent}` : `Nova ${what}`;
  }, [isSubclass, option, parentName]);

  function updateFeature(index: number, patch: Partial<HomebrewFeature>) {
    setFeatures((current) =>
      current.map((feature, i) =>
        i === index ? { ...feature, ...patch } : feature
      )
    );
  }

  function buildPayload(): RuleOptionPayload {
    const abilityBonuses: Record<string, number> = {};
    for (const [ability, raw] of Object.entries(bonuses)) {
      const value = parseInt(raw, 10);
      if (!Number.isNaN(value) && value !== 0) {
        abilityBonuses[ability] = value;
      }
    }
    const kept = features
      .filter((feature) => feature.name.trim())
      .map((feature) => {
        const level = feature.level;
        return {
          name: feature.name.trim(),
          desc: feature.desc.trim(),
          // A blank level means "whenever this option applies" — the engine
          // fills in the class's subclass level, so storing a guess here
          // would freeze it against a dataset change.
          ...(isSubclass && level !== undefined && !Number.isNaN(level)
            ? { level }
            : {}),
        };
      });
    const payload: RuleOptionPayload = {};
    if (Object.keys(abilityBonuses).length) {
      payload.abilityBonuses = abilityBonuses;
    }
    if (kept.length) {
      payload.features = kept;
    }
    if (desc.trim()) {
      payload.desc = desc.trim();
    }
    return payload;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Dê um nome à opção.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = serialiseRuleOptionPayload(buildPayload());
      if (option) {
        await editRuleOptionLocally(option.id, { name: trimmed, payload });
      } else {
        if (!session) {
          setError("Entre na sua conta para criar conteúdo da Mesa.");
          setSaving(false);
          return;
        }
        if (!parentIndex) {
          setError("Escolha a raça ou classe de origem.");
          setSaving(false);
          return;
        }
        await createRuleOptionLocally(session, tableId, {
          kind: effectiveKind,
          name: trimmed,
          parentIndex,
          payload,
        });
      }
      onRequestClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!option) {
      return;
    }
    await deleteRuleOptionLocally(option.id, option.tableId);
    setConfirmDelete(false);
    onRequestClose();
  }

  return (
    <Modal isOpen={isOpen} onRequestClose={onRequestClose}>
      <Box
        as="form"
        onSubmit={handleSubmit}
        sx={{ width: "400px", maxWidth: "100%" }}
      >
        <Text as="h2" variant="heading" sx={{ mb: 2 }}>
          {title}
        </Text>
        <Text as="p" variant="caption" sx={{ mb: 3, color: "grey" }}>
          Conteúdo desta Mesa. O SRD livre traz poucas opções, então as
          demais vêm daqui — escreva a partir do seu material.
        </Text>

        <SimpleBar style={{ maxHeight: "50vh" }}>
          <Box sx={{ pr: 2 }}>
            <Label htmlFor="option-name">Nome</Label>
            <Input
              id="option-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isSubclass ? "Colégio da Bravura" : "Drow"}
              mb={2}
            />

            <Label htmlFor="option-desc">Descrição (opcional)</Label>
            <Textarea
              id="option-desc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              mb={3}
            />

            {!isSubclass && (
              <>
                <Label mb={1}>Bônus de atributo</Label>
                <Text as="p" variant="caption" sx={{ mb: 2, color: "grey" }}>
                  Somados aos da raça. Deixe vazio para nenhum.
                </Text>
                <Flex sx={{ flexWrap: "wrap", mb: 3 }}>
                  {ABILITY_KEYS.map((ability) => (
                    <Box key={ability} sx={{ width: "33%", pr: 2, mb: 2 }}>
                      <Label
                        htmlFor={`bonus-${ability}`}
                        sx={{ fontSize: 1 }}
                      >
                        {ABILITY_LABELS[ability]}
                      </Label>
                      <Input
                        id={`bonus-${ability}`}
                        value={bonuses[ability] ?? ""}
                        onChange={(e) =>
                          setBonuses((current) => ({
                            ...current,
                            [ability]: e.target.value,
                          }))
                        }
                        placeholder="—"
                      />
                    </Box>
                  ))}
                </Flex>
              </>
            )}

            <Label mb={1}>
              {isSubclass ? "Habilidades" : "Traços"}
            </Label>
            <Text as="p" variant="caption" sx={{ mb: 2, color: "grey" }}>
              {isSubclass
                ? "Sem nível, a habilidade vale do nível da subclasse em diante."
                : "Valem do nível 1 em diante."}
            </Text>
            {features.map((feature, index) => (
              <Box
                key={index}
                sx={{
                  mb: 2,
                  p: 2,
                  border: "1px solid",
                  borderColor: "border",
                  borderRadius: "4px",
                }}
              >
                <Flex sx={{ alignItems: "flex-end" }}>
                  <Box sx={{ flexGrow: 1, pr: 2 }}>
                    <Label
                      htmlFor={`feature-name-${index}`}
                      sx={{ fontSize: 1 }}
                    >
                      Nome
                    </Label>
                    <Input
                      id={`feature-name-${index}`}
                      value={feature.name}
                      onChange={(e) =>
                        updateFeature(index, { name: e.target.value })
                      }
                    />
                  </Box>
                  {isSubclass && (
                    <Box sx={{ width: "72px" }}>
                      <Label
                        htmlFor={`feature-level-${index}`}
                        sx={{ fontSize: 1 }}
                      >
                        Nível
                      </Label>
                      <Input
                        id={`feature-level-${index}`}
                        value={feature.level ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          updateFeature(index, {
                            level: raw ? parseInt(raw, 10) : undefined,
                          });
                        }}
                        placeholder="—"
                      />
                    </Box>
                  )}
                </Flex>
                <Label
                  htmlFor={`feature-desc-${index}`}
                  sx={{ fontSize: 1, mt: 2 }}
                >
                  Efeito
                </Label>
                <Textarea
                  id={`feature-desc-${index}`}
                  value={feature.desc}
                  onChange={(e) =>
                    updateFeature(index, { desc: e.target.value })
                  }
                  rows={2}
                />
                {features.length > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    sx={{ mt: 2, fontSize: 1 }}
                    onClick={() =>
                      setFeatures((current) =>
                        current.filter((_, i) => i !== index)
                      )
                    }
                  >
                    Remover
                  </Button>
                )}
              </Box>
            ))}
            <Button
              type="button"
              variant="secondary"
              sx={{ mb: 2 }}
              onClick={() =>
                setFeatures((current) => [...current, { ...EMPTY_FEATURE }])
              }
            >
              Adicionar {isSubclass ? "habilidade" : "traço"}
            </Button>
          </Box>
        </SimpleBar>

        {error && (
          <Text as="p" variant="caption" sx={{ color: "highlight", mt: 2 }}>
            {error}
          </Text>
        )}

        <Flex sx={{ mt: 3, alignItems: "center" }}>
          <Button disabled={saving} sx={{ flexGrow: 1 }}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          {option && canDelete && (
            <Button
              type="button"
              variant="secondary"
              sx={{ ml: 2 }}
              onClick={() => setConfirmDelete(true)}
            >
              Excluir
            </Button>
          )}
        </Flex>
        {option?.ownerDisplayName && (
          <Text as="p" variant="caption" sx={{ mt: 2, color: "grey" }}>
            Criada por {option.ownerDisplayName}.
          </Text>
        )}
      </Box>

      <ConfirmModal
        isOpen={confirmDelete}
        onRequestClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        confirmText="Excluir"
        label="Excluir opção"
        description="Fichas que escolheram esta opção passarão a avisar que a escolha não vale mais. Nada é apagado das fichas."
      />
    </Modal>
  );
}

export default RuleOptionFormModal;
