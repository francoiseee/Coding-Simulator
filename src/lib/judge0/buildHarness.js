// src/lib/judge0/buildHarness.js
// Builds a Python program that runs the student's function-based solution
// against one test case and prints a normalized, comparable result.
//
// Our problems are function-based: the student writes e.g. `def is_even(n):`.
// Test cases store positional args as a JSON array (e.g. [4]) and the expected
// return value as a JSON scalar/array (e.g. true). Judge0 only gives us
// stdin/stdout, so this harness bridges the gap: it appends a runner that
// imports nothing (student code is inlined above it), calls the target
// function with the test args, and prints the JSON-encoded return value.
//
// We compare the harness's printed JSON against the JSON-encoded expected
// output, which sidesteps whitespace/format differences (e.g. Python's
// `True` vs JSON `true`) by normalizing both sides through JSON.

/**
 * @param {object} params
 * @param {string} params.studentCode - the student's full source (defines the function)
 * @param {string} params.functionName - the function to call, e.g. "is_even"
 * @param {Array}  params.args - positional arguments for this test case
 * @returns {string} a complete Python program for Judge0
 */
export function buildHarness({ studentCode, functionName, args }) {
  // The args are embedded as a JSON literal and parsed inside Python, so we
  // never string-interpolate raw values into code (avoids injection/quoting
  // bugs and keeps types intact).
  const argsJson = JSON.stringify(args);

  return `${studentCode}

# ---- Codely test harness (auto-generated, not written by the student) ----
import json as _json
import sys as _sys

def _codely_main():
    _args = _json.loads(${JSON.stringify(argsJson)})
    try:
        _result = ${functionName}(*_args)
    except Exception as _e:
        _sys.stderr.write("RUNTIME_ERROR: " + repr(_e))
        _sys.exit(1)
    # Print the return value as compact JSON so it can be compared reliably.
    _sys.stdout.write(_json.dumps(_result))

_codely_main()
`;
}

/**
 * Normalize a value for comparison by round-tripping through JSON.
 * Both the harness stdout and the expected_output are compared this way.
 */
export function normalizeForCompare(value) {
  try {
    // If it's already a JSON string (harness stdout), parse then re-stringify.
    if (typeof value === "string") {
      return JSON.stringify(JSON.parse(value));
    }
    return JSON.stringify(value);
  } catch {
    // Not valid JSON — compare trimmed raw string.
    return String(value).trim();
  }
}

/**
 * Derive the function name from a stored function_signature like
 * "def is_even(n):" -> "is_even". Falls back to null if it can't parse.
 */
export function functionNameFromSignature(signature) {
  if (!signature) return null;
  const match = signature.match(/def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  return match ? match[1] : null;
}
