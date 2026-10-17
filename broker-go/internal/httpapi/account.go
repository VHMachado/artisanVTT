// RegisterAccountRoutes mirrors backend/src/controllers/AccountController.ts:
// register/login/logout plus streamed backup upload/download.
package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"

	"artisan-broker/internal/accounts"
	"artisan-broker/internal/config"
)

var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,32}$`)

const minPasswordLength = 8
const maxCredentialBodyBytes = 16 * 1024 // 16kb, mirrors express.json({limit: "16kb"})

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	return ""
}

// authenticate resolves the caller, replying 401 and returning ("", false)
// when unauthenticated — mirrors AccountController.ts's private authenticate.
func authenticate(accts *accounts.Accounts, w http.ResponseWriter, r *http.Request) (string, bool) {
	username, err := accts.Verify(bearerToken(r))
	if err != nil || username == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Not logged in"})
		return "", false
	}
	return username, true
}

func RegisterAccountRoutes(mux *http.ServeMux, accts *accounts.Accounts, cfg *config.Config) {
	mux.HandleFunc("/account/register", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		handleRegister(w, r, accts, cfg)
	})
	mux.HandleFunc("/account/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		handleLogin(w, r, accts)
	})
	mux.HandleFunc("/account/logout", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		handleLogout(w, r, accts)
	})
	mux.HandleFunc("/account/backup", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPut:
			handleUploadBackup(w, r, accts, cfg)
		case http.MethodGet:
			handleDownloadBackup(w, r, accts)
		default:
			http.NotFound(w, r)
		}
	})
}

type credentialsBody struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

func decodeCredentials(r *http.Request) (credentialsBody, error) {
	var body credentialsBody
	limited := io.LimitReader(r.Body, maxCredentialBodyBytes+1)
	if err := json.NewDecoder(limited).Decode(&body); err != nil {
		return credentialsBody{}, err
	}
	return body, nil
}

func handleRegister(w http.ResponseWriter, r *http.Request, accts *accounts.Accounts, cfg *config.Config) {
	body, err := decodeCredentials(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}
	if !usernamePattern.MatchString(body.Username) {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Username must be 3-32 letters, numbers, dashes or underscores",
		})
		return
	}
	if len(body.Password) < minPasswordLength {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "Password must be at least " + strconv.Itoa(minPasswordLength) + " characters",
		})
		return
	}
	displayName := strings.TrimSpace(body.DisplayName)
	if displayName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Player name is required"})
		return
	}
	if len(displayName) > 32 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Player name must be 32 characters or fewer"})
		return
	}
	if cfg.MaxAccounts > 0 {
		count, err := accts.Count()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to register"})
			return
		}
		if count >= cfg.MaxAccounts {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "This server is not accepting new accounts"})
			return
		}
	}
	created, err := accts.Register(body.Username, body.Password, displayName)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to register"})
		return
	}
	if !created {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "That username is taken"})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"username": body.Username})
}

func handleLogin(w http.ResponseWriter, r *http.Request, accts *accounts.Accounts) {
	body, err := decodeCredentials(r)
	if err != nil || body.Username == "" || body.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Missing username or password"})
		return
	}
	token, displayName, accountID, err := accts.Login(body.Username, body.Password)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to log in"})
		return
	}
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Incorrect username or password"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": token, "username": body.Username, "displayName": displayName, "accountId": accountID,
	})
}

func handleLogout(w http.ResponseWriter, r *http.Request, accts *accounts.Accounts) {
	if token := bearerToken(r); token != "" {
		accts.Logout(token)
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleUploadBackup(w http.ResponseWriter, r *http.Request, accts *accounts.Accounts, cfg *config.Config) {
	username, ok := authenticate(accts, w, r)
	if !ok {
		return
	}

	target := accts.BackupPath(username)
	tmp := target + ".tmp"

	out, err := os.Create(tmp)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to save backup"})
		return
	}

	limited := io.LimitReader(r.Body, cfg.MaxBackupBytes+1)
	written, err := io.Copy(out, limited)
	out.Close()
	if err != nil {
		os.Remove(tmp)
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Upload failed"})
		return
	}
	if written > cfg.MaxBackupBytes {
		os.Remove(tmp)
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "Backup is too large for this server"})
		return
	}

	if err := os.Rename(tmp, target); err != nil {
		os.Remove(tmp)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to save backup"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"size": written, "updatedAt": nowMillis()})
}

func handleDownloadBackup(w http.ResponseWriter, r *http.Request, accts *accounts.Accounts) {
	username, ok := authenticate(accts, w, r)
	if !ok {
		return
	}
	target := accts.BackupPath(username)
	f, err := os.Open(target)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "No backup saved yet"})
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	io.Copy(w, f)
}
