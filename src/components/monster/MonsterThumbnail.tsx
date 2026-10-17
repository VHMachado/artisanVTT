import { Box, Image, BoxProps } from "theme-ui";

import { useAssetPreviewURL } from "../../hooks/useAssetPreviewURL";
import { monsterArtUrl } from "../../5e/monsterArt";

type MonsterThumbnailProps = {
  /** SRD slug (MonsterSummary.index) or homebrew TableMonster id — only
   * an SRD slug has curated global art (5e/monsterArt.ts). */
  index: string;
  /** Per-Mesa overlay/homebrew art (MonsterSummary.portraitAssetId), when
   * one exists — always wins over the shipped global art, same rule as
   * MonsterStatBlock's portraitAssetId-vs-globalArtUrl fallback. */
  portraitAssetId?: string;
  name: string;
} & Omit<BoxProps, "children">;

/**
 * A small square "Perfil" thumbnail for a bestiary row, mirroring
 * CharacterPortrait's 48px treatment on Party's roster (the user's own
 * reference: "igual as imagens do personagem aparecem na aba da
 * esquerda"). Resolves in the same priority MonsterStatBlock uses — a
 * per-Mesa overlay first (authenticated broker asset), the curated global
 * SRD art otherwise — and renders nothing (not even a placeholder icon)
 * when neither exists, since most of the panel's rows are plain-type
 * creatures with no art at all and a placeholder icon on all 334 rows
 * would be noise, not signal.
 */
function MonsterThumbnail({
  index,
  portraitAssetId,
  name,
  sx,
  ...props
}: MonsterThumbnailProps) {
  const overlayUrl = useAssetPreviewURL(portraitAssetId);
  const url = overlayUrl ?? monsterArtUrl(index);

  if (!url) {
    return null;
  }

  return (
    <Box
      sx={{
        width: "36px",
        height: "36px",
        minWidth: "36px",
        borderRadius: "4px",
        overflow: "hidden",
        bg: "muted",
        ...sx,
      }}
      {...props}
    >
      <Image
        src={url}
        alt={name}
        sx={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}

export default MonsterThumbnail;
