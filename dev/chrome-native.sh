#!/bin/sh
# Node here is an Intel build running under Rosetta, and Chrome launched from
# it inherits that and runs translated too, which makes every JIT, WASM and
# shader timing several times slower than on a real machine. This starts the
# native Apple Silicon slice of Chrome instead.
exec arch -arm64 "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$@"
