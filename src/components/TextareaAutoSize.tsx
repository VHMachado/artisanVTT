import TextareaAutosize, { TextareaAutosizeProps } from "react-textarea-autosize";
import "./TextareaAutoSize.css";
const styledClassName = "textarea-auto-size";
export default function StyledTextareaAutoSize(props: TextareaAutosizeProps) {
  return <TextareaAutosize {...props} className={styledClassName} />;
}
