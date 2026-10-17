import { useEffect, useState } from "react";
import { Image, Box, ImageProps } from "theme-ui";

import { assetObjectURL } from "../../helpers/assetUpload";
import { useAccount } from "../../contexts/AccountContext";

import PersonIcon from "../../icons/PersonIcon";

type CharacterPortraitProps = {
  portraitAssetId?: string;
  name: string;
} & Omit<ImageProps, "src">;

/**
 * A Personagem's portrait (types/Character.ts's portraitAssetId), fetched
 * straight from the broker's content-addressed asset store —
 * unlike TokenImage's token images, this never lives in the local game's
 * `assets` Dexie table, so it can't reuse useDataURL/useAssetURL, which
 * only know how to look there. Falls back to a generic person icon when
 * there's no portrait or the fetch fails (offline, broker unreachable),
 * same "never block the roster over a missing image" reasoning as
 * helpers/characterToken.ts's token fallback.
 */
function CharacterPortrait({
  portraitAssetId,
  name,
  ...props
}: CharacterPortraitProps) {
  const { session } = useAccount();
  const [url, setUrl] = useState<string | undefined>();

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;
    setUrl(undefined);
    if (portraitAssetId && session) {
      assetObjectURL(session, portraitAssetId).then((loaded) => {
        if (!cancelled) {
          objectUrl = loaded;
          setUrl(loaded);
        } else {
          URL.revokeObjectURL(loaded);
        }
      }, () => undefined);
    }
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [portraitAssetId, session]);

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
