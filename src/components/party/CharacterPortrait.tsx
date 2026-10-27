import { Image, Box, ImageProps } from "theme-ui";

import { useAssetPreviewURL } from "../../hooks/useAssetPreviewURL";

import PersonIcon from "../../icons/PersonIcon";

type CharacterPortraitProps = {
  portraitAssetId?: string;
  name: string;
} & Omit<ImageProps, "src">;

/**
 * A Personagem's portrait (types/Character.ts's portraitAssetId), resolved
 * through the shared broker-image hook so it is fetched once and then
 * served from this device (hooks/useAssetPreviewURL.ts ->
 * helpers/brokerAssetCache.ts). Falls back to a generic person icon when
 * there's no portrait and nothing cached yet, same "never block the
 * roster over a missing image" reasoning as helpers/characterToken.ts's
 * token fallback.
 */
function CharacterPortrait({
  portraitAssetId,
  name,
  ...props
}: CharacterPortraitProps) {
  const url = useAssetPreviewURL(portraitAssetId);

  if (!url) {
    return (
      <Box
        title={name}
        aria-label={name}
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "gray",
        }}
      >
        <PersonIcon />
      </Box>
    );
  }

  return <Image src={url} alt={name} title={name} {...props} />;
}

export default CharacterPortrait;
