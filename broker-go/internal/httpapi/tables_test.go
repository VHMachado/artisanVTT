// Self check for the tables/characters HTTP routes: GET/POST /sync,
// POST /tables/{id}/join, HEAD/PUT/GET /asset/{hash}.
package httpapi

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"artisan-broker/internal/accounts"
	"artisan-broker/internal/config"
	"artisan-broker/internal/tables"
)

// tableTestServer wires accounts + tables routes together (a real client
// needs both: it registers/logs in via /account, then syncs via /sync).
func tableTestServer(t *testing.T) (baseURL string) {
	t.Helper()
	dir := t.TempDir()
	accts := accounts.New(dir)
	t.Cleanup(func() { accts.Close() })
	store := tables.New(dir)
	t.Cleanup(func() { store.Close() })
	cfg := &config.Config{MaxAccounts: 10, MaxBackupBytes: 2 << 20}

	mux := http.NewServeMux()
	RegisterAccountRoutes(mux, accts, cfg)
	RegisterTableRoutes(mux, store, accts)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv.URL
}

func registerAndLogin(t *testing.T, base, username, displayName string) string {
	t.Helper()
	resp := postJSON(t, base+"/account/register", map[string]string{
		"username": username, "password": "correct horse", "displayName": displayName,
	})
	if resp.StatusCode != 201 {
		t.Fatalf("register %s: got %d", username, resp.StatusCode)
	}
	loginResp := postJSON(t, base+"/account/login", map[string]string{
		"username": username, "password": "correct horse",
	})
	if loginResp.StatusCode != 200 {
		t.Fatalf("login %s: got %d", username, loginResp.StatusCode)
	}
	var body struct {
		Token string `json:"token"`
	}
	json.NewDecoder(loginResp.Body).Decode(&body)
	if body.Token == "" {
		t.Fatalf("login %s: no token", username)
	}
	return body.Token
}

func authedRequest(t *testing.T, method, url, token string, body []byte) *http.Response {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	} else {
		reader = bytes.NewReader([]byte{})
	}
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	return resp
}

func TestSyncRoutesRequireAuth(t *testing.T) {
	base := tableTestServer(t)
	resp, err := http.Get(base + "/sync")
	if err != nil {
		t.Fatalf("GET /sync: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated GET /sync should 401, got %d", resp.StatusCode)
	}
}

func TestCreateTableThenSyncSeenByBothAccounts(t *testing.T) {
	base := tableTestServer(t)
	gmToken := registerAndLogin(t, base, "gm-user", "The GM")
	playerToken := registerAndLogin(t, base, "player1", "Player One")

	createBody, _ := json.Marshal(map[string]interface{}{
		"ops": []map[string]interface{}{
			{"entityType": "table", "id": "t1", "baseVersion": 0, "patch": map[string]interface{}{"name": "Mesa do Sino"}},
		},
	})
	resp := authedRequest(t, "POST", base+"/sync", gmToken, createBody)
	if resp.StatusCode != 200 {
		t.Fatalf("create table via sync: got %d", resp.StatusCode)
	}
	var syncResult tables.SyncResult
	json.NewDecoder(resp.Body).Decode(&syncResult)
	if len(syncResult.Accepted) != 1 || syncResult.Accepted[0].Version != 1 {
		t.Fatalf("expected 1 accepted op at version 1, got %+v", syncResult)
	}

	// Table visibility is global: a different account,
	// never joined, still sees the table on GET /sync.
	getResp := authedRequest(t, "GET", base+"/sync?since=0", playerToken, nil)
	if getResp.StatusCode != 200 {
		t.Fatalf("GET /sync as player: got %d", getResp.StatusCode)
	}
	var getBody struct {
		Changes []tables.Change `json:"changes"`
		Cursor  int64           `json:"cursor"`
	}
	json.NewDecoder(getResp.Body).Decode(&getBody)
	if len(getBody.Changes) != 1 {
		t.Fatalf("expected 1 change visible to a non-member account, got %d", len(getBody.Changes))
	}
	if getBody.Changes[0].EntityID != "t1" {
		t.Fatalf("expected the created table, got %+v", getBody.Changes[0])
	}
}

func TestJoinTableAssignsRole(t *testing.T) {
	base := tableTestServer(t)
	gmToken := registerAndLogin(t, base, "gm-user2", "GM Two")
	playerToken := registerAndLogin(t, base, "player2", "Player Two")

	createBody, _ := json.Marshal(map[string]interface{}{
		"ops": []map[string]interface{}{
			{"entityType": "table", "id": "t2", "baseVersion": 0, "patch": map[string]interface{}{"name": "Mesa"}},
		},
	})
	authedRequest(t, "POST", base+"/sync", gmToken, createBody)

	resp := authedRequest(t, "POST", base+"/tables/t2/join", gmToken, nil)
	if resp.StatusCode != 200 {
		t.Fatalf("gm join: got %d", resp.StatusCode)
	}
	var gmBody struct {
		Role string `json:"role"`
	}
	json.NewDecoder(resp.Body).Decode(&gmBody)
	if gmBody.Role != "gm" {
		t.Fatalf("creator joining should be gm, got %q", gmBody.Role)
	}

	resp = authedRequest(t, "POST", base+"/tables/t2/join", playerToken, nil)
	if resp.StatusCode != 200 {
		t.Fatalf("player join: got %d", resp.StatusCode)
	}
	var playerBody struct {
		Role string `json:"role"`
	}
	json.NewDecoder(resp.Body).Decode(&playerBody)
	if playerBody.Role != "player" {
		t.Fatalf("non-owner joining should be player, got %q", playerBody.Role)
	}

	resp = authedRequest(t, "POST", base+"/tables/does-not-exist/join", gmToken, nil)
	if resp.StatusCode != 404 {
		t.Fatalf("joining an unknown table should 404, got %d", resp.StatusCode)
	}
}

func TestNonOwnerEditIsRejectedViaSync(t *testing.T) {
	base := tableTestServer(t)
	gmToken := registerAndLogin(t, base, "gm-user3", "GM Three")
	playerToken := registerAndLogin(t, base, "player3", "Player Three")

	createBody, _ := json.Marshal(map[string]interface{}{
		"ops": []map[string]interface{}{
			{"entityType": "table", "id": "t3", "baseVersion": 0, "patch": map[string]interface{}{"name": "Original"}},
		},
	})
	authedRequest(t, "POST", base+"/sync", gmToken, createBody)

	editBody, _ := json.Marshal(map[string]interface{}{
		"ops": []map[string]interface{}{
			{"entityType": "table", "id": "t3", "baseVersion": 1, "patch": map[string]interface{}{"name": "Hijacked"}},
		},
	})
	resp := authedRequest(t, "POST", base+"/sync", playerToken, editBody)
	if resp.StatusCode != 200 {
		t.Fatalf("sync request itself should still 200 (rejection is per-op): got %d", resp.StatusCode)
	}
	var syncResult tables.SyncResult
	json.NewDecoder(resp.Body).Decode(&syncResult)
	if len(syncResult.Rejected) != 1 {
		t.Fatalf("expected 1 rejected op, got %+v", syncResult)
	}
}

func TestAssetUploadHashMismatchRejected(t *testing.T) {
	base := tableTestServer(t)
	token := registerAndLogin(t, base, "gm-user4", "GM Four")

	payload := []byte("some asset bytes")
	sum := sha256.Sum256(payload)
	correctHash := hex.EncodeToString(sum[:])
	wrongHash := hex.EncodeToString(sha256.New().Sum(nil)) // hash of empty string, won't match

	resp := authedRequest(t, "PUT", base+"/asset/"+wrongHash, token, payload)
	if resp.StatusCode != 400 {
		t.Fatalf("mismatched hash should 400, got %d", resp.StatusCode)
	}

	resp = authedRequest(t, "HEAD", base+"/asset/"+correctHash, token, nil)
	if resp.StatusCode != 404 {
		t.Fatalf("asset should not exist yet, got %d", resp.StatusCode)
	}

	resp = authedRequest(t, "PUT", base+"/asset/"+correctHash, token, payload)
	if resp.StatusCode != 201 {
		t.Fatalf("correct hash upload should 201, got %d", resp.StatusCode)
	}

	resp = authedRequest(t, "HEAD", base+"/asset/"+correctHash, token, nil)
	if resp.StatusCode != 200 {
		t.Fatalf("asset should exist after upload, got %d", resp.StatusCode)
	}

	resp = authedRequest(t, "GET", base+"/asset/"+correctHash, token, nil)
	if resp.StatusCode != 200 {
		t.Fatalf("download should 200, got %d", resp.StatusCode)
	}
	downloaded := make([]byte, len(payload))
	resp.Body.Read(downloaded)
	if !bytes.Equal(downloaded, payload) {
		t.Fatalf("downloaded bytes should match upload: got %q want %q", downloaded, payload)
	}
}

func TestAssetRoutesRequireAuth(t *testing.T) {
	base := tableTestServer(t)
	resp, err := http.Head(base + "/asset/deadbeef")
	if err != nil {
		t.Fatalf("HEAD /asset: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated HEAD /asset should 401, got %d", resp.StatusCode)
	}
}
