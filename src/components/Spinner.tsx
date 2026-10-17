import { Box } from "theme-ui";

import spinnerImage from "../images/Loading.png";
import "./Spinner.css";

const spinnerArtworkSx = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  backgroundSize: "contain",
  backgroundImage: `url(${spinnerImage})`,
} as const;

const Spinner = () => (
  <Box className="spinner">
    <Box sx={spinnerArtworkSx} />
  </Box>
);
export default Spinner;
