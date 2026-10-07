package decision

import "errors"

// Status mirrors ProcessorHub: None is PENDING.
type Status uint8

const (
	None Status = iota
	Held
	Credited
	Returned
)

// State of one payment after its decisions so far.
type State struct {
	Status Status
	Frozen bool
}

var (
	ErrTerminal = errors.New("payment is already CREDITED or RETURNED")
	ErrFrozen   = errors.New("a frozen payment accepts only CREDIT or a new FREEZE")
)

// Next applies kind to s with the same rules as ProcessorHub._execute.
func Next(s State, kind uint8) (State, error) {
	if s.Status == Credited || s.Status == Returned {
		return s, ErrTerminal
	}
	if s.Frozen && (kind == Return || kind == Hold) {
		return s, ErrFrozen
	}
	switch kind {
	case Credit:
		return State{Status: Credited, Frozen: s.Frozen}, nil
	case Return:
		return State{Status: Returned}, nil
	case Hold:
		return State{Status: Held}, nil
	case Freeze:
		return State{Status: Held, Frozen: true}, nil
	}
	return s, errors.New("unknown decision kind")
}

// Replay folds a decision history into its state.
func Replay(kinds []uint8) (State, error) {
	var s State
	for _, k := range kinds {
		var err error
		if s, err = Next(s, k); err != nil {
			return s, err
		}
	}
	return s, nil
}
