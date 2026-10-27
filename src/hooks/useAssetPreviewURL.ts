import { useEffect, useState } from "react";

import { brokerAssetObjectURL } from "../helpers/brokerAssetCache";
import { useAccount } from "../contexts/AccountContext";

/**
 * Object URL for either a locally-picked `File` (not yet uploaded) or an
 * already-uploaded broker asset (fetched authenticated, then kept
 * on-device — see helpers/brokerAssetCache.ts, which is what makes these
 * images survive the broker being unreachable). The caller passes only
 * one of the two. Revokes the previous URL on every change and on
 * unmount.
 *
 * The single resolver for every broker-hosted image in the UI: Mesa
 * banners (TableCard), Personagem portraits (CharacterPortrait), and the
 * monster portrait/token-variant thumbnails.
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
      brokerAssetObjectURL(session, assetId).then(
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
