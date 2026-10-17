import { IconButton } from "theme-ui";
import { useHistory } from "react-router-dom";

import BackIcon from "../icons/BackIcon";

type BackButtonProps = React.ComponentProps<typeof IconButton>;

function BackButton(props: BackButtonProps) {
  const history = useHistory();

  return (
    <IconButton
      m={1}
      aria-label="Back to Home"
      title="Back to Home"
      onClick={() => history.push("/")}
      {...props}
    >
      <BackIcon />
    </IconButton>
  );
}

export default BackButton;
