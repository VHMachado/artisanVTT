// Package main implements the Artisan broker in Go: it keeps per-table game
// state (maps, tokens, fog, manifests) in memory and relays it to every
// connected client over WebSocket. Every message is a msgpack array
// [event, ...args], sent as a binary WebSocket frame — a simple custom
// framing, not Socket.IO's own wire protocol (packet types, ack ids,
// namespaces).
//
// There is no WebRTC/P2P transport: map/token image bytes travel as
// peer_message frames relayed through this same WebSocket connection
// instead of a direct P2P data channel.
package main

import (
	"log"
	"net/http"

	"artisan-broker/internal/accounts"
	"artisan-broker/internal/config"
	"artisan-broker/internal/game"
	"artisan-broker/internal/httpapi"
	"artisan-broker/internal/tables"
)

func main() {
	cfg := config.Load()

	accts := accounts.New(cfg.DataDir)
	tableStore := tables.New(cfg.DataDir)

	hub := game.NewHub(tableStore)

	mux := http.NewServeMux()
	httpapi.RegisterHealthcheck(mux)
	httpapi.RegisterAccountRoutes(mux, accts, cfg)
	httpapi.RegisterTableRoutes(mux, tableStore, accts)
	httpapi.RegisterOnlineRoute(mux, hub, accts)
	httpapi.RegisterGameSocket(mux, hub, accts, cfg)

	handler := httpapi.WithCORS(cfg.OriginWhitelist, mux)

	log.Printf("The server is running on port %v", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, handler); err != nil {
		log.Fatal(err)
	}
}
