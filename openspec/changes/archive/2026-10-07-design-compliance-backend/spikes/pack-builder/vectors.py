"""Spike T3 edge-case vectors.

  python vectors.py gen            write testdata/edge-*.json (pack copies without an integrity block)
  python vectors.py roots FILE     print master_root, evidence_root, projection_hash using verify_pack.py's own functions

Salts are sha256(path) so the vectors are reproducible; real packs use 32 random bytes per leaf.
"""
import hashlib
import importlib.util
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
# The verifier lives in docs/evidence-pack/ at the repo root; found by walking up, so the path depth does not matter.
VERIFIER = next(p / "docs/evidence-pack/verify_pack.py" for p in HERE.parents
                if (p / "docs/evidence-pack/verify_pack.py").exists())


def verifier():
    spec = importlib.util.spec_from_file_location("verify_pack", VERIFIER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def salts_for(v, path="", out=None):
    out = {} if out is None else out
    leaf = not ((isinstance(v, dict) and v) or (isinstance(v, list) and v))
    if isinstance(v, dict) and set(v) == {"$withheld"}:
        return out
    if leaf:
        out[path] = hashlib.sha256(path.encode()).hexdigest()
    elif isinstance(v, dict):
        for k, x in v.items():
            salts_for(x, f"{path}.{k}" if path else k, out)
    else:
        for i, x in enumerate(v):
            salts_for(x, f"{path}.{i}" if path else str(i), out)
    return out


def pack(name, extra):
    data = {"pack_id": f"edge-{name}", "payment_ref": "INV-EDGE", "onchain": {"chain_id": 84532, "amount": "1.00"},
            "travel_rule": {}, "wallet_ownership": {}, "kyt": {}, "sanctions": {}, "structuring": {},
            "issuer": {}, "rules": {}}
    data.update(extra)
    return {"schema_version": "deflow-evidence/1.0", "pack_id": data["pack_id"], "profile": "MASTER",
            "data": data, "salts": salts_for(data)}


VECTORS = {
    "non-ascii": {"travel_rule": {"originator": {
        "name": "Zoë Ångström-李雷 \U0001F642",       # Latin-1, CJK, astral emoji
        "address": "Line Sep \"quoted\" back\\slash",  # U+2028, quote, backslash
        "note": "tab\there\x01ctl",                     # tab and a C0 control
    }}},
    "numeric-strings": {"onchain": {"chain_id": 84532, "block_number": 25874309, "amount": "0.10",
                                    "amount_eur": "4800.00", "fx_rate_eur": "1.0000", "exp": "1e3",
                                    "neg_zero": "-0", "big": "115792089237316195423570985008687907853269984665640564039457584007913129639935"}},
    "empty-and-withheld": {"kyt": {"alerts": [], "exposures": [], "meta": {}},
                           "structuring": {"linked_pack_ids": [], "features": [[], {}]},
                           "travel_rule": {"originator": {"identifier": {"$withheld": "ab" * 32}}}},
}

if __name__ == "__main__":
    if sys.argv[1] == "gen":
        for name, extra in VECTORS.items():
            (HERE / "testdata" / f"edge-{name}.json").write_text(
                json.dumps(pack(name, extra), ensure_ascii=False, indent=1), encoding="utf-8")
    else:
        v = verifier()
        copy = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8"))
        data, salts = copy["data"], copy["salts"]
        ev = v.sha(v.canon({k: v.node(data[k], salts, k) for k in v.EVIDENCE_KEYS}))
        print(v.node(data, salts), ev, v.sha(v.canon(copy)))
