import { ChangeEvent } from "react";
import { Box, Button, Flex, Image, Input, Label, Text } from "theme-ui";

import { useAssetPreviewURL } from "../../hooks/useAssetPreviewURL";

/**
 * The "Imagem de perfil" + "Variações de token" fields, shared by
 * MonsterFormModal (full creature editor) and MonsterArtModal (
 * attach art directly to an SRD monster, no variation detour) — both
 * upload through the exact same broker asset store, so duplicating this
 * JSX would just be two places to keep in sync.
 *
 * Deliberately stateless: the parent owns every value and passes
 * callbacks, matching this file's `Field` convention in MonsterFormModal.
 */
type MonsterArtFieldsProps = {
  portraitAssetId?: string;
  portraitFile?: File;
  removePortrait: boolean;
  onPortraitFileChange: (file: File | undefined) => void;
  onRemovePortrait: () => void;
  existingTokenAssetIds: string[];
  newTokenFiles: File[];
  onAddTokenFiles: (files: File[]) => void;
  onRemoveExistingVariant: (hash: string) => void;
  onRemoveNewVariant: (index: number) => void;
  /** The curated global "Perfil" art this SRD monster already shows
   * when nothing above overrides it (src/5e/monsterArt.ts) — undefined for
   * a monster with no curated art, or when this field editor is used for
   * a homebrew/derived creature (those never have global art). Shown only
   * as a read-only reference so a GM opening "Editar imagens" sees that an
   * image already exists instead of a blank form implying there's none,
   * per the bug this fixes: this modal predates every creature getting a
   * default portrait/token. */
  defaultPortraitUrl?: string;
  /** This SRD monster's curated global TOKEN art variants (public URLs,
   * src/5e/monsterTokenArt.ts) already shown on the map when nothing above
   * overrides them — same read-only "this already exists" purpose as
   * defaultPortraitUrl, one entry per variant. */
  defaultTokenVariantUrls?: string[];
};

function MonsterArtFields({
  portraitAssetId,
  portraitFile,
  removePortrait,
  onPortraitFileChange,
  onRemovePortrait,
  existingTokenAssetIds,
  newTokenFiles,
  onAddTokenFiles,
  onRemoveExistingVariant,
  onRemoveNewVariant,
  defaultPortraitUrl,
  defaultTokenVariantUrls,
}: MonsterArtFieldsProps) {
  const hasOwnPortrait = !removePortrait && Boolean(portraitAssetId || portraitFile);
  const showDefaultPortrait = !hasOwnPortrait && Boolean(defaultPortraitUrl);
  const showDefaultTokenVariants =
    existingTokenAssetIds.length === 0 &&
    newTokenFiles.length === 0 &&
    Boolean(defaultTokenVariantUrls && defaultTokenVariantUrls.length > 0);

  return (
    <>
      <Label htmlFor="monster-portrait" mb={1}>
        Imagem de perfil (opcional)
      </Label>
      <Flex sx={{ alignItems: "center", gap: 2 }} mb={1}>
        {hasOwnPortrait && (
          <PortraitThumbnail
            assetId={portraitFile ? undefined : portraitAssetId}
            file={portraitFile}
          />
        )}
        {showDefaultPortrait && defaultPortraitUrl && (
          <Image
            src={defaultPortraitUrl}
            alt="Imagem padrão"
            sx={{
              width: "40px",
              height: "40px",
              objectFit: "cover",
              borderRadius: "4px",
              flexShrink: 0,
            }}
          />
        )}
        <Input
          id="monster-portrait"
          name="portrait"
          type="file"
          accept="image/jpeg, image/gif, image/png, image/webp"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            onPortraitFileChange(event.target.files?.[0])
          }
          sx={{ flexGrow: 1 }}
        />
        {hasOwnPortrait && (
          <Button type="button" variant="secondary" onClick={onRemovePortrait}>
            Remover
          </Button>
        )}
      </Flex>
      <Text as="p" variant="caption" mb={3}>
        {showDefaultPortrait
          ? "Mostrando a imagem padrão desta criatura. Envie um arquivo para substituí-la."
          : "Mostrada na ficha. Sem imagem, usa a silhueta pelo tipo."}
      </Text>

      <Label mb={1}>Variações de token (opcional)</Label>
      <Flex sx={{ flexWrap: "wrap", gap: 2 }} mb={1}>
        {existingTokenAssetIds.map((hash) => (
          <TokenVariantThumbnail
            key={hash}
            assetId={hash}
            onRemove={() => onRemoveExistingVariant(hash)}
          />
        ))}
        {newTokenFiles.map((file, index) => (
          <TokenVariantThumbnail
            key={`new-${index}-${file.name}`}
            file={file}
            onRemove={() => onRemoveNewVariant(index)}
          />
        ))}
        {showDefaultTokenVariants &&
          defaultTokenVariantUrls!.map((url, index) => (
            <TokenVariantThumbnail key={`default-${index}`} url={url} />
          ))}
      </Flex>
      <Input
        id="monster-token-variants"
        name="tokenVariants"
        type="file"
        accept="image/jpeg, image/gif, image/png, image/webp"
        multiple
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const files = event.target.files;
          if (files) {
            onAddTokenFiles(Array.from(files));
          }
          // Allow picking the same file again after removing it.
          event.target.value = "";
        }}
        mb={1}
      />
      <Text as="p" variant="caption" mb={3}>
        {showDefaultTokenVariants
          ? "Mostrando os tokens padrão desta criatura. Envie arquivos para adicionar outras aparências."
          : "Cada imagem enviada aqui é uma aparência diferente para o mesmo monstro — no mapa, clique direito no token para alternar entre elas."}
      </Text>
    </>
  );
}

/**
 * Shows either a locally-picked file (object URL), an already-uploaded
 * asset (fetched authenticated, same as CharacterPortrait) or a plain
 * static URL (the curated global art) — never more than one of the
 * three, the caller decides which by passing only one of
 * `file`/`assetId`/`url`.
 */
export function PortraitThumbnail({
  assetId,
  file,
  url: staticUrl,
}: {
  assetId?: string;
  file?: File;
  url?: string;
}) {
  const fetchedUrl = useAssetPreviewURL(assetId, file);
  const url = staticUrl ?? fetchedUrl;

  if (!url) {
    return null;
  }

  return (
    <Image
      src={url}
      alt="Perfil"
      sx={{
        width: "40px",
        height: "40px",
        objectFit: "cover",
        borderRadius: "4px",
        flexShrink: 0,
      }}
    />
  );
}

/** One square in the "Variações de token" grid — same file/assetId/url
 * duality as PortraitThumbnail, plus an "x" to drop that variant when
 * `onRemove` is given (omitted for a read-only default-art entry, which
 * isn't a stored override and so can't be "removed"). */
export function TokenVariantThumbnail({
  assetId,
  file,
  url: staticUrl,
  onRemove,
}: {
  assetId?: string;
  file?: File;
  url?: string;
  onRemove?: () => void;
}) {
  const fetchedUrl = useAssetPreviewURL(assetId, file);
  const url = staticUrl ?? fetchedUrl;

  return (
    <Box sx={{ position: "relative", width: "48px", height: "48px" }}>
      {url ? (
        <Image
          src={url}
          alt="Variação de token"
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "4px",
          }}
        />
      ) : (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            borderRadius: "4px",
            bg: "rgba(255, 255, 255, 0.06)",
          }}
        />
      )}
      {onRemove && (
        <Button
          type="button"
          variant="secondary"
          onClick={onRemove}
          title="Remover variação"
          aria-label="Remover variação"
          sx={{
            position: "absolute",
            top: "-6px",
            right: "-6px",
            width: "18px",
            height: "18px",
            minWidth: "18px",
            p: 0,
            borderRadius: "50%",
            fontSize: "10px",
            lineHeight: 1,
          }}
        >
          ×
        </Button>
      )}
    </Box>
  );
}

export default MonsterArtFields;
