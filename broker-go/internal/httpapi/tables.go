// RegisterTableRoutes wires the tables shared-content API: GET/POST /sync,
// POST /tables/{id}/join, and the content-addressed asset endpoints.
package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"artisan-broker/internal/accounts"
	"artisan-broker/internal/tables"
)

const maxSyncBodyBytes = 1 * 1024 * 1024 // 1MB of ops per request is generous for this table size
const maxAssetBytes = 64 * 1024 * 1024   // 64MB per asset (banners/portraits/tokens, not full maps)

// authenticateAccount resolves the caller to a full accounts.Account
// (needed for the numeric id tables.Store uses), replying 401 on failure.
func authenticateAccount(accts *accounts.Accounts, w http.ResponseWriter, r *http.Request) (accounts.Account, bool) {
	acct, ok, err := accts.VerifyAccount(bearerToken(r))
	if err != nil || !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Not logged in"})
		return accounts.Account{}, false
	}
	return acct, true
}

func RegisterTableRoutes(mux *http.ServeMux, store *tables.Store, accts *accounts.Accounts) {
	mux.HandleFunc("GET /sync", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := authenticateAccount(accts, w, r); !ok {
			return
		}
		handleGetSync(w, r, store)
	})
	mux.HandleFunc("POST /sync", func(w http.ResponseWriter, r *http.Request) {
		acct, ok := authenticateAccount(accts, w, r)
		if !ok {
			return
		}
		handlePostSync(w, r, store, acct)
	})
	mux.HandleFunc("POST /tables/{id}/join", func(w http.ResponseWriter, r *http.Request) {
		acct, ok := authenticateAccount(accts, w, r)
		if !ok {
			return
		}
		handleJoinTable(w, r, store, acct)
	})
	mux.HandleFunc("HEAD /asset/{hash}", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := authenticateAccount(accts, w, r); !ok {
			return
		}
		handleAssetHead(w, r, store)
	})
	mux.HandleFunc("PUT /asset/{hash}", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := authenticateAccount(accts, w, r); !ok {
			return
		}
		handleAssetUpload(w, r, store)
	})
	mux.HandleFunc("GET /asset/{hash}", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := authenticateAccount(accts, w, r); !ok {
			return
		}
		handleAssetDownload(w, r, store)
	})
}

func handleGetSync(w http.ResponseWriter, r *http.Request, store *tables.Store) {
	since := int64(0)
	if v := r.URL.Query().Get("since"); v != "" {
		parsed, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid since"})
			return
		}
		since = parsed
	}
	changes, cursor, serverTime, err := store.GetChangesSince(since)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to load changes"})
		return
	}
	if changes == nil {
		changes = []tables.Change{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"changes":    changes,
		"cursor":     cursor,
		"serverTime": serverTime,
	})
}

type syncRequestBody struct {
	Ops []tables.Op `json:"ops"`
}

func handlePostSync(w http.ResponseWriter, r *http.Request, store *tables.Store, acct accounts.Account) {
	limited := io.LimitReader(r.Body, maxSyncBodyBytes+1)
	var body syncRequestBody
	if err := json.NewDecoder(limited).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	result, err := store.ApplySync(acct.ID, body.Ops)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to apply changes"})
		return
	}
	if result.Accepted == nil {
		result.Accepted = []tables.OpResult{}
	}
	if result.Conflicts == nil {
		result.Conflicts = []tables.OpResult{}
	}
	if result.Rejected == nil {
		result.Rejected = []tables.OpResult{}
	}
	writeJSON(w, http.StatusOK, result)
}

func handleJoinTable(w http.ResponseWriter, r *http.Request, store *tables.Store, acct accounts.Account) {
	id := r.PathValue("id")
	role, err := store.Join(id, acct.ID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Table not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"role": role})
}

func handleAssetHead(w http.ResponseWriter, r *http.Request, store *tables.Store) {
	hash := r.PathValue("hash")
	exists, err := store.AssetExists(hash)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func handleAssetUpload(w http.ResponseWriter, r *http.Request, store *tables.Store) {
	hash := r.PathValue("hash")
	path, err := store.AssetPath(hash)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid asset hash"})
		return
	}

	limited := io.LimitReader(r.Body, maxAssetBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Upload failed"})
		return
	}
	if int64(len(data)) > maxAssetBytes {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Asset is too large"})
		return
	}
	sum := sha256.Sum256(data)
	if hex.EncodeToString(sum[:]) != hash {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Hash does not match body"})
		return
	}

	if err := writeAssetFile(path, data); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to save asset"})
		return
	}

	mime := r.Header.Get("Content-Type")
	if mime == "" {
		mime = "application/octet-stream"
	}
	if err := store.RecordAsset(hash, mime, int64(len(data))); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to record asset"})
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func handleAssetDownload(w http.ResponseWriter, r *http.Request, store *tables.Store) {
	hash := r.PathValue("hash")
	path, err := store.AssetPath(hash)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid asset hash"})
		return
	}
	f, err := openAssetFile(path)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Asset not found"})
		return
	}
	defer f.Close()
	mime, _ := store.AssetMime(hash)
	if mime == "" {
		mime = "application/octet-stream"
	}
	w.Header().Set("Content-Type", mime)
	io.Copy(w, f)
}
