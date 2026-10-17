import Modal from "react-modal";
import { Close, useThemeUI } from "theme-ui";
import type { RequestCloseEventHandler } from "../../types/Events";
import type CSS from "csstype";

type BannerProps = { isOpen: boolean; onRequestClose: RequestCloseEventHandler; children: React.ReactNode; allowClose?: boolean; backgroundColor?: CSS.Property.Color };

function contentStyle(fill: CSS.Property.Color, allowClose: boolean) {
  return { backgroundColor: fill, border: "none", bottom: "env(safe-area-inset-bottom)", color: "hsl(210, 50%, 96%)", left: "50%", margin: "8px 0", maxWidth: "500px", padding: "8px", paddingRight: allowClose ? "24px" : "8px", right: "initial", top: "initial", transform: "translateX(-50%)" } as React.CSSProperties;
}

function Banner({ allowClose = true, backgroundColor, children, isOpen, onRequestClose }: BannerProps) {
  const { theme } = useThemeUI();
  const fill = backgroundColor ?? (theme.colors?.highlight as CSS.Property.Color);
  return (
    <Modal isOpen={isOpen} onRequestClose={onRequestClose} style={{ content: contentStyle(fill, allowClose), overlay: { bottom: "0", top: "initial", zIndex: 2000 } }}>
      {children}
      {allowClose && <Close m={0} onClick={onRequestClose} sx={{ position: "absolute", right: 0, top: "4px" }} />}
    </Modal>
  );
}
export default Banner;
