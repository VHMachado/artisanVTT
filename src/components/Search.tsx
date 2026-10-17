import { Box, Input, InputProps } from "theme-ui";

import SearchIcon from "../icons/SearchIcon";

function Search(props: InputProps) {
  const inputSx = {
    border: "none",
    borderRadius: "0",
    borderRight: "1px solid",
    paddingRight: "36px",
    ":focus": { outline: "none" },
  } as const;

  const iconWrapperSx = {
    height: "24px",
    pointerEvents: "none",
    position: "absolute",
    right: "8px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "24px",
  } as const;

  return (
    <Box sx={{ flexGrow: 1, position: "relative" }}>
      <Input placeholder="Search" sx={inputSx} {...props} />
      <Box sx={iconWrapperSx}>
        <SearchIcon />
      </Box>
    </Box>
  );
}

export default Search;
