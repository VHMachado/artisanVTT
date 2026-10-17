import BlendOffIcon from "../../../icons/BlendOffIcon";
import BlendOnIcon from "../../../icons/BlendOnIcon";
import CutOffIcon from "../../../icons/FogCutOffIcon";
import CutOnIcon from "../../../icons/FogCutOnIcon";
import MultilayerOffIcon from "../../../icons/FogMultilayerOffIcon";
import MultilayerOnIcon from "../../../icons/FogMultilayerOnIcon";
import PreviewOffIcon from "../../../icons/FogPreviewOffIcon";
import PreviewOnIcon from "../../../icons/FogPreviewOnIcon";
import ShapeFillOffIcon from "../../../icons/ShapeFillOffIcon";
import ShapeFillOnIcon from "../../../icons/ShapeFillOnIcon";
import ToolToggle from "./ToolToggle";

type RequiredToggleProps = {
  useBlending: boolean;
  onBlendingChange: (useBlending: boolean) => void;
};

export function AlphaBlendToggle({
  useBlending,
  onBlendingChange,
}: RequiredToggleProps) {
  return (
    <ToolToggle
      active={useBlending}
      onChange={onBlendingChange}
      enableLabel="Enable Blending (O)"
      disableLabel="Disable Blending (O)"
      enabledIcon={<BlendOnIcon />}
      disabledIcon={<BlendOffIcon />}
    />
  );
}

type ShapeFillToggleProps = {
  useShapeFill: boolean;
  onShapeFillChange: (useShapeFill: boolean) => void;
};

export function ShapeFillToggle({
  useShapeFill,
  onShapeFillChange,
}: ShapeFillToggleProps) {
  return (
    <ToolToggle
      active={useShapeFill}
      onChange={onShapeFillChange}
      enableLabel="Enable Shape Fill (G)"
      disableLabel="Disable Shape Fill (G)"
      enabledIcon={<ShapeFillOnIcon />}
      disabledIcon={<ShapeFillOffIcon />}
    />
  );
}

type FogPreviewToggleProps = {
  useFogPreview: boolean;
  onFogPreviewChange: (useFogPreview: boolean) => void;
};

export function FogPreviewToggle({
  useFogPreview,
  onFogPreviewChange,
}: FogPreviewToggleProps) {
  return (
    <ToolToggle
      active={useFogPreview}
      onChange={onFogPreviewChange}
      enableLabel="Enable Fog Preview (F)"
      disableLabel="Disable Fog Preview (F)"
      enabledIcon={<PreviewOnIcon />}
      disabledIcon={<PreviewOffIcon />}
    />
  );
}

type FogCutToggleProps = {
  useFogCut: boolean;
  onFogCutChange: (useFogCut: boolean) => void;
  disabled?: boolean;
};

export function FogCutToggle({
  useFogCut,
  onFogCutChange,
  disabled,
}: FogCutToggleProps) {
  return (
    <ToolToggle
      active={useFogCut}
      disabled={disabled}
      onChange={onFogCutChange}
      enableLabel="Enable Fog Cutting (C)"
      disableLabel="Disable Fog Cutting (C)"
      enabledIcon={<CutOnIcon />}
      disabledIcon={<CutOffIcon />}
    />
  );
}

type MultilayerToggleProps = {
  multilayer: boolean;
  onMultilayerChange: (multilayer: boolean) => void;
  disabled?: boolean;
};

export function MultilayerToggle({
  multilayer,
  onMultilayerChange,
  disabled,
}: MultilayerToggleProps) {
  return (
    <ToolToggle
      active={multilayer}
      disabled={disabled}
      onChange={onMultilayerChange}
      enableLabel="Enable Multilayer (L)"
      disableLabel="Disable Multilayer (L)"
      enabledIcon={<MultilayerOnIcon />}
      disabledIcon={<MultilayerOffIcon />}
    />
  );
}
