// Self check for the account HTTP routes, a Go port of
// backend/src/controllers/AccountController.test.ts.
// Run: go test ./internal/httpapi/...
package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"artisan-broker/internal/accounts"
	"artisan-broker/internal/config"
)

func newTestServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	dir := t.TempDir()
	accts := accounts.New(dir)
	t.Cleanup(func() { accts.Close() })
	cfg := &config.Config{MaxAccounts: 4}
	mux := http.NewServeMux()
	RegisterAccountRoutes(mux, accts, cfg)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv, srv.URL + "/account"
}

func postJSON(t *testing.T, url string, body map[string]string) *http.Response {
	t.Helper()
	data, _ := json.Marshal(body)
	resp, err := http.Post(url, "application/json", bytes.NewReader(data))
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	return resp
}

func TestAccountRoutesSelfCheck(t *testing.T) {
	_, base := newTestServer(t)

	// Bad input is rejected before touching the store.
	if resp := postJSON(t, base+"/register", map[string]string{"username": "a", "password": "longenough", "displayName": "A"}); resp.StatusCode != 400 {
		t.Fatalf("short username should 400, got %d", resp.StatusCode)
	}
	if resp := postJSON(t, base+"/register", map[string]string{"username": "gamemaster", "password": "short", "displayName": "GM"}); resp.StatusCode != 400 {
		t.Fatalf("short password should 400, got %d", resp.StatusCode)
	}
	if resp := postJSON(t, base+"/register", map[string]string{"username": "gamemaster2", "password": "longenough", "displayName": ""}); resp.StatusCode != 400 {
		t.Fatalf("missing display name should 400, got %d", resp.StatusCode)
	}

	// Register, then the same name is a conflict.
	if resp := postJSON(t, base+"/register", map[string]string{"username": "gamemaster", "password": "correct horse", "displayName": "The GM"}); resp.StatusCode != 201 {
		t.Fatalf("register should 201, got %d", resp.StatusCode)
	}
	if resp := postJSON(t, base+"/register", map[string]string{"username": "gamemaster", "password": "correct horse", "displayName": "The GM"}); resp.StatusCode != 409 {
		t.Fatalf("duplicate register should 409, got %d", resp.StatusCode)
	}

	// Wrong password does not issue a token.
	if resp := postJSON(t, base+"/login", map[string]string{"username": "gamemaster", "password": "nope"}); resp.StatusCode != 401 {
		t.Fatalf("wrong password should 401, got %d", resp.StatusCode)
	}

	loginResp := postJSON(t, base+"/login", map[string]string{"username": "gamemaster", "password": "correct horse"})
	if loginResp.StatusCode != 200 {
		t.Fatalf("login should 200, got %d", loginResp.StatusCode)
	}
	var loginBody struct {
		Token       string `json:"token"`
		DisplayName string `json:"displayName"`
		AccountID   int64  `json:"accountId"`
	}
	json.NewDecoder(loginResp.Body).Decode(&loginBody)
	if loginBody.Token == "" {
		t.Fatal("login should return a token")
	}
	if loginBody.DisplayName != "The GM" {
		t.Fatalf("login should return the display name, got %q", loginBody.DisplayName)
	}
	if loginBody.AccountID == 0 {
		t.Fatalf("login should return a non-zero account id, got %d", loginBody.AccountID)
	}
	auth := "Bearer " + loginBody.Token

	// A second account can register and log in independently.
	postJSON(t, base+"/register", map[string]string{"username": "other", "password": "correct horse", "displayName": "Other Player"})
	otherLoginResp := postJSON(t, base+"/login", map[string]string{"username": "other", "password": "correct horse"})
	var otherLoginBody struct {
		Token string `json:"token"`
	}
	json.NewDecoder(otherLoginResp.Body).Decode(&otherLoginBody)
	if otherLoginBody.Token == "" {
		t.Fatal("second account should also receive a token")
	}

	// Logging out revokes the session: the broker's /sync (tested in
	// tables_test.go) would now reject this token too.
	req, _ := http.NewRequest(http.MethodPost, base+"/logout", nil)
	req.Header.Set("Authorization", auth)
	http.DefaultClient.Do(req)
}
