// RegisterGameSocket upgrades /socket to a WebSocket and speaks the wire
// protocol described in main.go's package comment: each frame is a binary
// msgpack-encoded array [event, ...args]. This replaces socket.io-client/
// socket.io entirely — see src/network/Session.ts and src/helpers/wsClient.ts
// on the frontend for the matching client.
package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/vmihailenco/msgpack/v5"

	"artisan-broker/internal/accounts"
	"artisan-broker/internal/config"
	"artisan-broker/internal/game"
)

var upgrader = websocket.Upgrader{
	// Origin is already enforced by the CORS middleware wrapping the whole
	// mux (and, for a WS upgrade specifically, only relevant to browsers —
	// non-browser clients ignore it), so accept anything here.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// wsClient adapts one WebSocket connection to game.Client. Writes are
// serialised through a mutex because gorilla/websocket forbids concurrent
// writes to the same connection from multiple goroutines, and the hub
// broadcasts from whichever client's read-loop goroutine triggered the
// event.
type wsClient struct {
	id   string
	conn *websocket.Conn
	mu   sync.Mutex
}

func (c *wsClient) ID() string { return c.id }

func (c *wsClient) Send(event string, payload interface{}) {
	frame := []interface{}{event, payload}
	data, err := msgpack.Marshal(frame)
	if err != nil {
		log.Printf("encode error for event %q to %s: %v", event, c.id, err)
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
		log.Printf("write error to %s: %v", c.id, err)
	}
}
func newClientID() string {
	buf := make([]byte, 12)
	rand.Read(buf)
	return hex.EncodeToString(buf)
}

func RegisterGameSocket(mux *http.ServeMux, hub *game.Hub, accts *accounts.Accounts, cfg *config.Config) {
	mux.HandleFunc("/socket", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("upgrade error: %v", err)
			return
		}
		client := &wsClient{id: newClientID(), conn: conn}
		hub.Connect(client)
		// Identify the connection's account, if any, so
		// authorizeMapStateUpdate can enforce "só o dono move o próprio
		// personagem" ("Permissões"). The browser
		// WebSocket API can't set an Authorization header, so the token
		// travels as a query param — same trust boundary as everything
		// else here (tailnet-only), and it's still
		// verified against the same session store as every HTTP route.
		// A missing/invalid token just means an unauthenticated
		// connection: unrestricted for anything with no character link,
		// same as before this check existed.
		if token := r.URL.Query().Get("token"); token != "" {
			if acct, ok, err := accts.VerifyAccount(token); err == nil && ok {
				hub.SetClientAccount(client.id, acct.ID)
			}
		}
		// Tell the client its own id immediately, mirroring how
		// socket.io-client exposes `socket.id` right after connecting (the
		// frontend's Session.id getter reads this).
		client.Send("connected", client.id)

		defer func() {
			hub.Disconnect(client.id)
			conn.Close()
		}()

		for {
			msgType, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if msgType != websocket.BinaryMessage {
				continue
			}
			var frame []interface{}
			if err := msgpack.Unmarshal(data, &frame); err != nil {
				log.Printf("decode error from %s: %v", client.id, err)
				continue
			}
			if len(frame) < 1 {
				continue
			}
			event, ok := frame[0].(string)
			if !ok {
				continue
			}
			hub.HandleMessage(client, event, frame[1:])
		}
	})
}
