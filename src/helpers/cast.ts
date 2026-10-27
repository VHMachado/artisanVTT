/**
 * "Transmitir Espectador" opens the OS's native wireless-display
 * (Miracast) device picker, reached here via the Wails-bound Go method
 * `OpenWirelessDisplayPicker` (desktop/main.go) — never a third-party Cast
 * SDK, and never a browser tab: Miracast has nothing to do with a web
 * page, so this always runs from THIS process (the .exe).
 *
 * On Windows this opens the same panel Win+K does
 * (`ms-settings-connectabledevices:devicediscovery`). On Linux it shells
 * out to `gnome-network-displays` (GNOME Network Displays — Miracast and
 * Chromecast screencasting, the de facto tool since no desktop
 * environment ships a native panel for this) — see
 * `wirelessDisplayPickerCommand`'s comment in desktop/main.go for how
 * that got provisioned on this deployment's target machine.
 *
 * There is no Google Cast Web Sender integration here on purpose: the
 * desktop shell is WebView2/WebKitGTK, neither of which exposes that API
 * (it's Chrome-only), and registering a custom Cast receiver app would
 * only reach Chromecast devices, not the Miracast-only receivers (many
 * smart TVs, Fire TV's Miracast mode, wireless HDMI dongles) this button
 * is meant to reach too — "casting de rede num geral", not Chromecast
 * specifically.
 *
 * Degrades to a thrown Error (caller shows it as a toast) in the web
 * build, or if the native call itself fails for any reason.
 */
export async function openWirelessDisplayPicker(): Promise<void> {
  const openFn = (window as any)?.go?.main?.App?.OpenWirelessDisplayPicker;
  if (typeof openFn !== "function") {
    throw new Error(
      "Transmitir via rede só está disponível no app desktop"
    );
  }
  await openFn();
}
