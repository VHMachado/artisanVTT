import { IconButton, IconButtonProps } from "theme-ui";

type RadioIconButtonProps = IconButtonProps & { isSelected: boolean };

// `sx` precisa ser mesclado, não substituído — um caller que passa
// `sx` (o rail da direita, para o círculo uniforme) não pode perder a cor de
// seleção, e o `sx` do caller precisa poder vencer o `color` quando for o
// caso (ver `railButtonSx`).
function mergeSelectionSx(isSelected: boolean, callerSx: IconButtonProps["sx"]) {
  return { color: isSelected ? "primary" : "text", ...callerSx };
}

function RadioIconButton(props: RadioIconButtonProps) {
  const { children, disabled = false, isSelected, sx, title, ...forwarded } = props;
  const resolvedSx = mergeSelectionSx(isSelected, sx);
  return <IconButton {...forwarded} aria-label={title} disabled={disabled} sx={resolvedSx} title={title}>{children}</IconButton>;
}

export default RadioIconButton;
