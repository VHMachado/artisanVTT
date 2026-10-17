import { Box, Text } from "theme-ui";

const WRAPPER_STYLE = {
  gridArea: "1 / 1 / span 1 / span 4",
  borderRadius: "2px",
  textAlign: "center" as const,
};

/**
 * Shown instead of a map/token grid whenever the browser refuses
 * IndexedDB entirely — private/incognito windows, exhausted storage
 * quotas, and locked-down embeds all land here. `contexts/DatabaseContext`
 * reports this case as status `"disabled"`: the session keeps working,
 * nothing written during it survives a reload. The caller passes which
 * library is affected ("Mapas" or "Tokens") so one component serves both
 * panels with wording that reads naturally either way.
 */
export default function DatabaseDisabledMessage(props: { type: string }) {
  const libraryName = props.type.toLowerCase();
  const message = [
    `Não foi possível acessar o armazenamento local para ${libraryName}.`,
    "O navegador bloqueou o IndexedDB (comum em modo anônimo ou com",
    "armazenamento desativado) — o app segue utilizável, mas nada feito",
    "agora sobrevive a um recarregamento da página.",
  ].join(" ");

  return (
    <Box bg="highlight" p={1} sx={WRAPPER_STYLE}>
      <Text variant="body2" as="p">
        {message}
      </Text>
    </Box>
  );
}
