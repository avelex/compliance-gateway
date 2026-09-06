package sumsubapi

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"attestor-workflow/internal/httpx"
)

type Client struct {
	BaseURL    string
	AppToken   string
	SecretKey  string
	HTTPClient httpx.Doer
}

func (c *Client) Do(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	ts := strconv.FormatInt(time.Now().Unix(), 10)

	mac := hmac.New(sha256.New, []byte(c.SecretKey))
	mac.Write([]byte(ts + method + path))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-App-Token", c.AppToken)
	req.Header.Set("X-App-Access-Sig", sig)
	req.Header.Set("X-App-Access-Ts", ts)
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}

	return c.HTTPClient.Do(req)
}

func (c *Client) DoJSONOK(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	resp, err := c.Do(ctx, method, path, body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		return nil, fmt.Errorf("sumsub: unexpected status %d for %s %s", resp.StatusCode, method, path)
	}
	return resp, nil
}
