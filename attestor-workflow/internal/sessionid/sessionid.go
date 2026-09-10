package sessionid

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func SessionUserID(secret, gate, wallet string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(strings.ToLower(gate) + strings.ToLower(wallet)))
	return "cg-" + hex.EncodeToString(m.Sum(nil))
}
