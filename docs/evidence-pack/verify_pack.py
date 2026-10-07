"""Independent check of a Payment Passport: uses only the PDF and its attached JSON, or a JSON copy.

Recomputes the copy hash, rebuilds the salted hash tree to the master root and the evidence root,
and compares them with the values stated in the integrity block (and, for a PDF, printed in its text).

    python verify_pack.py passport.pdf        # needs pypdf
    python verify_pack.py passport.json       # a JSON projection as issued by compliance-backend
"""
import hashlib
import json
import sys

EVIDENCE_KEYS = ["pack_id", "payment_ref", "onchain", "travel_rule", "wallet_ownership", "kyt",
                 "sanctions", "structuring", "issuer", "rules"]


def canon(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def is_leaf(v):
    return not ((isinstance(v, dict) and v) or (isinstance(v, list) and v))


def join(path, k):
    return f"{path}.{k}" if path else str(k)


def node(v, salts, path=""):
    if isinstance(v, dict) and set(v) == {"$withheld"}:
        return v["$withheld"]
    if is_leaf(v):
        return sha(bytes.fromhex(salts[path]) + canon(v))
    if isinstance(v, dict):
        return sha(canon({k: node(x, salts, join(path, k)) for k, x in v.items()}))
    return sha(canon([node(x, salts, join(path, i)) for i, x in enumerate(v)]))


def check_copy(copy, reporting=None, text=None):
    """Checks one pack copy (a dict with data, salts and integrity); reporting records and PDF text are optional."""
    copy = dict(copy)
    integ = copy.pop("integrity")
    data, salts = copy["data"], copy["salts"]
    results = {
        "copy hash": sha(canon(copy)) == integ["projection_hash"],
        "master root": node(data, salts) == integ["master_root"],
        "evidence root": sha(canon({k: node(data[k], salts, k) for k in EVIDENCE_KEYS})) == integ["evidence_root"],
    }
    if text is not None:
        results["printed in PDF"] = all(integ[k] in text for k in ("projection_hash", "master_root", "evidence_root"))
    for rep in reporting or []:
        if text is not None:
            results["reporting record hash printed"] = sha(canon(rep)) in text
        results["reporting linked to master root"] = rep["pack_master_root"] == integ["master_root"]
    return results


def check(path):
    if path.endswith(".json"):
        with open(path, encoding="utf-8") as f:
            return path.rsplit("/", 1)[-1], check_copy(json.load(f))
    from pypdf import PdfReader  # only PDFs need it

    reader = PdfReader(path)
    atts = {name: blobs[0] for name, blobs in reader.attachments.items()}
    text = " ".join(p.extract_text() for p in reader.pages).replace("\n", "")
    name = next(n for n in atts if n.startswith("passport_"))
    reporting = [json.loads(blob) for n, blob in atts.items() if n.startswith("reporting_")]
    return name, check_copy(json.loads(atts[name]), reporting, text)


if __name__ == "__main__":
    ok = True
    for path in sys.argv[1:]:
        name, res = check(path)
        print(path.rsplit("/", 1)[-1], "->", name)
        for k, v in res.items():
            print(f"  {'OK  ' if v else 'FAIL'} {k}")
            ok &= v
    sys.exit(0 if ok else 1)
