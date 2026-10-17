// Self check for the local monster-art mechanism's additions:
// a configurable root (SetLocalMonsterArtRoot/PickLocalMonsterArtRoot
// persistence), the pack importer (ImportLocalMonsterArtPack), and the
// atomic config write they share. Does NOT cover PickLocalMonsterArtRoot/
// PickImportSourceDirectory themselves — those call wailsruntime's native
// dialog, which needs a real window and isn't exercised here, same as the
// rest of this package's manual-smoke-test convention.
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// withTempConfigDir points os.UserConfigDir() at a fresh temp directory
// for the duration of one test, by overriding the env var Go's runtime
// reads on this OS (%AppData% on Windows, $XDG_CONFIG_HOME/$HOME
// elsewhere) — so every test gets its own isolated "Artisan" folder
// instead of touching the real one on this machine.
func withTempConfigDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	envVar := "XDG_CONFIG_HOME"
	if os.Getenv("AppData") != "" || isWindowsRuntime() {
		envVar = "AppData"
	}
	t.Setenv(envVar, dir)
	resolved, err := os.UserConfigDir()
	if err != nil {
		t.Fatalf("UserConfigDir: %v", err)
	}
	if resolved != dir {
		t.Fatalf("UserConfigDir = %q, want %q (env override not picked up)", resolved, dir)
	}
	return dir
}

func isWindowsRuntime() bool {
	return os.PathSeparator == '\\'
}

func TestLocalMonsterArtRootDefaultsAndCreatesSubdirs(t *testing.T) {
	configDir := withTempConfigDir(t)

	root, err := localMonsterArtRoot()
	if err != nil {
		t.Fatalf("localMonsterArtRoot: %v", err)
	}
	want := filepath.Join(configDir, "Artisan", "monster-art-local")
	if root != want {
		t.Fatalf("root = %q, want %q", root, want)
	}
	if err := ensureLocalArtSubdirs(root); err != nil {
		t.Fatalf("ensureLocalArtSubdirs: %v", err)
	}
	for _, sub := range []string{"token-art", "portraits"} {
		info, err := os.Stat(filepath.Join(root, sub))
		if err != nil {
			t.Fatalf("stat %s: %v", sub, err)
		}
		if !info.IsDir() {
			t.Fatalf("%s is not a directory", sub)
		}
	}
}

func TestSetLocalMonsterArtRootPersistsAndOverridesDefault(t *testing.T) {
	withTempConfigDir(t)
	a := &App{}

	customRoot := filepath.Join(t.TempDir(), "my-pack")
	if err := a.SetLocalMonsterArtRoot(customRoot); err != nil {
		t.Fatalf("SetLocalMonsterArtRoot: %v", err)
	}

	resolved, err := localMonsterArtRoot()
	if err != nil {
		t.Fatalf("localMonsterArtRoot: %v", err)
	}
	if resolved != customRoot {
		t.Fatalf("localMonsterArtRoot = %q, want %q", resolved, customRoot)
	}
	if got := a.GetLocalMonsterArtRoot(); got != customRoot {
		t.Fatalf("GetLocalMonsterArtRoot = %q, want %q", got, customRoot)
	}
	// Subdirectories must exist immediately, not just after a scan/import.
	for _, sub := range []string{"token-art", "portraits"} {
		if _, err := os.Stat(filepath.Join(customRoot, sub)); err != nil {
			t.Fatalf("stat %s: %v", sub, err)
		}
	}
}

func TestSetLocalMonsterArtRootRejectsEmptyAndNonDirectory(t *testing.T) {
	withTempConfigDir(t)
	a := &App{}

	if err := a.SetLocalMonsterArtRoot("   "); err == nil {
		t.Fatal("expected an error for an empty/whitespace path")
	}

	filePath := filepath.Join(t.TempDir(), "not-a-dir")
	if err := os.WriteFile(filePath, []byte("x"), 0644); err != nil {
		t.Fatalf("seed file: %v", err)
	}
	if err := a.SetLocalMonsterArtRoot(filePath); err == nil {
		t.Fatal("expected an error when the path is an existing file")
	}
}

func TestReadLocalArtRootOverrideDegradesOnMissingOrMalformedConfig(t *testing.T) {
	configDir := withTempConfigDir(t)

	// No config file at all yet.
	if _, ok := readLocalArtRootOverride(configDir); ok {
		t.Fatal("expected ok=false with no config file")
	}

	// Malformed JSON.
	if err := os.MkdirAll(filepath.Dir(localArtConfigPath(configDir)), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(localArtConfigPath(configDir), []byte("not json"), 0644); err != nil {
		t.Fatalf("write malformed config: %v", err)
	}
	if _, ok := readLocalArtRootOverride(configDir); ok {
		t.Fatal("expected ok=false with malformed JSON")
	}

	// Valid JSON but an empty/whitespace root.
	encoded, _ := json.Marshal(localArtRootConfig{Root: "   "})
	if err := os.WriteFile(localArtConfigPath(configDir), encoded, 0644); err != nil {
		t.Fatalf("write blank-root config: %v", err)
	}
	if _, ok := readLocalArtRootOverride(configDir); ok {
		t.Fatal("expected ok=false with a blank root")
	}
}

// seedPackLayout builds a directory tree matching
// public/monster-token-art/<index>/<file>.png plus a flat
// public/monster-art/<index>.jpg tree, for ImportLocalMonsterArtPack to
// read from.
func seedPackLayout(t *testing.T) (tokenArtDir, portraitsDir string) {
	t.Helper()
	base := t.TempDir()
	tokenArtDir = filepath.Join(base, "monster-token-art")
	portraitsDir = filepath.Join(base, "monster-art")

	writePNG := func(path string) {
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatalf("mkdir for %s: %v", path, err)
		}
		// A minimal but valid 1x1 PNG, so decodeImageSize succeeds.
		onePxPNG := []byte{
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
			0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
			0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
			0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
			0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00,
			0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
		}
		if err := os.WriteFile(path, onePxPNG, 0644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	writePNG(filepath.Join(tokenArtDir, "goblin", "goblin_1.png"))
	writePNG(filepath.Join(tokenArtDir, "goblin", "goblin_2.png"))
	writePNG(filepath.Join(tokenArtDir, "owlbear", "owlbear_1.png"))
	writePNG(filepath.Join(portraitsDir, "goblin.jpg"))
	writePNG(filepath.Join(portraitsDir, "owlbear.jpg"))
	return tokenArtDir, portraitsDir
}

func TestImportLocalMonsterArtPackCopiesBothHalves(t *testing.T) {
	withTempConfigDir(t)
	a := &App{}
	tokenArtDir, portraitsDir := seedPackLayout(t)

	resultJSON, err := a.ImportLocalMonsterArtPack(tokenArtDir, portraitsDir)
	if err != nil {
		t.Fatalf("ImportLocalMonsterArtPack: %v", err)
	}
	var result importLocalMonsterArtResult
	if err := json.Unmarshal([]byte(resultJSON), &result); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	if result.TokenArtMonsters != 2 || result.TokenArtFiles != 3 {
		t.Fatalf("token art result = %+v, want 2 monsters / 3 files", result)
	}
	if result.Portraits != 2 {
		t.Fatalf("portraits result = %+v, want 2", result)
	}
	if result.TokenArtSkipped != 0 || result.PortraitsSkipped != 0 {
		t.Fatalf("expected no skips on a fresh import, got %+v", result)
	}

	root, _ := localMonsterArtRoot()
	for _, p := range []string{
		filepath.Join(root, "token-art", "goblin", "goblin_1.png"),
		filepath.Join(root, "token-art", "goblin", "goblin_2.png"),
		filepath.Join(root, "token-art", "owlbear", "owlbear_1.png"),
		filepath.Join(root, "portraits", "goblin.jpg"),
		filepath.Join(root, "portraits", "owlbear.jpg"),
	} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("expected %s to exist: %v", p, err)
		}
	}
}

func TestImportLocalMonsterArtPackSkipsExistingFilesWithoutOverwriting(t *testing.T) {
	withTempConfigDir(t)
	a := &App{}
	tokenArtDir, portraitsDir := seedPackLayout(t)

	if _, err := a.ImportLocalMonsterArtPack(tokenArtDir, portraitsDir); err != nil {
		t.Fatalf("first import: %v", err)
	}

	// A curated addition the second import must not clobber.
	root, _ := localMonsterArtRoot()
	customPath := filepath.Join(root, "portraits", "goblin.jpg")
	if err := os.WriteFile(customPath, []byte("custom curated bytes"), 0644); err != nil {
		t.Fatalf("overwrite with custom content: %v", err)
	}

	resultJSON, err := a.ImportLocalMonsterArtPack(tokenArtDir, portraitsDir)
	if err != nil {
		t.Fatalf("second import: %v", err)
	}
	var result importLocalMonsterArtResult
	if err := json.Unmarshal([]byte(resultJSON), &result); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	if result.TokenArtFiles != 0 || result.Portraits != 0 {
		t.Fatalf("expected zero new copies on re-import, got %+v", result)
	}
	if result.TokenArtSkipped != 3 || result.PortraitsSkipped != 2 {
		t.Fatalf("expected every file skipped on re-import, got %+v", result)
	}

	after, err := os.ReadFile(customPath)
	if err != nil {
		t.Fatalf("read back custom file: %v", err)
	}
	if string(after) != "custom curated bytes" {
		t.Fatal("re-import overwrote a file that already existed in the local folder")
	}
}

func TestImportLocalMonsterArtPackSkipsSourceOnly(t *testing.T) {
	withTempConfigDir(t)
	a := &App{}
	tokenArtDir, portraitsDir := seedPackLayout(t)

	resultJSON, err := a.ImportLocalMonsterArtPack(tokenArtDir, "")
	if err != nil {
		t.Fatalf("ImportLocalMonsterArtPack (token art only): %v", err)
	}
	var result importLocalMonsterArtResult
	if err := json.Unmarshal([]byte(resultJSON), &result); err != nil {
		t.Fatalf("unmarshal result: %v", err)
	}
	if result.Portraits != 0 || result.PortraitsSkipped != 0 {
		t.Fatalf("expected portraits untouched when its source dir is empty, got %+v", result)
	}

	root, _ := localMonsterArtRoot()
	if _, err := os.Stat(filepath.Join(root, "portraits", "goblin.jpg")); !os.IsNotExist(err) {
		t.Fatalf("expected no portrait copied, stat err = %v", err)
	}
	_ = portraitsDir // only used by the sibling tests above
}

func TestScanLocalMonsterArtReflectsImportedPack(t *testing.T) {
	withTempConfigDir(t)
	a := &App{}
	tokenArtDir, portraitsDir := seedPackLayout(t)

	if _, err := a.ImportLocalMonsterArtPack(tokenArtDir, portraitsDir); err != nil {
		t.Fatalf("import: %v", err)
	}

	scanJSON, err := a.ScanLocalMonsterArt()
	if err != nil {
		t.Fatalf("ScanLocalMonsterArt: %v", err)
	}
	var data localMonsterArtData
	if err := json.Unmarshal([]byte(scanJSON), &data); err != nil {
		t.Fatalf("unmarshal scan: %v", err)
	}
	if len(data.TokenArt["goblin"]) != 2 {
		t.Fatalf("goblin variants = %d, want 2", len(data.TokenArt["goblin"]))
	}
	if len(data.TokenArt["owlbear"]) != 1 {
		t.Fatalf("owlbear variants = %d, want 1", len(data.TokenArt["owlbear"]))
	}
	if data.Portraits["goblin"] != "goblin.jpg" {
		t.Fatalf("goblin portrait = %q, want goblin.jpg", data.Portraits["goblin"])
	}
}
