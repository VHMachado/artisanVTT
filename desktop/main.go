package main

import (
	"context"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// The Vite build output is embedded directly into the binary, so the desktop
// app runs with no dev server and no network access.
//
//go:embed all:frontend
var assets embed.FS

// "o botão do olho abre uma segunda instância do Artisan em modo
// de Espectador" — Wails v2 has no built-in multi-window API, so a second
// window is literally a second OS process of this same binary, told which
// Mesa to open (and that it's read-only) via CLI flags read here at
// startup, before wails.Run ever creates a window.
var spectatorGameID = flag.String(
	"spectator",
	"",
	"Game id to open directly in read-only Espectador mode",
)

// Base64 of the calling account's AccountSession JSON (helpers/account.ts),
// so the Espectador process can log itself in with the SAME account
// instead of showing a login form — see the WebviewUserDataPath comment
// below for why this process can't just read the primary window's own
// storage. Never a password: this is the already-issued bearer token plus
// the profile fields the frontend already trusts client-side.
var spectatorSession = flag.String(
	"spectator-session",
	"",
	"Base64-encoded AccountSession JSON for the Espectador window to self-login",
)

// App is bound to the frontend (Bind below) — its exported methods become
// callable from JS as window.go.main.App.<Method>, which
// src/helpers/spectator.ts calls through.
type App struct {
	ctx context.Context
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// OpenSpectatorWindow launches a SECOND process of this same executable
// with --spectator=<gameId> and the caller's own session (base64'd, so it
// survives CLI-argument escaping intact), so the new process starts
// already logged in and inside that Mesa in read-only mode (see
// src/helpers/spectator.ts / routes/Game.tsx's isSpectator gate) instead
// of showing a login form or Home. The original window/process (the
// Mestre's) is completely unaffected — this never touches its own
// camera-follow state, only spawns an independent one.
func (a *App) OpenSpectatorWindow(gameID string, sessionJSON string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	encodedSession := base64.URLEncoding.EncodeToString([]byte(sessionJSON))
	cmd := exec.Command(
		exe,
		"--spectator="+gameID,
		"--spectator-session="+encodedSession,
	)
	return cmd.Start()
}

// GetSpectatorGameID reports the Mesa this PROCESS was launched to
// spectate (empty for a normal launch) — read once at startup by
// src/helpers/spectator.ts to auto-navigate straight into the game in
// spectator mode instead of showing Home.
func (a *App) GetSpectatorGameID() string {
	return *spectatorGameID
}

// GetSpectatorSession returns the decoded AccountSession JSON this process
// was launched with (empty for a normal launch), consumed once at startup
// before the account context loads (see helpers/spectator.ts /
// index.tsx's bootstrap) to self-login without a password prompt.
func (a *App) GetSpectatorSession() string {
	if *spectatorSession == "" {
		return ""
	}
	decoded, err := base64.URLEncoding.DecodeString(*spectatorSession)
	if err != nil {
		return ""
	}
	return string(decoded)
}

// wirelessDisplayPickerCommand builds the command OpenWirelessDisplayPicker
// runs, or an error for any goos the picker isn't wired up for — split out
// from the bound method so a test can exercise the platform gate and the
// exact args without actually spawning a child process (see main_test.go).
//
// Windows: `ms-settings-connectabledevices:devicediscovery` is the
// immersive URI for Settings' "Connect to a wireless display" page — the
// same one Win+K opens — and explorer.exe is how that URI scheme gets
// resolved from a plain child process (ShellExecute-style launch), the
// same trick long-standing AutoHotkey/VBScript community scripts for this
// exact panel use.
//
// Linux has no OS-level equivalent of that panel to shell out to (Plasma
// ships none; even GNOME's own Wi-Fi quick settings don't have one) — the
// de facto tool is GNOME Network Displays (gnome-network-displays), a
// standalone GTK app that discovers Miracast/Chromecast receivers over
// Wi-Fi Direct and streams via the compositor's screencast portal. It
// was AUR-only on Arch, and its dependency chain needed a
// gstreamer/gst-plugins-base-libs version newer than what a stale Arch
// install had pinned (gst-libav, gst-plugin-qml6) — fixed by a full
// `pacman -Syu` followed by building gnome-network-displays from its
// PKGBUILD with makepkg (no AUR helper installed) and enabling
// avahi-daemon for mDNS discovery.
//
// The binary takes no arguments and opens its own GTK picker window —
// same shape as explorer.exe's URI launch above, just a different
// program. Needs to run inside the user's own graphical session (DISPLAY/
// WAYLAND_DISPLAY in its environment) since it's a GUI app, not a
// headless daemon — exec.Command inherits this process's environment by
// default, which is already the Wails app's own graphical session.
func wirelessDisplayPickerCommand(goos string) (*exec.Cmd, error) {
	switch goos {
	case "windows":
		return exec.Command("explorer.exe", "ms-settings-connectabledevices:devicediscovery"), nil
	case "linux":
		return exec.Command("gnome-network-displays"), nil
	default:
		return nil, errors.New("wireless display casting is not available on this platform")
	}
}

// OpenWirelessDisplayPicker opens the OS's native Miracast/wireless-display
// device picker so the user can project this PC's screen (e.g. the
// Espectador window, after OpenSpectatorWindow puts it on screen) to a
// receiver on the local network — a TV, wireless HDMI dongle, or any
// other Miracast-capable target, Chromecast included where it supports
// Miracast. This is OS-level screen mirroring, not a per-window/per-tab
// cast: once the user picks a receiver in the picker, the OS/tool
// projects the display, not a specific app window.
func (a *App) OpenWirelessDisplayPicker() error {
	cmd, err := wirelessDisplayPickerCommand(goruntime.GOOS)
	if err != nil {
		return err
	}
	return cmd.Start()
}

// localMonsterArtRoot resolves (and creates, if missing) the user's local
// override directory for monster art. The default is
// %APPDATA%\Artisan\monster-art-local on Windows, with "token-art/" and
// "portraits/" subdirectories mirroring public/monster-token-art/ and
// public/monster-art/'s own layout — see src/5e/monsterArtLocal.ts for the
// contract this backs (local folder beats the art bundled in the repo,
// loses to a Mesa's own tokenAssetIds/portraitAssetId). This directory
// lives OUTSIDE the repo/build on purpose: it holds the user's actual
// (unlicensed-for-redistribution) Forgotten Adventures/WotC art sets,
// out of git entirely.
//
// The root is no longer hardcoded — a user can point
// it at an existing pack location (e.g. a folder they already use for
// another VTT) via SetLocalMonsterArtRoot, persisted in localArtConfigPath.
// Reading a missing/corrupt config file is never an error — it just means
// "use the default", the same degrade-gracefully contract every other
// piece of this mechanism follows.
func localMonsterArtRoot() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	if custom, ok := readLocalArtRootOverride(configDir); ok {
		return custom, nil
	}
	return defaultLocalMonsterArtRoot(configDir)
}

func defaultLocalMonsterArtRoot(configDir string) (string, error) {
	return filepath.Join(configDir, "Artisan", "monster-art-local"), nil
}

// localArtConfigPath is where SetLocalMonsterArtRoot persists a non-default
// root — a tiny JSON file, never anything shared with the rest of the app's
// settings (those live in the frontend's own IndexedDB).
func localArtConfigPath(configDir string) string {
	return filepath.Join(configDir, "Artisan", "monster-art-local-root.json")
}

type localArtRootConfig struct {
	Root string `json:"root"`
}

// readLocalArtRootOverride reads a previously-set custom root. Returns
// ok=false (never an error) for "no config file yet", malformed JSON, or an
// empty/all-whitespace root — any of those means "fall back to the default",
// not "fail to start".
func readLocalArtRootOverride(configDir string) (string, bool) {
	data, err := os.ReadFile(localArtConfigPath(configDir))
	if err != nil {
		return "", false
	}
	var cfg localArtRootConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return "", false
	}
	root := strings.TrimSpace(cfg.Root)
	if root == "" {
		return "", false
	}
	return root, true
}

// ensureLocalArtSubdirs makes sure root/token-art and root/portraits exist,
// creating them if needed. Every entry point that reads or writes the local
// art folder (scan, import, the asset middleware) calls this first so a
// freshly-chosen or freshly-restored root always has both subdirectories.
func ensureLocalArtSubdirs(root string) error {
	if err := os.MkdirAll(filepath.Join(root, "token-art"), 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(root, "portraits"), 0755); err != nil {
		return err
	}
	return nil
}

// writeFileAtomic writes data to path via a temp file + rename in the
// SAME directory, so a crash/power-loss mid-write never leaves a
// half-written config file behind (the same atomic-write convention
// broker-go/internal/accounts already uses for accounts.json).
func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, "tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return os.Rename(tmpPath, path)
}

const (
	tokenArtLocalPrefix = "/monster-token-art-local/"
	portraitLocalPrefix = "/monster-art-local/"
)

// localAssetMiddleware intercepts GET requests under tokenArtLocalPrefix/
// portraitLocalPrefix and serves them straight from the user's local
// override directory (localMonsterArtRoot), before the embedded Vite
// build (the AssetServer's default Assets fs.FS) ever gets a chance to
// 404 on a path it never bundled. Every other request falls through to
// `next` untouched.
//
// Deliberately built on http.FileServer/http.StripPrefix/http.Dir rather
// than hand-rolled path joining + a prefix check: http.Dir.Open already
// rejects any ".." path element (net/http's own containsDotDot guard) and
// handles the "/"-vs-OS-separator conversion correctly on Windows, which
// path/filepath.Clean on a raw URL path does NOT (filepath.Clean rewrites
// to backslashes there, silently breaking a forward-slash prefix match).
// If the root directory can't be resolved, every request simply falls
// through to `next` — a missing/unwritable override directory should
// never break the embedded app from loading.
func localAssetMiddleware(next http.Handler) http.Handler {
	root, err := localMonsterArtRoot()
	if err != nil {
		return next
	}
	tokenArtServer := http.StripPrefix(
		tokenArtLocalPrefix,
		http.FileServer(http.Dir(filepath.Join(root, "token-art"))),
	)
	portraitServer := http.StripPrefix(
		portraitLocalPrefix,
		http.FileServer(http.Dir(filepath.Join(root, "portraits"))),
	)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, tokenArtLocalPrefix):
			tokenArtServer.ServeHTTP(w, r)
		case strings.HasPrefix(r.URL.Path, portraitLocalPrefix):
			portraitServer.ServeHTTP(w, r)
		default:
			next.ServeHTTP(w, r)
		}
	})
}

// GetLocalMonsterArtRoot returns the absolute path of the local monster
// art root directory, for a settings screen to show/open it.
func (a *App) GetLocalMonsterArtRoot() string {
	root, _ := localMonsterArtRoot()
	return root
}

// PickLocalMonsterArtRoot opens a native directory picker (defaulting to
// the current root) and, when the user confirms a selection, persists it
// as the new local monster-art root via SetLocalMonsterArtRoot. Returns ""
// (not an error) when the user cancels the dialog — that is a normal
// outcome, not a failure, and the frontend must not treat it as one.
func (a *App) PickLocalMonsterArtRoot() (string, error) {
	defaultDir, _ := localMonsterArtRoot()
	selected, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title:                "Escolher pasta de arte local",
		DefaultDirectory:     defaultDir,
		CanCreateDirectories: true,
	})
	if err != nil {
		return "", err
	}
	if selected == "" {
		return "", nil
	}
	if err := a.SetLocalMonsterArtRoot(selected); err != nil {
		return "", err
	}
	return selected, nil
}

// SetLocalMonsterArtRoot points the local monster-art override at `path`,
// creating it (and its token-art/portraits subdirectories) if needed, and
// persists the choice to localArtConfigPath so it survives app restarts.
// An empty/whitespace-only path or a path that already exists as a
// non-directory is rejected; every other failure (permissions, a
// read-only volume) is returned as-is rather than silently falling back
// to the default — the caller asked for a SPECIFIC folder, and silently
// ignoring that request would be worse than surfacing the error.
func (a *App) SetLocalMonsterArtRoot(path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return errors.New("local monster art root cannot be empty")
	}
	if info, err := os.Stat(path); err == nil {
		if !info.IsDir() {
			return errors.New("local monster art root must be a directory")
		}
	} else if os.IsNotExist(err) {
		if err := os.MkdirAll(path, 0755); err != nil {
			return err
		}
	} else {
		return err
	}
	if err := ensureLocalArtSubdirs(path); err != nil {
		return err
	}
	configDir, err := os.UserConfigDir()
	if err != nil {
		return err
	}
	encoded, err := json.Marshal(localArtRootConfig{Root: path})
	if err != nil {
		return err
	}
	return writeFileAtomic(localArtConfigPath(configDir), encoded)
}

// PickImportSourceDirectory opens a native directory picker for choosing
// either half of a pack to import via ImportLocalMonsterArtPack (the
// token-art directory or the portraits directory) — a thin wrapper so the
// frontend never has to type a filesystem path by hand. Returns ""
// (not an error) when the user cancels.
func (a *App) PickImportSourceDirectory(title string) (string, error) {
	if title == "" {
		title = "Escolher pasta de origem"
	}
	return wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title:                title,
		CanCreateDirectories: false,
	})
}

// importLocalMonsterArtResult reports what ImportLocalMonsterArtPack
// actually did, so the frontend can show the user a real summary (Passo 2,
// "migrar o conjunto do usuário", needs a visible confirmation that nothing
// silently failed) instead of a bare "done".
type importLocalMonsterArtResult struct {
	TokenArtMonsters int `json:"tokenArtMonsters"`
	TokenArtFiles    int `json:"tokenArtFiles"`
	TokenArtSkipped  int `json:"tokenArtSkipped"`
	Portraits        int `json:"portraits"`
	PortraitsSkipped int `json:"portraitsSkipped"`
}

// ImportLocalMonsterArtPack copies a monster art pack — the user's own
// Forgotten Adventures tokens and WotC portraits, or
// any other third-party pack the user already owns — into the CURRENT
// local override root (localMonsterArtRoot), so none of it has to live
// inside the published repo. Either source argument may be "" to skip
// that half.
//
// tokenArtSourceDir must mirror public/monster-token-art/'s own layout:
// one subdirectory per SRD index, with PNG/JPG files directly inside it,
// one per variant — exactly what ScanLocalMonsterArt expects back out of
// the destination. portraitsSourceDir must mirror public/monster-art/'s
// layout: flat PNG/JPG files named "<index>.<ext>".
//
// A destination file that already exists is left untouched and counted
// as "skipped" rather than silently overwritten — the local folder may
// already hold curated additions a re-import must not clobber. A source
// file with an unsupported extension is skipped the same way the scan
// itself skips one, and is not counted at all (it was never a candidate).
func (a *App) ImportLocalMonsterArtPack(
	tokenArtSourceDir string,
	portraitsSourceDir string,
) (string, error) {
	root, err := localMonsterArtRoot()
	if err != nil {
		return "", err
	}
	if err := ensureLocalArtSubdirs(root); err != nil {
		return "", err
	}

	result := importLocalMonsterArtResult{}

	tokenArtSourceDir = strings.TrimSpace(tokenArtSourceDir)
	if tokenArtSourceDir != "" {
		monsterDirs, err := os.ReadDir(tokenArtSourceDir)
		if err != nil {
			return "", err
		}
		destTokenArtRoot := filepath.Join(root, "token-art")
		for _, monsterDir := range monsterDirs {
			if !monsterDir.IsDir() {
				continue
			}
			index := monsterDir.Name()
			files, err := os.ReadDir(filepath.Join(tokenArtSourceDir, index))
			if err != nil {
				continue
			}
			copiedAny := false
			for _, file := range files {
				if file.IsDir() ||
					!localArtExtensions[strings.ToLower(filepath.Ext(file.Name()))] {
					continue
				}
				destDir := filepath.Join(destTokenArtRoot, index)
				destPath := filepath.Join(destDir, file.Name())
				if _, err := os.Stat(destPath); err == nil {
					result.TokenArtSkipped++
					continue
				}
				if err := os.MkdirAll(destDir, 0755); err != nil {
					return "", err
				}
				srcPath := filepath.Join(tokenArtSourceDir, index, file.Name())
				if err := copyFile(srcPath, destPath); err != nil {
					return "", err
				}
				result.TokenArtFiles++
				copiedAny = true
			}
			if copiedAny {
				result.TokenArtMonsters++
			}
		}
	}

	portraitsSourceDir = strings.TrimSpace(portraitsSourceDir)
	if portraitsSourceDir != "" {
		files, err := os.ReadDir(portraitsSourceDir)
		if err != nil {
			return "", err
		}
		destPortraitsDir := filepath.Join(root, "portraits")
		for _, file := range files {
			if file.IsDir() ||
				!localArtExtensions[strings.ToLower(filepath.Ext(file.Name()))] {
				continue
			}
			destPath := filepath.Join(destPortraitsDir, file.Name())
			if _, err := os.Stat(destPath); err == nil {
				result.PortraitsSkipped++
				continue
			}
			srcPath := filepath.Join(portraitsSourceDir, file.Name())
			if err := copyFile(srcPath, destPath); err != nil {
				return "", err
			}
			result.Portraits++
		}
	}

	encoded, err := json.Marshal(result)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

// copyFile copies src to dst (creating/truncating dst), used by
// ImportLocalMonsterArtPack instead of os.Rename because the pack being
// imported (e.g. a bundled art directory removed from the repo) may live
// on a different disk/volume than the destination.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// localTokenArtVariant mirrors monsterArtLocal.ts's LocalMonsterArtData
// shape exactly — keep the two in sync by hand, there is no shared schema.
type localTokenArtVariant struct {
	File   string `json:"file"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

type localMonsterArtData struct {
	TokenArt  map[string][]localTokenArtVariant `json:"tokenArt"`
	Portraits map[string]string                 `json:"portraits"`
}

var localArtExtensions = map[string]bool{".png": true, ".jpg": true, ".jpeg": true}

// ScanLocalMonsterArt walks the user's local override directory
// (localMonsterArtRoot) and returns a JSON-encoded localMonsterArtData —
// called once at frontend bootstrap (monsterArtLocal.ts's
// loadLocalMonsterArtOverrides). A monster/variant whose image file
// fails to decode (corrupt, unsupported format) is skipped rather than
// failing the whole scan: one bad file in the user's folder should never
// block every other monster's art from loading. Returns empty maps (not
// an error) when token-art/ or portraits/ don't exist yet or are empty —
// "nothing configured" is the expected default state, not a failure.
func (a *App) ScanLocalMonsterArt() (string, error) {
	root, err := localMonsterArtRoot()
	if err != nil {
		return "", err
	}

	result := localMonsterArtData{
		TokenArt:  map[string][]localTokenArtVariant{},
		Portraits: map[string]string{},
	}

	tokenArtDir := filepath.Join(root, "token-art")
	if monsterDirs, err := os.ReadDir(tokenArtDir); err == nil {
		for _, monsterDir := range monsterDirs {
			if !monsterDir.IsDir() {
				continue
			}
			index := monsterDir.Name()
			files, err := os.ReadDir(filepath.Join(tokenArtDir, index))
			if err != nil {
				continue
			}
			var variants []localTokenArtVariant
			for _, file := range files {
				if file.IsDir() || !localArtExtensions[strings.ToLower(filepath.Ext(file.Name()))] {
					continue
				}
				width, height, err := decodeImageSize(filepath.Join(tokenArtDir, index, file.Name()))
				if err != nil {
					continue
				}
				variants = append(variants, localTokenArtVariant{
					File:   file.Name(),
					Width:  width,
					Height: height,
				})
			}
			if len(variants) > 0 {
				result.TokenArt[index] = variants
			}
		}
	}

	portraitsDir := filepath.Join(root, "portraits")
	if files, err := os.ReadDir(portraitsDir); err == nil {
		for _, file := range files {
			ext := strings.ToLower(filepath.Ext(file.Name()))
			if file.IsDir() || !localArtExtensions[ext] {
				continue
			}
			index := strings.TrimSuffix(file.Name(), filepath.Ext(file.Name()))
			result.Portraits[index] = file.Name()
		}
	}

	encoded, err := json.Marshal(result)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

// decodeImageSize reads just enough of an image file to report its real
// pixel dimensions, without decoding the full pixel buffer — the same
// trick image.DecodeConfig exists for.
func decodeImageSize(path string) (width, height int, err error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, 0, err
	}
	defer f.Close()
	config, _, err := image.DecodeConfig(f)
	if err != nil {
		return 0, 0, err
	}
	return config.Width, config.Height, nil
}

func main() {
	flag.Parse()

	app := &App{}

	appOptions := &options.App{
		Title:     "Artisan",
		Frameless: false,
		Width:     1280,
		Height:    800,
		AssetServer: &assetserver.Options{
			Assets: assets,
			// Add middleware to handle local asset requests
			Middleware: localAssetMiddleware,
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app,
		},
	}

	// A spectator process needs its OWN WebView2 profile directory: Wails
	// keys the default profile off the executable's own name, and TWO
	// processes of the SAME .exe fighting over that one profile
	// (IndexedDB/localStorage, the account session, cookies) at the same
	// time is exactly the kind of concurrent-writer corruption CLAUDE.md's
	// "no conflict resolution" limitation already warns about elsewhere in
	// this app — worse here since it's the browser profile itself, not
	// just game state. A distinct folder keyed by the Mesa id isolates the
	// spectator window completely, at the cost of a fresh login being
	// bootstrapped in via --spectator-session above instead of reusing the
	// primary window's already-open one.
	if *spectatorGameID != "" {
		if configDir, err := os.UserConfigDir(); err == nil {
			appOptions.Windows = &windows.Options{
				WebviewUserDataPath: filepath.Join(
					configDir,
					"artisan-desktop-spectator-"+*spectatorGameID,
				),
			}
		}
	}

	err := wails.Run(appOptions)
	if err != nil {
		panic(err)
	}
}
