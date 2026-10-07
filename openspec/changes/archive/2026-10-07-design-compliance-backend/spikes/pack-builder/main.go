// Spike T3: recompute a Payment Passport's integrity values in Go.
//
//	go run . testdata/*.json   check each pack's roots against its own integrity block
//	go run . -roots FILE       print the roots of a pack copy that has no integrity block
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
)

func load(path string) map[string]interface{} {
	raw, err := os.ReadFile(path)
	if err != nil {
		panic(err)
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var v map[string]interface{}
	if err := d.Decode(&v); err != nil {
		panic(err)
	}
	return v
}

func main() {
	if len(os.Args) == 3 && os.Args[1] == "-roots" {
		r := computeRoots(load(os.Args[2]))
		fmt.Printf("%s %s %s\n", r.Master, r.Evidence, r.Projection)
		return
	}
	ok := true
	for _, path := range os.Args[1:] {
		copy := load(path)
		integ := copy["integrity"].(map[string]interface{})
		delete(copy, "integrity")
		r := computeRoots(copy)
		for _, c := range []struct{ name, got, want string }{
			{"master_root", r.Master, integ["master_root"].(string)},
			{"evidence_root", r.Evidence, integ["evidence_root"].(string)},
			{"projection_hash", r.Projection, integ["projection_hash"].(string)},
		} {
			status := "OK  "
			if c.got != c.want {
				status, ok = "FAIL", false
			}
			fmt.Printf("%s %s %s\n", status, path, c.name)
		}
	}
	if !ok {
		os.Exit(1)
	}
}
