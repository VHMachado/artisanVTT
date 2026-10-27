package httpapi

import (
	"os"
	"path/filepath"
)

// writeAssetFile writes data to path atomically (temp file + rename),
// creating the sharded parent directory (see tables.Store.AssetPath) if
// needed.
func writeAssetFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

func openAssetFile(path string) (*os.File, error) {
	return os.Open(path)
}
