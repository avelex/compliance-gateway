package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// canon reproduces the verifier's canonical form exactly:
//
//	json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
//
// Within the pack schema's constraints (no floats, ASCII-only keys) this is byte-identical to
// RFC 8785. encoding/json is not used for output: it escapes <, >, & and U+2028/U+2029, which
// Python and RFC 8785 both leave as is.
func canon(v interface{}) []byte {
	var b bytes.Buffer
	write(&b, v)
	return b.Bytes()
}

func write(b *bytes.Buffer, v interface{}) {
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
	case string:
		writeString(b, x)
	case []interface{}:
		b.WriteByte('[')
		for i, e := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			write(b, e)
		}
		b.WriteByte(']')
	case map[string]interface{}:
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
		panic(fmt.Sprintf("unsupported %T", v))
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
