// src/lib/judge0/buildHarness.js
// Builds a Python program that runs the student's solution against one test
// case and prints a normalised, comparable result.
//
// Four execution modes (set by problems.execution_mode):
//
//   'return'        — call one function, JSON-compare its return value.
//                     Original behaviour; unchanged.
//
//   'stdout'        — call one function, compare what it print()s to stdout.
//                     Return value is discarded.
//
//   'methods'       — instantiate a class, run a sequence of method/attr
//                     calls; grade the last result (or a caught exception).
//
//   'multi_function'— dynamic dispatch: the test case's input.function field
//                     names which top-level function to call.
//
// A per-test-case 'mode' key in input overrides problems.execution_mode for
// that row only (used by mixed problems like PO-01).
//
// Cross-mode additions (return / multi_function / methods):
//   __construct__   — resolve an argument to a freshly-constructed instance
//   __class_ref__   — resolve to the class object itself
//   __linked_list__ — resolve to a ListNode chain (with optional cycle_to_index)
//   __tree__        — resolve to a TreeNode tree (level-order array)
//   then            — post-process the result before comparison
//                     (method, attr, map, to_list, tree_to_inorder,
//                      tree_to_level_order, call_function, sort_lists, len)
//   input.args      — for return-mode, input can be {"args":[...],"then":{}}
//                     instead of a bare array

// ---------------------------------------------------------------------------
// Python harness template — shared boilerplate injected into every harness
// ---------------------------------------------------------------------------

// The resolver and then-applier are injected as helpers once per harness.
// They are private (underscore-prefixed) so they cannot collide with student
// code in any realistic problem.
const HARNESS_HELPERS = `
# ---- Codely harness helpers (auto-generated) ----
import json as _json
import sys as _sys

def _resolve_arg(_a):
    """Recursively resolve special argument markers."""
    if isinstance(_a, dict):
        if "__construct__" in _a:
            _cls = globals()[_a["__construct__"]]
            return _cls(*[_resolve_arg(_x) for _x in _a.get("args", [])])
        if "__class_ref__" in _a:
            return globals()[_a["__class_ref__"]]
        if "__linked_list__" in _a:
            return _build_ll(_a)
        if "__tree__" in _a:
            return _build_tree(_a["__tree__"])
    if isinstance(_a, list):
        return [_resolve_arg(_x) for _x in _a]
    return _a

# ---- Linked-list helpers ----
def _build_ll(_spec):
    _values = _spec["__linked_list__"]
    _cycle_to = _spec.get("cycle_to_index")
    if not _values:
        return None
    # ListNode must already be defined in the student's submission.
    _nodes = [ListNode(_v) for _v in _values]
    for _i in range(len(_nodes) - 1):
        _nodes[_i].next = _nodes[_i + 1]
    if _cycle_to is not None:
        _nodes[-1].next = _nodes[_cycle_to]
    return _nodes[0]

def _ll_to_list(_head):
    _result, _seen = [], set()
    while _head and id(_head) not in _seen:
        _seen.add(id(_head))
        _result.append(_head.val)
        _head = _head.next
    return _result

# ---- Binary-tree helpers ----
def _build_tree(_values):
    if not _values or _values[0] is None:
        return None
    # TreeNode must already be defined in the student's submission.
    _root = TreeNode(_values[0])
    _queue = [_root]
    _i = 1
    while _queue and _i < len(_values):
        _node = _queue.pop(0)
        if _i < len(_values):
            if _values[_i] is not None:
                _node.left = TreeNode(_values[_i])
                _queue.append(_node.left)
            _i += 1
        if _i < len(_values):
            if _values[_i] is not None:
                _node.right = TreeNode(_values[_i])
                _queue.append(_node.right)
            _i += 1
    return _root

def _tree_to_inorder(_node):
    if not _node:
        return []
    return _tree_to_inorder(_node.left) + [_node.val] + _tree_to_inorder(_node.right)

def _tree_to_level_order(_root):
    if not _root:
        return []
    _result, _queue = [], [_root]
    while _queue:
        _level = [_n.val for _n in _queue]
        _result.append(_level)
        _queue = [_c for _n in _queue for _c in (_n.left, _n.right) if _c]
    return _result

def _apply_then(_result, _then):
    """Apply a 'then' post-processing step (or list of steps) to _result."""
    if _then is None:
        return _result
    # then can be a list of sequential operations
    if isinstance(_then, list):
        for _step in _then:
            _result = _apply_then(_result, _step)
        return _result
    # Single step
    if "to_list" in _then:
        # None-safe: _ll_to_list(None) -> []
        return _ll_to_list(_result)
    if "tree_to_inorder" in _then:
        return _tree_to_inorder(_result)
    if "tree_to_level_order" in _then:
        return _tree_to_level_order(_result)
    if "sort_lists" in _then:
        # Canonicalise a list of lists by sorting on (len, value) so output
        # order doesn't matter (e.g. power_set).
        return sorted([sorted(_x) if isinstance(_x, list) else _x for _x in _result],
                      key=lambda _x: (len(_x), _x) if isinstance(_x, list) else (0, _x))
    if "len" in _then:
        return len(_result)
    # Remaining steps short-circuit on None (attr access would crash).
    if _result is None:
        return None
    if "call_function" in _then:
        return globals()[_then["call_function"]](_result)
    if "method" in _then:
        return getattr(_result, _then["method"])(*_then.get("args", []))
    if "attr" in _then:
        return getattr(_result, _then["attr"])
    if "map" in _then:
        _op = _then["map"]
        if "method" in _op:
            return [getattr(_item, _op["method"])(*_op.get("args", [])) for _item in _result]
        if "attr" in _op:
            return [getattr(_item, _op["attr"]) for _item in _result]
    return _result
`;

// ---------------------------------------------------------------------------
// Tail generators — one per mode
// ---------------------------------------------------------------------------

/**
 * Mode: 'return'
 * input is a bare JSON array OR {"args":[...], "then":{...}}.
 * Exceptions crash the process (same as original behaviour — the grader
 * sees a runtime error status from Judge0, not a {"raises":...} wrapper).
 */
function _returnTail(functionName, inputJson, thenJson) {
  return `
def _codely_main():
    _raw_input = _json.loads(${JSON.stringify(inputJson)})
    if isinstance(_raw_input, list):
        _args = [_resolve_arg(_a) for _a in _raw_input]
        _then = None
    else:
        _args = [_resolve_arg(_a) for _a in _raw_input.get("args", [])]
        _then = _raw_input.get("then")
    try:
        _result = ${functionName}(*_args)
    except Exception as _e:
        _sys.stderr.write("RUNTIME_ERROR: " + repr(_e))
        _sys.exit(1)
    _result = _apply_then(_result, _then)
    _sys.stdout.write(_json.dumps(_result))

_codely_main()
`;
}

/**
 * Mode: 'stdout'
 * Return value discarded; the student's print() calls ARE the graded output.
 * input is a bare JSON array of positional args.
 */
function _stdoutTail(functionName, inputJson) {
  return `
def _codely_main():
    _args = [_resolve_arg(_a) for _a in _json.loads(${JSON.stringify(inputJson)})]
    try:
        ${functionName}(*_args)
    except Exception as _e:
        _sys.stderr.write("RUNTIME_ERROR: " + repr(_e))
        _sys.exit(1)
    # Harness prints nothing — student's print() is the entire stdout.

_codely_main()
`;
}

/**
 * Mode: 'methods'
 * input = { class?, constructor_args, calls:[{method|attr, args?, on?}], then? }
 * OR shared_construction (LL-09 special case).
 * Grades the last call's result, or a caught exception.
 */
function _methodsTail(className, inputJson) {
  // className is the fallback from problem_languages.class_name;
  // input.class overrides it per test case.
  return `
def _codely_main():
    _spec = _json.loads(${JSON.stringify(inputJson)})

    # LL-09 shared-tail construction
    if "shared_construction" in _spec:
        _sc = _spec["shared_construction"]
        _shared = _build_ll({"__linked_list__": _sc["shared_tail"]})
        def _build_prefix(_vals, _tail):
            if not _vals:
                return _tail
            _nodes = [ListNode(_v) for _v in _vals]
            for _i in range(len(_nodes) - 1):
                _nodes[_i].next = _nodes[_i + 1]
            _nodes[-1].next = _tail
            return _nodes[0]
        _headA = _build_prefix(_sc["a_prefix"], _shared)
        _headB = _build_prefix(_sc["b_prefix"], _shared)
        try:
            _node = get_intersection(_headA, _headB)
            _result = _node.val if _node is not None else None
            _sys.stdout.write(_json.dumps({"value": _result}))
        except Exception as _e:
            _sys.stdout.write(_json.dumps({"raises": type(_e).__name__}))
        return

    _class_name = _spec.get("class", ${JSON.stringify(className)})
    _cls = globals()[_class_name]
    _then = _spec.get("then")
    _result = None
    try:
        _obj = _cls(*[_resolve_arg(_a) for _a in _spec.get("constructor_args", [])])
        for _c in _spec.get("calls", []):
            _receiver = _result if _c.get("on") == "result" else _obj
            if "attr" in _c:
                _result = None if _receiver is None else getattr(_receiver, _c["attr"])
            else:
                _method = getattr(_receiver, _c["method"])
                _resolved = [_resolve_arg(_a) for _a in _c.get("args", [])]
                _result = _method(*_resolved)
        _result = _apply_then(_result, _then)
        _sys.stdout.write(_json.dumps({"value": _result}))
    except Exception as _e:
        _sys.stdout.write(_json.dumps({"raises": type(_e).__name__}))

_codely_main()
`;
}

/**
 * Mode: 'multi_function'
 * input = { function, args, then? }
 * Normal results unwrapped (JSON-compare the raw value).
 * Exception: {"raises":"ExcName"} wrapper (mirrors methods mode).
 */
function _multiFunctionTail(inputJson) {
  return `
def _codely_main():
    _spec = _json.loads(${JSON.stringify(inputJson)})
    _func = globals()[_spec["function"]]
    _args = [_resolve_arg(_a) for _a in _spec.get("args", [])]
    _then = _spec.get("then")
    _expected_raises = isinstance(_spec.get("expected_output"), dict) and "raises" in _spec.get("expected_output", {})
    try:
        _result = _func(*_args)
        _result = _apply_then(_result, _then)
        _sys.stdout.write(_json.dumps(_result))
    except Exception as _e:
        _sys.stdout.write(_json.dumps({"raises": type(_e).__name__}))

_codely_main()
`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a complete Python program for Judge0.
 *
 * @param {object}  params
 * @param {string}  params.studentCode   - the student's full source
 * @param {string}  params.mode          - 'return' | 'stdout' | 'methods' | 'multi_function'
 * @param {*}       params.tcInput       - test_cases.input (parsed JS value, not yet stringified)
 * @param {string}  [params.functionName]- required for 'return' and 'stdout' modes
 * @param {string}  [params.className]   - required for 'methods' mode (fallback class name)
 * @returns {string} a complete Python program
 */
export function buildHarness({
  studentCode,
  mode,
  tcInput,
  functionName,
  className,
}) {
  // The input is embedded as a JSON literal so we never string-interpolate
  // raw values into code (avoids injection/quoting bugs, keeps types intact).
  const inputJson = JSON.stringify(tcInput);

  let tail;
  switch (mode) {
    case "stdout":
      tail = _stdoutTail(functionName, inputJson);
      break;
    case "methods":
      tail = _methodsTail(className ?? "UnknownClass", inputJson);
      break;
    case "multi_function":
      tail = _multiFunctionTail(inputJson);
      break;
    case "return":
    default:
      tail = _returnTail(functionName, inputJson);
      break;
  }

  return `${studentCode}
${HARNESS_HELPERS}${tail}`;
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

/**
 * Compare the raw Judge0 stdout against test_cases.expected_output.
 *
 * For 'stdout' mode: strip exactly one trailing newline and compare as strings.
 * For all other modes: JSON-normalise both sides.
 *
 * @param {string} stdout           - raw stdout from Judge0 (jr.stdout)
 * @param {*}      expectedOutput   - test_cases.expected_output (parsed JS value)
 * @param {string} mode             - execution mode
 * @returns {{ passed: boolean, actualDisplay: string }}
 */
export function compareResult(stdout, expectedOutput, mode) {
  if (mode === "stdout") {
    // Strip exactly one trailing newline (Python's print() adds one).
    // Do NOT fully trim — leading/internal whitespace in multi-line output matters.
    const actual = (stdout ?? "").replace(/\n$/, "");
    // expected_output is a JSON string containing the expected stdout text.
    const expected =
      typeof expectedOutput === "string"
        ? expectedOutput
        : String(expectedOutput);
    return { passed: actual === expected, actualDisplay: actual };
  }

  // JSON-normalised comparison for return / methods / multi_function.
  return {
    passed: normalizeForCompare(stdout) === normalizeForCompare(expectedOutput),
    actualDisplay: (stdout ?? "").trim(),
  };
}

/**
 * Normalize a value for comparison by round-tripping through JSON.
 * Both the harness stdout and the expected_output are compared this way
 * (except stdout mode, which uses raw string comparison via compareResult).
 */
export function normalizeForCompare(value) {
  try {
    if (typeof value === "string") {
      return JSON.stringify(JSON.parse(value));
    }
    return JSON.stringify(value);
  } catch {
    return String(value).trim();
  }
}

/**
 * Derive a function name from a stored function_signature like
 * "def is_even(n):" -> "is_even". Falls back to null if unparseable.
 */
export function functionNameFromSignature(signature) {
  if (!signature) return null;
  const match = signature.match(/def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  return match ? match[1] : null;
}

/**
 * Derive a class name from a stored class_name string like
 * "class StudentManager:" -> "StudentManager".
 * Also handles a bare name like "StudentManager" (no "class" keyword).
 */
export function classNameFromSpec(spec) {
  if (!spec) return null;
  const match = spec.match(/(?:class\s+)?([A-Za-z_][A-Za-z0-9_]*)/);
  return match ? match[1] : null;
}
