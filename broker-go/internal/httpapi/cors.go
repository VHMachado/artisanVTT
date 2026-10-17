// Package httpapi wires HTTP routes, mirroring backend/src/index.ts and the
// controllers under backend/src/controllers.
package httpapi

import (
	"net/http"
	"regexp"
)

// WithCORS mirrors index.ts's cors(corsConfig) + helmet(): allow the given
// origin regex (ALLOW_ORIGIN), reflect it back with credentials, and set a
// conservative set of security headers roughly matching helmet's defaults
// (helmet itself doesn't have a direct Go equivalent in the stdlib, so the
// headers that matter for a same-origin webview/browser client are set by
// hand here).
func WithCORS(originWhitelist string, next http.Handler) http.Handler {
	var re *regexp.Regexp
	if originWhitelist != "" {
		re = regexp.MustCompile(originWhitelist)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && re != nil && re.MatchString(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
