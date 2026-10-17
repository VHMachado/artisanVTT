import { Plus } from "lucide-react";

const ICON_SIZE = { normal: 24, large: 32 };

/** glifo do pacote open-source lucide-react (ISC),
 * sem direitos de autor restritivos, no lugar do SVG desenhado à mão. */
function AddIcon(props: { large: boolean }) {
  return <Plus size={props.large ? ICON_SIZE.large : ICON_SIZE.normal} />;
}

AddIcon.defaultProps = { large: false };

export default AddIcon;
