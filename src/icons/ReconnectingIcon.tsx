import { RotateCw } from "lucide-react";

import "./ReconnectingIcon.css";

/** glifo do pacote open-source lucide-react (ISC) com
 * giro via CSS, no lugar da animação SVG `<animateTransform>` desenhada à
 * mão. */
function ReconnectingIcon() {
  return <RotateCw size={24} className="reconnecting-icon" />;
}

export default ReconnectingIcon;
