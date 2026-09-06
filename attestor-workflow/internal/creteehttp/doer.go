package creteehttp

import (
	"bytes"
	"io"
	"net/http"

	crehttp "github.com/smartcontractkit/cre-sdk-go/capabilities/networking/http"
	"github.com/smartcontractkit/cre-sdk-go/cre"
)

type Doer struct {
	Runtime cre.TeeRuntime
	Client  *crehttp.Client
}

func New(runtime cre.TeeRuntime) *Doer {
	return &Doer{Runtime: runtime, Client: &crehttp.Client{}}
}

func (d *Doer) Do(req *http.Request) (*http.Response, error) {
	var body []byte
	if req.Body != nil {
		var err error
		body, err = io.ReadAll(req.Body)
		if err != nil {
			return nil, err
		}
	}

	multiHeaders := make(map[string]*crehttp.HeaderValues, len(req.Header))
	for key, values := range req.Header {
		multiHeaders[key] = &crehttp.HeaderValues{Values: values}
	}

	resp, err := d.Client.SendRequestInTee(d.Runtime, &crehttp.Request{
		Url:          req.URL.String(),
		Method:       req.Method,
		Body:         body,
		MultiHeaders: multiHeaders,
	}).Await()

	if err != nil {
		return nil, err
	}

	header := make(http.Header, len(resp.MultiHeaders))
	for key, values := range resp.MultiHeaders {
		header[key] = values.Values
	}

	return &http.Response{
		StatusCode: int(resp.StatusCode),
		Header:     header,
		Body:       io.NopCloser(bytes.NewReader(resp.Body)),
	}, nil
}
