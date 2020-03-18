#!/bin/sh
NEXT=
NODE_ARGS=()
SCRIPT_ARGS=()
while (( "$#" )); do
	if [[ "$1" == "--" ]]; then NEXT=1; shift; continue; fi
	if [[ "$NEXT" ]]; then
		SCRIPT_ARGS+=("$1")
	else
		NODE_ARGS+=("$1")
	fi
	shift
done

if [[ -z "$SCRIPT_ARGS" ]]; then
	SCRIPT_ARGS=("${NODE_ARGS[@]}")
	NODE_ARGS=()
fi

exec node "${NODE_ARGS[@]}" --harmony -r $(dirname "$0")/env.js "${SCRIPT_ARGS[@]}"
