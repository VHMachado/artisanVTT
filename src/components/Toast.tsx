import type { ReactNode } from "react";
import { AppearanceTypes, ToastProvider as DefaultToastProvider } from "react-toast-notifications";
import { Box, Text } from "theme-ui";

function toastFill(appearance: AppearanceTypes) {
  const palette: Partial<Record<AppearanceTypes, string>> = { error: "highlight", warning: "secondary", success: "primary" };
  return palette[appearance] ?? "overlay";
}

function CustomToast({ appearance, children }: { appearance: AppearanceTypes; children: ReactNode }) {
  return <Box bg={toastFill(appearance)} m={2} mb={0} sx={{ borderRadius: "4px", padding: "12px 16px" }}><Text as="p" variant="body2">{children}</Text></Box>;
}

const TOAST_COMPONENTS = { Toast: CustomToast };

export function ToastProvider({ children }: { children?: ReactNode }) {
  return <DefaultToastProvider autoDismiss autoDismissTimeout={2000} components={TOAST_COMPONENTS} placement="bottom-center">{children}</DefaultToastProvider>;
}
