package checks

import (
	"fmt"
	"math/big"
	"strings"
)

// FormatUnits renders a token amount as a decimal string with at least two decimals ("250.00", "1.234567").
func FormatUnits(amount *big.Int, decimals uint8) string {
	s := new(big.Rat).SetFrac(amount, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil)).FloatString(int(decimals))
	if i := strings.IndexByte(s, '.'); i >= 0 {
		s = strings.TrimRight(s, "0")
		if len(s)-i-1 < 2 {
			s += strings.Repeat("0", 2-(len(s)-i-1))
		}
	} else {
		s += ".00"
	}
	return s
}

// EUR converts a token amount at rate to EUR, rounded half up to cents. No floats are involved.
func EUR(amount *big.Int, decimals uint8, rate string) (string, error) {
	r, ok := new(big.Rat).SetString(rate)
	if !ok {
		return "", fmt.Errorf("bad rate %q", rate)
	}
	v := new(big.Rat).SetFrac(amount, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil))
	return v.Mul(v, r).FloatString(2), nil // FloatString rounds half away from zero; amounts are non-negative
}

// ParseDecimal parses a decimal string such as "950.00".
func ParseDecimal(s string) (*big.Rat, error) {
	r, ok := new(big.Rat).SetString(s)
	if !ok {
		return nil, fmt.Errorf("bad decimal %q", s)
	}
	return r, nil
}
