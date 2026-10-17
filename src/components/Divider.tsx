import { Divider, DividerProps } from "theme-ui";

type StyledDividerProps = DividerProps & {
  vertical?: boolean;
  fill?: boolean;
};

function sizeFor(fill: boolean): string {
  return fill ? "100%" : "24px";
}

function axisDimensions(vertical: boolean, fill: boolean) {
  const length = sizeFor(fill);
  if (vertical) {
    return { width: "2px", height: length };
  }
  return { width: length, height: "2px" };
}

function StyledDivider(props: StyledDividerProps) {
  const { vertical = false, color = "text", fill = false, ...rest } = props;
  const dimensions = axisDimensions(vertical, fill);

  return (
    <Divider
      bg={color}
      mx={vertical ? 2 : 0}
      my={vertical ? 0 : 2}
      sx={{ opacity: 0.5, borderRadius: "2px", ...dimensions }}
      {...rest}
    />
  );
}

export default StyledDivider;
