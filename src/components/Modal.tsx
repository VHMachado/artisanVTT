import React, { ReactChild } from "react";
import Modal, { Props } from "react-modal";
import { animated, config, useSpring } from "react-spring";
import { Close, useThemeUI } from "theme-ui";
import CSS from "csstype";

type ModalProps = Props & {
  children: ReactChild | ReactChild[];
  allowClose?: boolean;
};

function dialogStyle(surfaceColor: CSS.Property.Color, override?: Props["style"]) {
  return {
    overlay: {
      alignItems: "center",
      backgroundColor: "rgba(0, 0, 0, 0.73)",
      display: "flex",
      justifyContent: "center",
      // Precisa ficar ACIMA de Popover/ContextMenu (zIndex 200): o
      // SettingsModal vive dentro de um Popover ancorado no dock (ver
      // MapDock.tsx) e abre estes modais (Importar/Exportar, Backup no
      // servidor, confirmação de apagar) por cima dele sem fechá-lo —
      // com um zIndex mais baixo, o modal renderizava visualmente
      // ATRÁS do próprio Popover de Configurações ainda montado,
      // tornando seus botões inclicáveis (bug reportado 2026-10-25).
      // Abaixo do zIndex 2000 do Banner (avisos de sistema sempre no
      // topo, ver components/banner/Banner.tsx), que é intencional.
      zIndex: 1000,
      ...(override?.overlay || {}),
    },
    content: {
      backgroundColor: surfaceColor,
      bottom: "initial",
      left: "initial",
      maxHeight: "100%",
      right: "initial",
      top: "initial",
      ...(override?.content || {}),
    } as React.CSSProperties,
  };
}

function suppressDragWhileOpen(event: React.DragEvent) {
  // A modal above the map must not let the global image-drop listener react
  // to a drag that started over it.
  event.preventDefault();
  event.stopPropagation();
}

function OverlayWithoutDrag(
  props: React.HTMLAttributes<HTMLDivElement>,
  content: React.ReactNode
) {
  return (
    <div {...props} onDragEnter={suppressDragWhileOpen}>
      {content}
    </div>
  );
}

function StyledModal({
  allowClose = true,
  children,
  isOpen,
  onRequestClose,
  style = {},
  ...rest
}: ModalProps) {
  const { theme } = useThemeUI();
  const entrance = useSpring({
    config: config.default,
    opacity: isOpen ? 1 : 0,
    transform: isOpen ? "scale(1)" : "scale(0.99)",
  });

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={dialogStyle(theme.colors?.surface as CSS.Property.Color, style)}
      contentElement={(props, content) => (
        <animated.div {...props} style={{ ...props.style, ...entrance }}>
          {content}
        </animated.div>
      )}
      overlayElement={OverlayWithoutDrag}
      {...rest}
    >
      {children}
      {allowClose && (
        <Close m={0} onClick={onRequestClose} sx={{ position: "absolute", right: 0, top: 0 }} />
      )}
    </Modal>
  );
}

export default StyledModal;
