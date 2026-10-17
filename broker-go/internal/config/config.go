// Package config resolves environment configuration, mirroring
// backend/src/entities/Global.ts.
package config

import (
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	Port            string
	OriginWhitelist string
	DataDir         string
	MaxBackupBytes  int64
	MaxAccounts     int
}

func Load() *Config {
	exe, err := os.Executable()
	root := "."
	if err == nil {
		root = filepath.Dir(exe)
	}

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = filepath.Join(root, "data")
	}

	maxBackupBytes := int64(2 * 1024 * 1024 * 1024) // 2GB default
	if v := os.Getenv("MAX_BACKUP_BYTES"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			maxBackupBytes = n
		}
	}

	maxAccounts := 4
	if v, ok := os.LookupEnv("MAX_ACCOUNTS"); ok {
		if n, err := strconv.Atoi(v); err == nil {
			maxAccounts = n
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "9420"
	}

	return &Config{
		Port:            port,
		OriginWhitelist: os.Getenv("ALLOW_ORIGIN"),
		DataDir:         dataDir,
		MaxBackupBytes:  maxBackupBytes,
		MaxAccounts:     maxAccounts,
	}
}
