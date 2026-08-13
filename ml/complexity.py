"""
complexity.py — Feature 4: estimated procedural complexity.

Renamed from "Time Complexity Estimator" to "Procedural Complexity Estimator"
per Mr. Arnaz De Jesus's expert review sign-off (08 Aug 2026): the method is
structural/procedural static analysis (loop nesting, recursion shape, sort
calls), not true asymptotic time-complexity analysis, and the new name
reflects that more accurately. See Codely_Decision_ExpertSignOff_Aug2026.docx.
This is a naming change only — the method, bucket definitions, and documented
limitations below are unchanged.

STATUS: IMPLEMENTED AND REVIEWED. Approved as-is by Mr. Arnaz De Jesus on
08 Aug 2026 (see Codely_Decision_ExpertSignOff_Aug2026.docx). REVIEWED_BY_EXPERT
in ml/config.py was flipped to True on 12 Aug 2026 covering this feature and
the M0 two-class model together. A trained model saved from this point forward
carries that sign-off; a model saved before 12 Aug 2026 should be treated as
internal validation only, not a defensible result.

METHOD
------
Coarse bucketing by loop-nesting depth via Python's `ast` module, exactly as
scoped in the decision record, with two refinements added on 7 August 2026
(see CHANGELOG below):

    0 -> constant / no loops, no recursion
    1 -> single loop (or one level of loop-like iteration), linear-ish
    2 -> nested loop (two levels), OR a single self-recursive call site
    3 -> three+ levels of nesting, OR 2+ distinct self-recursive call sites

"Loop-like iteration" includes `for`, `while`, and comprehension/generator
`for` clauses (`[x for x in y]` counts as one level; `[x for x in y for z in
w]` counts as two).

Recursion is no longer a flat "always bucket 3." A function with exactly one
self-call site (e.g. `factorial`: `return n * factorial(n - 1)`) is bucketed
as NESTED_LOOP — a reasonable stand-in for the linear recursion case. A
function with two or more distinct self-call sites in its body (e.g. `fib`:
`return fib(n-1) + fib(n-2)`) is bucketed as DEEP_OR_RECURSIVE, since branching
self-calls are the shape that produces exponential blow-up. This is call-site
counting, not a call-graph analysis or a branching-factor proof — it is a
heuristic that separates the two most common interview-problem shapes
(single-path recursion vs. tree/branching recursion), not a general solution.

Calls to `sorted(...)` or a `.sort()` method are no longer invisible. A bare
sort call with no surrounding loop bumps the bucket up to at least SINGLE_LOOP
(1) rather than leaving it at CONSTANT_OR_NO_LOOP (0) — sorting is never O(1)
work. A sort call found inside a loop bumps the bucket one further level,
capped at DEEP_OR_RECURSIVE (3).

CHANGELOG
---------
2026-08-07: Two refinements to the original 7 Aug morning implementation,
prompted by review of the "biggest gap" limitations that version documented
against itself:
  1. Recursion granularity — single self-call vs. 2+ self-call sites, instead
     of a flat bucket-3-for-any-recursion rule (see METHOD above).
  2. `sorted()` / `.sort()` detection — previously fully invisible, now bumps
     the bucket (see METHOD above).
Both remain heuristics, not precise complexity analysis. Their own limits are
documented below and must still be stated plainly in the paper.

`submissions.source_code` holds only the student's function definition — the
Judge0 test harness is generated at run time and never stored (see
buildHarness.js) — so the estimator only ever sees the student's own code,
never harness boilerplate.

WHAT THIS DOES NOT AND CANNOT CLAIM
------------------------------------
This is structural approximation, not Big-O detection. State these plainly in
the limitations section — do not let a panelist discover them first:

  - A nested loop over a small fixed-size list is bucketed the same as a
    nested loop over the full input. Static analysis has no idea what "small"
    means at grading time.
  - Only `sorted()` and `.sort()` are recognised as sort-like. Other built-ins
    with real cost — `sum()`, `min()`, `max()`, `x in some_list`, `str.join`,
    list concatenation with `+` in a loop, `itertools` functions — remain fully
    invisible, treated as free. Sort detection closes the single most common
    case in interview-style problems, not the general problem of built-in
    cost.
  - Recursion detection is direct self-recursion only, found by name (a
    function calling its own name, or a method calling `self.<its own name>`).
    Mutual recursion (A calls B calls A) is not detected and will under-bucket.
  - Recursion granularity is call-SITE counting, not a branching-factor proof.
    A function with one self-call site is assumed linear-shaped; two or more
    self-call sites are assumed branching/exponential-shaped. This separates
    the two most common interview-problem patterns but is still an
    approximation: a single-call-site function that recurses over both halves
    of its input via one call in a loop (unusual but possible) would be
    under-bucketed, and a two-call-site function that is actually memoised
    (`@lru_cache`) would be over-bucketed, since memoisation is not detected at
    all. This is a real improvement over the flat "any recursion = bucket 3"
    rule it replaces, not a solved problem — name it as an approximation if
    asked in defense, not as branching-factor analysis.
  - Code that fails to parse (syntax errors, or anything not valid Python)
    returns NOT_IMPLEMENTED_SENTINEL, the same sentinel used while this module
    was a stub. That is a deliberate reuse, not an oversight: both cases mean
    "no real value available for this row." Downstream code must treat the
    sentinel as missing data, not as a genuine bucket 0. train_model.py drops
    these rows before training rather than feeding -999 into the classifier as
    if it were a legitimate feature value.

DO NOT SHIP A TRAINED MODEL BUILT ON THE STUB.
That guard in train_model.py checked IS_IMPLEMENTED, which is now True because
the interface is genuinely implemented. Separately, REVIEWED_BY_EXPERT in
ml/config.py gates whether a model is allowed to save at all — that flag is
now True as of 12 Aug 2026, recording the expert sign-off referenced at the
top of this file. Anything saved before that date predates review and should
not be treated as final for the paper.
"""

from __future__ import annotations

import ast

# Sentinel written when no real value is available — either because the
# estimator was unimplemented (legacy meaning) or because the source code
# could not be parsed (current meaning going forward). Chosen to be obviously
# invalid rather than plausibly real, so it can't be mistaken for a genuine
# measurement in an exported CSV.
NOT_IMPLEMENTED_SENTINEL = -999

# True: estimate_complexity has a real implementation. train_model.py reads
# this to decide whether saving a model is allowed.
IS_IMPLEMENTED = True

# Bucket ordinals, exported so callers/tests can refer to them by name instead
# of magic numbers.
CONSTANT_OR_NO_LOOP = 0
SINGLE_LOOP = 1
NESTED_LOOP = 2
DEEP_OR_RECURSIVE = 3


class _LoopDepthVisitor(ast.NodeVisitor):
    """
    Walks a module's AST once, tracking:
      - the deepest loop-like nesting reached anywhere in the code
      - whether any function calls itself by name (direct recursion), and how
        many distinct self-call sites it has (recursive_call_count)
      - whether a sort-like call (`sorted()` / `.sort()`) appears anywhere, and
        whether it appears inside a loop

    Depth counts `for`, `while`, and each `for` clause inside a comprehension
    or generator expression as one level. Nesting compounds naturally because
    ast.NodeVisitor recurses into children before returning.
    """

    _SORT_NAMES = {"sorted"}   # builtin, called as a bare Name
    _SORT_ATTRS = {"sort"}     # method call, e.g. lst.sort()

    def __init__(self) -> None:
        self.max_depth = 0
        self._current_depth = 0
        self._func_stack: list[str] = []
        self.recursive = False
        self.recursive_call_count = 0
        self.sort_call_found = False
        self.sort_call_in_loop = False

    # ---- loops ----

    def _enter_loop(self) -> None:
        self._current_depth += 1
        self.max_depth = max(self.max_depth, self._current_depth)

    def _exit_loop(self) -> None:
        self._current_depth -= 1

    def visit_For(self, node: ast.AST) -> None:
        self._enter_loop()
        self.generic_visit(node)
        self._exit_loop()

    visit_AsyncFor = visit_For

    def visit_While(self, node: ast.AST) -> None:
        self._enter_loop()
        self.generic_visit(node)
        self._exit_loop()

    def _visit_comprehension(self, node: ast.AST) -> None:
        # Each `for` clause (node.generators) is one level of iteration.
        # `[x for x in a for y in b]` is two levels; a comprehension nested
        # inside another comprehension's element adds further levels when
        # generic_visit reaches it.
        n = len(getattr(node, "generators", []))
        for _ in range(n):
            self._enter_loop()
        self.generic_visit(node)
        for _ in range(n):
            self._exit_loop()

    visit_ListComp = _visit_comprehension
    visit_SetComp = _visit_comprehension
    visit_DictComp = _visit_comprehension
    visit_GeneratorExp = _visit_comprehension

    # ---- recursion ----

    def visit_FunctionDef(self, node: ast.AST) -> None:
        self._func_stack.append(node.name)
        self.generic_visit(node)
        self._func_stack.pop()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Call(self, node: ast.Call) -> None:
        func = node.func
        name = None
        is_attr = False
        if isinstance(func, ast.Name):
            name = func.id
        elif isinstance(func, ast.Attribute):
            # Covers `self.solve(...)` style recursion in class-based
            # solutions: matches on the attribute name only, not the target,
            # so it's slightly permissive but never a false negative for the
            # common case.
            name = func.attr
            is_attr = True

        # Recursion: count every distinct call site that matches an enclosing
        # function's own name, not just whether one exists. One site is
        # treated downstream as linear-shaped recursion; two or more as
        # branching/exponential-shaped. See module docstring.
        if name is not None and name in self._func_stack:
            self.recursive = True
            self.recursive_call_count += 1

        # Sort-like calls are the single most common invisible-cost pattern in
        # interview-style solutions. Only `sorted(...)` and `.sort()` are
        # recognised — see the module docstring for what remains uncovered.
        is_sort_call = (isinstance(func, ast.Name) and func.id in self._SORT_NAMES) or (
            is_attr and func.attr in self._SORT_ATTRS
        )
        if is_sort_call:
            self.sort_call_found = True
            if self._current_depth > 0:
                self.sort_call_in_loop = True

        self.generic_visit(node)


def _bucket_from_source(source_code: str) -> int:
    """Parse source and compute its complexity bucket. Raises on bad input —
    callers are responsible for catching (see estimate_complexity)."""
    tree = ast.parse(source_code)
    visitor = _LoopDepthVisitor()
    visitor.visit(tree)

    # 1. Structural bucket from loop nesting alone.
    if visitor.max_depth >= 3:
        structural = DEEP_OR_RECURSIVE
    elif visitor.max_depth == 2:
        structural = NESTED_LOOP
    elif visitor.max_depth == 1:
        structural = SINGLE_LOOP
    else:
        structural = CONSTANT_OR_NO_LOOP

    # 2. Sort-like calls add cost a bare loop count would miss. A sort with no
    # surrounding loop is at least "linear-ish" work, never free. A sort found
    # inside a loop is worse than the loop alone, so it bumps one further.
    if visitor.sort_call_in_loop:
        structural = min(DEEP_OR_RECURSIVE, structural + 1)
    elif visitor.sort_call_found:
        structural = max(structural, SINGLE_LOOP)

    # 3. Recursion. One self-call site -> treated as linear-shaped recursion
    # (NESTED_LOOP). Two or more distinct self-call sites -> treated as
    # branching/exponential-shaped (DEEP_OR_RECURSIVE). This replaces the
    # previous flat "any recursion = bucket 3" rule with a coarse split that
    # separates the two most common interview-problem recursion shapes.
    if visitor.recursive:
        recursion_bucket = (
            DEEP_OR_RECURSIVE if visitor.recursive_call_count >= 2 else NESTED_LOOP
        )
        return max(structural, recursion_bucket)

    return structural


def estimate_complexity(source_code: str) -> int:
    """
    Estimate the procedural complexity of a student's solution.

    Returns an ordinal bucket 0-3 (higher = more complex), or
    NOT_IMPLEMENTED_SENTINEL when no real value is available (empty/non-string
    input, or code that fails to parse).

    Interface contract:
      - takes raw Python source as a string
      - never raises; unparseable code returns the sentinel
      - returns a small non-negative int on success
    """
    if not isinstance(source_code, str) or not source_code.strip():
        return NOT_IMPLEMENTED_SENTINEL
    try:
        return _bucket_from_source(source_code)
    except SyntaxError:
        return NOT_IMPLEMENTED_SENTINEL
    except Exception:
        # Defensive: any other parse-time oddity is still "no value", never a
        # crash of the whole export.
        return NOT_IMPLEMENTED_SENTINEL


def complexity_column(source_codes) -> list[int]:
    """Vectorised helper for the pipeline. Never raises on bad input."""
    out = []
    for code in source_codes:
        if not isinstance(code, str) or not code.strip():
            out.append(NOT_IMPLEMENTED_SENTINEL)
            continue
        try:
            out.append(estimate_complexity(code))
        except Exception:
            out.append(NOT_IMPLEMENTED_SENTINEL)
    return out