import { Box, Divider, Flex, Image, Text } from "theme-ui";

import { useAssetPreviewURL } from "../../hooks/useAssetPreviewURL";

import {
  abilityScores,
  armorClassText,
  challengeRatingText,
  listText,
  savingThrowsText,
  sensesText,
  signed,
  skillsText,
  speedText,
  typeLine,
  usageText,
} from "../../5e/monsterFormat";

import type { Monster, MonsterAction } from "../../types/Monster";

type MonsterStatBlockProps = {
  monster: Monster;
  /** "Perfil" image for a homebrew/derived creature
   * (types/TableMonster.ts's portraitAssetId) — undefined for every SRD
   * row, which never carries uploaded art. */
  portraitAssetId?: string;
  /** Curated global art for an SRD monster (5e/monsterArt.ts),
   * shown only when there's no per-Mesa portraitAssetId overlay — a GM's
   * own uploaded art always wins over the shipped default. */
  globalArtUrl?: string;
};

/**
 * A 5e stat block, rendered from the vendored SRD data ("Abrir fichas de
 * jogadores e de monstros durante a sessão, para consulta
 * rápida").
 *
 * Presentation only — every string comes from 5e/monsterFormat.ts, which is
 * unit-tested on its own, so this file has no formatting logic to get wrong.
 * Colours/typography stay on DESIGN.md tokens: `primary` (dourado) appears
 * only as the two thin section rules, never as text, matching the spec's
 * "cor de detalhe, nunca de texto corrido".
 */
function MonsterStatBlock({ monster, portraitAssetId, globalArtUrl }: MonsterStatBlockProps) {
  const saves = savingThrowsText(monster.proficiencies);
  const skills = skillsText(monster.proficiencies);

  return (
    <Box>
      {portraitAssetId ? (
        <MonsterPortrait assetId={portraitAssetId} />
      ) : (
        globalArtUrl && <MonsterPortraitImage src={globalArtUrl} />
      )}
      <Text as="h2" variant="heading" sx={{ fontSize: 3 }}>
        {monster.name}
      </Text>
      <Text as="p" variant="caption" sx={{ fontStyle: "italic" }}>
        {typeLine(monster)}
      </Text>

      <GoldRule />

      <StatLine label="Armor Class" value={armorClassText(monster.armor_class)} />
      <StatLine
        label="Hit Points"
        value={`${monster.hit_points} (${
          monster.hit_points_roll || monster.hit_dice
        })`}
      />
      <StatLine label="Speed" value={speedText(monster.speed)} />

      <GoldRule />

      <Flex sx={{ flexWrap: "wrap", gap: 2 }} my={2}>
        {abilityScores(monster).map((ability) => (
          <Flex
            key={ability.label}
            sx={{ flexDirection: "column", alignItems: "center", minWidth: "44px" }}
          >
            <Text variant="labelCaps">{ability.label}</Text>
            <Text variant="body2">
              {ability.score} ({ability.modifier})
            </Text>
          </Flex>
        ))}
      </Flex>

      <GoldRule />

      {saves && <StatLine label="Saving Throws" value={saves} />}
      {skills && <StatLine label="Skills" value={skills} />}
      {monster.damage_vulnerabilities.length > 0 && (
        <StatLine
          label="Damage Vulnerabilities"
          value={listText(monster.damage_vulnerabilities)}
        />
      )}
      {monster.damage_resistances.length > 0 && (
        <StatLine
          label="Damage Resistances"
          value={listText(monster.damage_resistances)}
        />
      )}
      {monster.damage_immunities.length > 0 && (
        <StatLine
          label="Damage Immunities"
          value={listText(monster.damage_immunities)}
        />
      )}
      {monster.condition_immunities.length > 0 && (
        <StatLine
          label="Condition Immunities"
          value={listText(monster.condition_immunities.map((c) => c.name))}
        />
      )}
      <StatLine label="Senses" value={sensesText(monster.senses)} />
      <StatLine label="Languages" value={monster.languages || "—"} />
      <StatLine
        label="Challenge"
        value={`${challengeRatingText(monster.challenge_rating)} (${monster.xp.toLocaleString(
          "en-US"
        )} XP)`}
      />
      <StatLine
        label="Proficiency Bonus"
        value={signed(monster.proficiency_bonus)}
      />

      <GoldRule />

      {monster.desc && (
        <Text as="p" variant="body2" mb={2}>
          {monster.desc}
        </Text>
      )}

      <ActionSection actions={monster.special_abilities} />
      <ActionSection title="Actions" actions={monster.actions} />
      <ActionSection title="Reactions" actions={monster.reactions} />
      <ActionSection
        title="Legendary Actions"
        actions={monster.legendary_actions}
      />
    </Box>
  );
}

/**
 * The two horizontal rules of a printed stat block. `primary` (dourado) as
 * a 1px rule is exactly DESIGN.md's sanctioned use of the accent — pointer,
 * not fill.
 */
function GoldRule() {
  return <Divider sx={{ my: 2, borderColor: "primary", opacity: 0.6 }} />;
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <Text as="p" variant="body2" sx={{ lineHeight: "body2" }}>
      <Text as="span" sx={{ fontWeight: "heading" }}>
        {label}
      </Text>{" "}
      {value}
    </Text>
  );
}

/**
 * `special_abilities` renders with no heading (matching the printed block,
 * where traits sit directly under the rule); the other three carry theirs.
 */
function ActionSection({
  title,
  actions,
}: {
  title?: string;
  actions?: MonsterAction[];
}) {
  if (!actions || actions.length === 0) {
    return null;
  }
  return (
    <Box mb={2}>
      {title && (
        <>
          <Text as="h3" variant="heading" sx={{ fontSize: 2 }} mt={2}>
            {title}
          </Text>
          <Divider sx={{ mt: 1, mb: 2, borderColor: "primary", opacity: 0.4 }} />
        </>
      )}
      {actions.map((action) => {
        const usage = usageText(action);
        return (
          <Text as="p" variant="body2" key={action.name} mb={2}>
            <Text as="span" sx={{ fontWeight: "heading", fontStyle: "italic" }}>
              {action.name}
              {usage && ` (${usage})`}.
            </Text>{" "}
            {action.desc}
          </Text>
        );
      })}
    </Box>
  );
}

export default MonsterStatBlock;

/** Fetches and shows a homebrew/derived creature's "Perfil" image,
 * authenticated straight from the broker's asset store (same treatment as
 * CharacterPortrait — never blocks rendering the rest of the stat block
 * if the fetch fails offline/unreachable). */
function MonsterPortrait({ assetId }: { assetId: string }) {
  const url = useAssetPreviewURL(assetId);

  if (!url) {
    return null;
  }

  return <MonsterPortraitImage src={url} />;
}

/** Shared "Perfil" image chrome for both the per-Mesa overlay
 * (MonsterPortrait above, an authenticated broker asset) and the global
 * curated SRD art (5e/monsterArt.ts, a plain static URL) — same box,
 * same "contain" letterboxing so neither source ever gets cropped. */
function MonsterPortraitImage({ src }: { src: string }) {
  return (
    <Image
      src={src}
      alt="Perfil"
      mb={2}
      sx={{
        // "contain" (not "cover") so the full uploaded image is always
        // visible, letterboxed rather than cropped when its aspect ratio
        // doesn't match the box — a GM's chosen portrait (e.g. Young
        // Black Dragon) was getting cut off with "cover".
        width: "100%",
        maxHeight: "320px",
        objectFit: "contain",
        borderRadius: "8px",
      }}
    />
  );
}
