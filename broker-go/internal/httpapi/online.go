// RegisterOnlineRoute exposes the "Usuários Online" badge: how many
// clients are currently connected to each Mesa's live WebSocket room. Kept
// as its own small file/route rather than folding into tables.go because it
// reads from the in-memory game.Hub, not the SQLite tables.Store — a
// different dependency than every other route in that file.
package httpapi

import (
	"net/http"

	"artisan-broker/internal/accounts"
	"artisan-broker/internal/game"
)

func RegisterOnlineRoute(mux *http.ServeMux, hub *game.Hub, accts *accounts.Accounts) {
	mux.HandleFunc("GET /tables/online", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := authenticateAccount(accts, w, r); !ok {
			return
		}
		writeJSON(w, http.StatusOK, hub.OnlineCounts())
	})
}
