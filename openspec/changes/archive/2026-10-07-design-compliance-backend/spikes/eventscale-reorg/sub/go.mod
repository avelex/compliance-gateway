module spike/sub

go 1.27

require github.com/eventscale/eventscale v0.0.0

// eventscale cloned next to this directory: spikes/eventscale-reorg/eventscale
replace github.com/eventscale/eventscale => ../eventscale
