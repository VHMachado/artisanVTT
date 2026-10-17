import { useEffect, useState } from "react";

import { assetObjectURL } from "../helpers/assetUpload";
import { useAccount } from "../contexts/AccountContext";

/**
 * Object URL for either a locally-picked `File` (not yet uploaded) or an
 * already-uploaded broker asset (fetched authenticated, same treatment as
 * CharacterPortrait) — the caller passes only one of the two. Revokes the
 * previous URL on every change and on unmount. Shared by
 * MonsterFormModal's portrait/token-variant thumbnails and
 * TokenVariantMenu's carousel thumbnails so the fetch-and-revoke dance
 * isn't repeated three times.
 */
export function useAssetPreviewURL(
  assetId?: string,
  file?: File
): string | undefined {
  const { session } = useAccount();
  const [url, setUrl] = useState<string | undefined>();

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;
    setUrl(undefined);
    if (file) {
      objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
    } else if (assetId && session) {
      assetObjectURL(session, assetId).then(
        (loaded) => {
          if (!cancelled) {
            objectUrl = loaded;
            setUrl(loaded);
          } else {
            URL.revokeObjectURL(loaded);
          }
        },
        () => undefined
      );
    }
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [assetId, file, session]);

  return url;
}
