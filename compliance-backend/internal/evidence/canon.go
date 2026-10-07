// Package evidence builds Payment Passports (schema deflow-evidence/1.0) and their integrity values,
// byte-compatible with docs/evidence-pack/verify_pack.py.
package evidence

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Canon reproduces the verifier's canonical form exactly:
//
//	json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
//
// Within the pack schema's constraints (no floats, ASCII-only keys) this is byte-identical to
// RFC 8785. encoding/json is not used for output: it escapes <, >, & and U+2028/U+2029, which
// Python and RFC 8785 both leave as is.
func Canon(v any) (out []byte, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("canonical json: %v", r)
		}
	}()
	var b bytes.Buffer
	write(&b, v)
	return b.Bytes(), nil
}

func mustCanon(v any) []byte {
	b, err := Canon(v)
	if err != nil {
		panic(err)
	}
	return b
}

func write(b *bytes.Buffer, v any) {
	switch x := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if x {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case json.Number:
		if strings.ContainsAny(string(x), ".eE") {
			// Python would re-render a float (1e3 -> 1000.0), RFC 8785 differently again (1000).
			panic(fmt.Sprintf("non-integer number %s: the pack schema requires decimal strings", x))
		}
		b.WriteString(string(x))
	case int:
		b.WriteString(strconv.Itoa(x))
	case int64:
		b.WriteString(strconv.FormatInt(x, 10))
	case uint64:
		b.WriteString(strconv.FormatUint(x, 10))
	case string:
		writeString(b, x)
	case []any:
		b.WriteByte('[')
		for i, e := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			write(b, e)
		}
		b.WriteByte(']')
	case []string:
		l := make([]any, len(x))
		for i, s := range x {
			l[i] = s
		}
		write(b, l)
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys) // byte order of UTF-8 == code point order == Python's sort for str keys
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			writeString(b, k)
			b.WriteByte(':')
			write(b, x[k])
		}
		b.WriteByte('}')
	default:
		panic(fmt.Sprintf("unsupported %T (floats are not allowed; use decimal strings)", v))
	}
}

// Python's py_encode_basestring with ensure_ascii=False: escape only quote, backslash and C0 controls.
func writeString(b *bytes.Buffer, s string) {
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		default:
			if r < 0x20 {
				fmt.Fprintf(b, `\u%04x`, r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
}

// SHA returns the lowercase hex SHA-256 of b.
func SHA(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

// Decode parses JSON keeping numbers as json.Number, the form the builder and Canon expect.
func Decode(raw []byte, v any) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	return d.Decode(v)
}
