# Spike T3: Payment Passport integrity in Go

`go run . testdata/passport_*.json` recomputes `master_root`, `evidence_root` and `projection_hash` for both
specimens and matches their integrity blocks. `vectors.py` generates three edge-case packs and computes their
roots with `verify_pack.py`'s own `node`/`canon`. Go agrees on all three:

```sh
python vectors.py gen
for f in testdata/edge-*.json; do go run . -roots $f; python vectors.py roots $f; done   # pairs must be equal
```

| Vector | Covers |
|---|---|
| `edge-non-ascii` | Latin-1, CJK, astral emoji, U+2028, quote, backslash, tab, C0 control |
| `edge-numeric-strings` | `"0.10"`, `"4800.00"`, `"1e3"`, `"-0"`, a 78-digit string, plain integers |
| `edge-empty-and-withheld` | empty arrays and objects as salted leaves, nested empties, a `$withheld` node |

## Findings

1. **The verifier's canonical form is Python's `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)`,
   not RFC 8785.** The two agree only if the pack follows two schema rules. Both specimens follow them:
   - **No non-integer JSON numbers.** Python re-renders `1e3` as `1000.0`, while RFC 8785 gives `1000`. Amounts,
     rates and scores are already decimal strings (Annex 2). The Go builder rejects a float outright.
   - **ASCII-only object keys.** Python sorts keys by code point, while RFC 8785 sorts by UTF-16 code unit. The two
     orders differ only for keys mixing astral characters with U+E000–U+FFFF. All schema keys are ASCII
     identifiers; values may hold any Unicode.
2. **Go's `encoding/json` cannot produce the canonical form.** It escapes `<`, `>`, `&`, U+2028 and U+2029.
   `canon.go` is a 90-line writer that matches the verifier byte for byte.
3. **Empty containers are salted leaves.** `[]` and `{}` are hashed with their own salt and are not recursed into,
   so the builder must issue a salt for every empty container path.
4. **A `$withheld` node contributes its stored hash unchanged.** That is what lets a projection reproduce the
   master root without the redacted data. Projection code must store the subtree hash, never a fresh one.
