import { useMedia } from "react-media";

function useResponsiveLayout() {
  const medium = useMedia({ query: "(min-width: 500px)" });
  const large = useMedia({ query: "(min-width: 1500px)" });

  if (large) {
    return {
      screenSize: "large",
      modalSize: "842px",
      tileSize: "small",
      tileGridColumns: 4,
      tileContainerHeight: "600px",
      groupGridColumns: 3,
    };
  }

  if (medium) {
    return {
      screenSize: "medium",
      modalSize: "642px",
      tileSize: "medium",
      tileGridColumns: 3,
      tileContainerHeight: "400px",
      groupGridColumns: 2,
    };
  }

  return {
    screenSize: "small",
    modalSize: "500px",
    tileSize: "large",
    tileGridColumns: 2,
    tileContainerHeight: "400px",
    groupGridColumns: 2,
  };
}

export default useResponsiveLayout;
