import ReactSelect, { Props } from "react-select";
import Creatable from "react-select/creatable";
import { useThemeUI } from "theme-ui";

type SelectProps = Props & {
  creatable?: boolean;
};

function Select({ creatable = false, ...selectProps }: SelectProps) {
  const { theme } = useThemeUI();
  const SelectComponent = creatable ? Creatable : ReactSelect;
  const colors = theme.colors;
  const bodyFont = (theme.fonts as any)?.body2;

  const styles = {
    menu: (provided: any, state: any) => ({
      ...provided,
      backgroundColor: colors?.background,
      color: colors?.text,
      borderRadius: "4px",
      borderColor: colors?.gray,
      borderStyle: "solid",
      borderWidth: "1px",
      fontFamily: bodyFont,
      opacity: state.isDisabled ? 0.5 : 1,
    }),
    control: (provided: any, state: any) => ({
      ...provided,
      backgroundColor: "transparent",
      color: colors?.text,
      borderColor: colors?.text,
      opacity: state.isDisabled ? 0.5 : 1,
    }),
    singleValue: (provided: any) => ({ ...provided, color: colors?.text, fontFamily: bodyFont }),
    option: (provided: any, state: any) => ({
      ...provided,
      color: colors?.text,
      opacity: state.isDisabled ? 0.5 : 1,
    }),
    dropdownIndicator: (provided: any, state: any) => ({
      ...provided,
      color: colors?.text,
      ":hover": { color: state.isDisabled ? colors?.disabled : colors?.primary },
    }),
    input: (provided: any, state: any) => ({
      ...provided,
      color: colors?.text,
      opacity: state.isDisabled ? 0.5 : 1,
    }),
    container: (provided: any) => ({ ...provided, margin: "4px 0" }),
  };

  return (
    <SelectComponent
      styles={styles}
      theme={(defaultTheme: any) => ({
        ...defaultTheme,
        colors: {
          ...defaultTheme.colors,
          primary: colors?.primary,
          primary50: colors?.secondary,
          primary25: colors?.highlight,
        },
      })}
      captureMenuScroll={false}
      {...selectProps}
    />
  );
}

export default Select;
