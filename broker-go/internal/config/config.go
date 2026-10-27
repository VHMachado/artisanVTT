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
		MaxAccounts:     maxAccounts,
	}
}
