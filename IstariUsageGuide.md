ISTARI PROOF ASSISTANT REFERENCE

SYNTAX: Terms/constructs enclosed in /.../ slashes. Slashes always come in pairs. Ex: intro /x y/. | rewrite /-> h/.

TYPE JUDGMENTS: (a : T) is a very different term from a, where the former is a judgment as a term. It is never the case that (a : T) : T.

MCP: open_document(path)→doc_id. verify_file_up_to_line(doc_id,line) jumps+auto-rewinds. attempt_tactic_and_insert_if_successful(doc_id,tactic) tries+validates+keeps/rollbacks. show_current_goals(doc_id).

IMPORTANT: verify_file_up_to_line verifies the file up to but not including the given line. You cannot skip a partial proof due to the semantics of verify_file_up_to_line. You need to work on proofs sequentially.

WORKFLOW: verify_file_up_to_line→show_current_goals→attempt_tactic_and_insert_if_successful loop until solved.

CRITICAL ADVICE FOR AI AGENTS:
- Verify EVERY tactic: AI agents have ~5% success rate per tactic attempt. Write 1 tactic, check goals, repeat.
- NEVER write 5+ line proofs without verification - almost always wrong. Use attempt_tactic_and_insert_if_successful after each line.
- Cursor must reach ; (end definition) or . (end tactic) for Istari to process. Partial syntax is never validated.
- After EVERY tactic: verify_file_up_to_line to next line, show_current_goals to verify effect. No blind multi-line proofs.
- If stuck: use auto, typecheck, or ask user. Don't guess complex tactics.

== THEOREMS & GOAL MANAGEMENT ==

lemma "name" /statement/;    - Start theorem. Ex: lemma "my_thm" /forall x . P x/;
qed ();                      - Finish proof (no goals at depth 0). Ex: qed ();

GOAL STACK (depth tracking):
{ - Enter first goal (push others to stack, depth+1). REQUIRED when multiple goals. Ex: 2 goals → { → 1 goal (depth 1)
} - Exit current level (pop stack, depth-1). Use when "no goals (depth N>0)". Ex: no goals (depth 1) → } → back to depth 0
n:{ - Enter goal n (0-indexed). Ex: 1:{ enters second goal.

RULES:
- Can only apply tactics when exactly 1 goal active (not 0, not 2+)
- Multiple goals (e.g., after split, destruct): MUST use { to enter one
- "no goals (depth N)" where N>0: MUST use } to exit
- "no goals (depth 0)": proof complete, use qed();

EXAMPLE:
  lemma "ex" /a -> b -> a & b/;
  intro /x y/. split.           → 2 goals (depth 0) [goal 0: a] [goal 1: b]
  { hyp /x/. }                  → enter goal 0, solve, exit → 1 goal (depth 0)
  hyp /y/.                      → solve remaining goal → no goals (depth 0)
  qed ();

== DEFINITIONS ==

define /name {implicit} args/ /body/ /type/;
- Define constant, creates typing proof obligation
- args can include {x} for implicit args (auto-inserted as evars when used)
- Ex: define /double x/ /x + x/ /nat -> nat/;
- Ex: define /double_list {a} l/ /`append a l l/ /intersect i . forall (a:U i) . list a -> list a/;

definerec /name {implicit} args/ /body/ /type/;
- Define recursive function, creates unrolling reduction
- Inside body, implicit args become explicit
- Ex: definerec /length {a} l/ /list_case l 0 (fn h t . succ (length a t))/ /intersect i . forall (a:U i) . list a -> nat/;

definemutrecRaw /pervasive_args/ /fn1 args = body1 and fn2 args = body2 .../;
- Mutually recursive definitions (only Raw version exists, must prove types later)
- Ex: definemutrecRaw /x/ /snork1 y = if Nat.eqb y 0 then x else snork2 y and snork2 y = snork1 (y-1) * 2/;

typedef /datatype invisible_args . visible_args . universe of dt : indices = | C1 : T1 | C2 : T2 and .../;
- Define datatype with constructors, auto-discharges typing obligations
- invisible_args: intersect i . (bound by intersect in types/constructors)
- visible_args: forall (x:A) . (bound by forall in types/constructors)
- Creates: datatypes, constructors, dt_iter (iterator), dt_iter_joint, dt_skel (skeleton), dt_subterm, dt_strip
- Ex: typedef /datatype intersect i . forall (a:U i) . U i of tree : nat -> type = | Empty : tree 0 | Node : forall n . a -> forest n -> tree (succ n) and forest : nat -> type = | Nil : forest 0 | Cons : forall m n . tree m -> forest n -> forest (m+n)/;

defineInd /{pervasive}/ /fn : dtconst [pervasive] indices -> result of | C1 pat1 . body1 | C2 pat2 . body2 and .../  /type1 and type2 .../;
- Define inductive function on datatype using pattern matching (sugar for iterator call)
- pervasive in [...] are visible pervasive args, can use _ for indices
- Must cover all constructors (can use wildcard _), need not cover all datatypes in bundle
- Ex: defineInd /{a}/ /reverse_ntc : list [a] -> list a of | nil . nil | cons x xs . append (reverse_ntc xs) (cons x nil)// intersect i . forall (a:U i) . list a -> list a/;
- Ex: defineInd /{a}/ /treesize : tree [a] _ -> nat of | Empty . 0 | Node _ x f . succ (forestsize f) and forestsize : forest _ -> nat of | Nil . 0 | Cons _ _ t f . treesize t + forestsize f// intersect i . forall (a:U i) n . tree a n -> nat and intersect i . forall (a:U i) n . forest a n -> nat/;

reductions /lhs1 --> rhs1 ; lhs2 --> rhs2 ; unrolling name ; unfolding name/;
- Install custom reduction rules for normalization engine
- LHS syntax: no implicit args inserted, use _ for wildcards
- unrolling: unroll once per path (avoid loops), LHS only
- unfolding: unfold everywhere
- Ex: reductions /length _ nil --> 0 ; length a (cons h t) --> succ (length a t) ; unrolling length/;

NOTE: All definition commands have Raw versions (defineRaw, definerecRaw, typedefRaw) that skip typechecking. AVOID using Raw versions - they require manual type proofs and prohibit evars in body. AI agents should use standard versions that auto-typecheck.

== IMPLICIT & INVISIBLE ARGUMENTS ==

{x} = implicit argument (auto-inserted as evar, resolved by unification)
- Ex: define /double_list {a} l/ /.../ /intersect i . forall (a:U i) . list a -> list a/;
- Usage: double_list mylist (a is auto-inferred)

intersect i . forall (a:U i) . T = invisible argument i (not in term, only for typing)
- Ex: List.map has type: intersect i . forall (a b : U i) . (a -> b) -> list a -> list b
- Usage: List.map F L (i, a, b all auto-inferred)

`f = suppress implicit arguments (use tick)
- Ex: `append a xs ys (explicitly provide implicit a)
- Ex: `List.map ap I A B F L (ap I provides invisible i=I, tick allows explicit A B)

_ = placeholder for unification (single underscore)
- Ex: `List.map _ _ F L (underscores filled by unification)

__ = placeholder in so/apply tactics (creates new subgoals)
- Ex: so /lemma __ x __/ /h/. (double underscores create proof obligations)

== TACTICS ==

INTRODUCTION:
intro /pat.../.         - Introduce forall/arrow/intersect.
  Ex: Goal: forall i a xs ys . P → intro /i a xs ys/. → Context: i:level, a:U i, xs:list a, ys:list a |- P
split.                  - Intro product/unit/future (no choices).
left. | right.          - Intro sum, select disjunct.
exists /term/.          - Intro existential with witness. Ex: Goal: exists x . P x → exists /0/. → Goal: P 0
exact /term/.           - Prove goal with term. Ex: Goal: P, h:P |- P → exact /h/. → no goals

HYPOTHESIS:
assumption.             - Prove goal if any hyp matches. Ex: h:P |- P → assumption. → no goals
clear /h1 h2/.          - Delete hypotheses.
revert /h/.             - Move hyp into conclusion. Ex: x:A |- P → revert /x/. → Goal: forall (x:A) . P

EQUALITY:
reflexivity.            - Prove M=M:A. Ex: Goal: x+0 = x+0 : nat → reflexivity. → no goals
symmetry.               - M=N:A → N=M:A. Ex: Goal: y=x:nat → symmetry. → Goal: x=y:nat
compat.                 - Prove h M1..Mn = h N1..Nn : A by proving Mi=Ni:Bi.

SUBSTITUTION:
subst /h/.              - Find x=M in context, replace x→M.
  Ex: heq:x=0:nat |- P x → subst /heq/. → heq:x=0:nat |- P 0

DESTRUCTION (patterns: _ discard, ? auto-name, x name, [p1 p2] product, {p1|p2} sum, 0 void):
destruct /h/ /pat/.     - Destruct h matching pattern.
  Ex: h:A%B |- P → destruct /h/ /x | y/. → [goal1: x:A |- P] [goal2: y:B |- P]
  Ex: h:list a |- P → destruct /h/ /| x xs/. → [goal1: |- P{nil/h}] [goal2: x:a, xs:list a |- P{cons x xs/h}]
assert /A/ /pat/.       - Create subgoal for A, match pattern.
  Ex: assert /x = 0 : nat/ /heq/. → [goal1: prove x=0:nat] [goal2: heq:x=0:nat |- original goal]
inversion /h/.          - Copy h, destruct copy, discharge impossible cases.

CHAINING (__ creates subgoals, _ for unification):
so /term/ /pat/.        - Apply term (use __ for holes), match result.
  Ex: so /lemma x __/ /h/. → [goal: prove arg2] [continues with: h:result |- original goal]
apply /term/.           - Backchain through term.
  Ex: Goal: P x, lemma:forall y . P y → apply /lemma/. → no goals

INDUCTION:
induction /h/.          - Induct using iterator (requires well-formed conclusion).
  Ex: xs:list a |- P xs → induction /xs/. → [base: |- P nil] [step: x:a, xs:list a, IH:P xs |- P (cons x xs)]

TYPECHECKING:
typecheck.              - Prove typechecking goal.
inference.              - Run typechecker for side-effects (instantiate evars).

AUTO:
auto.                   - Automated proving, depth 5.
autoWith /lem1 lem2/.   - Auto + backchain with lemmas.

REWRITING (see REWRITING section for details):
rewrite /-> eq/.        - Rewrite left-to-right.
  Ex: Goal: y::append xs' (x::ys) = RHS, IH:append xs' (x::ys) = append (append xs' (x::nil)) ys
      → rewrite /<- IH/. → Goal: y::append xs' (x::ys) = y::append xs' (x::ys) (then reflexivity)
rewrite /<- eq/.        - Rewrite right-to-left.
unfold /const/.         - Unfold definition.
reduce.                 - Normalize to normal form.

MISC:
exfalso.                - Replace goal with void (use when you have contradiction).

NOTE: Most tactics have Raw versions (introRaw, destructRaw, etc.) that skip typechecking. Avoid Raw - use standard versions that auto-typecheck.

== REWRITING ==

TARGETS: [in hyp] [at occurrences] | at occurrences (for concl) | (empty = "in concl at 0")
- occurrences: 0 1 2 (hit numbers, pre-order left-to-right) | pos 0 1 2 (positions) | all
- Ex: rewrite /-> h/. = rewrite in concl at first occurrence
- Ex: rewrite /-> h in concl at all/. = rewrite all occurrences in conclusion
- Ex: rewrite /-> h in eq at 0 1/. = rewrite hits 0,1 in hypothesis eq

BASIC REWRITING:
rewrite /-> eq/. - Replace M with N (if eq : M=N:A), searches conclusion at hit 0
rewrite /<- eq/. - Replace N with M (reverse direction)
rewrite /-> eq in h/. - Rewrite in hypothesis h
rewrite /-> eq in h at all/. - Rewrite all occurrences in h

EXAMPLE (from list_reverse.ist):
Goal: y :: append xs' (x :: ys) = y :: append (append xs' (x :: nil)) ys : list a
IH : append xs' (x :: ys) = append (append xs' (x :: nil)) ys : list a
Tactic: rewrite /<- IH/.
Result: y :: append xs' (x :: ys) = y :: append xs' (x :: ys) : list a (now trivial by reflexivity)

EXAMPLE 2 (from list_reverse.ist):
Goal: reverse_ntc xs = reverse_tc xs nil : list a
H : append (reverse_ntc xs) nil = reverse_tc xs nil : list a
Tactic: rewrite /-> append_id_r in H/.
Result: H becomes: reverse_ntc xs = reverse_tc xs nil : list a (then exact /H/.)

STRICT vs INTERMEDIATE:
- Intermediate (->, <-): Allows beta-equivalence, same head required (FAST, use by default)
- Strict (-->, <--): Exact syntactic match, no beta (use when intermediate fails or is ambiguous)
- When to use strict: Goal is "P (0 + 1 + x)", rewriting with "plus_assoc" on "E1+E2+E3" fails in intermediate mode because "0+1" beta-reduces to "1", use "--> plus_assoc" instead

OTHER REWRITES:
rewrite /M = N : A/. - Replace M with N, creates new subgoal to prove M=N:A
unfold /const/. - Unfold definition + weak-head-normalize
fold /term/. - Reverse of unfold
unroll /const/. - Unroll recursive function (for definerec)
reduce. - Normalize to normal form
whreduce. - Weak-head-normalize only

Supported relations: eq (=), eqtp (type eq), iff (<->), subtype (<:), implies.

== LIBS ==

Preloaded: Nat, Bool, Integer, List, Logic, Function, Partial, Eventually, Quotient, Irrelevance.
Load: File.load "filename";
Query: list_constants(doc_id,"List"), get_type(doc_id,"append"), get_definition(doc_id,"append").

List: append, append_id_r (append xs nil = xs), append_assoc.
Nat: plus_comm, plus_assoc, mult_comm, eqb.

== MODULES ==

openModule /Name/;           - Make module contents available without prefix. Ex: openModule /List/; (then use append instead of List.append)
beginModule "Name";          - Start defining module. Ex: beginModule "MyModule";
endModule ();                - Close current module. Ex: endModule ();
alias /new/ /Mod.const/;     - Create alias to constant. Ex: alias /plus/ /Nat.plus/;

Access: Use compound names Mod.const. Ex: Nat.plus, List.append, Bool.and.

== COMMON PATTERNS ==

Tail-call equivalence:
1. defineInd ntc (non-tail-call) and tc (tail-call with accumulator)
2. Prove helper (e.g., append reassociation: append xs (cons x ys) = append (append xs (cons x nil)) ys)
3. Prove STRONG: append (ntc xs) ys = tc xs ys (induction xs, use helper in cons case)
4. Main: instantiate strong with nil, rewrite append_id_r

List induction template:
  intro /i a xs/. induction /xs/. {reflexivity.} {intro /x xs' IH/. ...use IH... } qed();

== AI AGENT BEST PRACTICES ==

INCREMENTAL VERIFICATION (CRITICAL):
1. Write ONE tactic (ending with .)
2. Use verify_file_up_to_line to move to next line (triggers Istari processing)
3. Use show_current_goals to verify the tactic worked
4. Check goal count, context, conclusion match expectations
5. If wrong: rewind, fix, repeat. If right: continue to next tactic.

NEVER:
- Write multiple tactics without verification (>5% chance each fails = compounding failure)
- Assume partial definitions/tactics are valid (Istari only validates at ; or .)
- Write entire proofs blindly (use attempt_tactic_and_insert_if_successful line-by-line or user will waste time debugging)

WHEN STUCK:
- Try auto. or typecheck. first (they often work)
- Use simpler tactics: reflexivity, assumption before complex rewrites
- If still stuck after 2-3 attempts: STOP. Write summary of what you tried and ASK USER for help.
- DO NOT keep attempting fixes - you'll waste time and create broken proofs. User intervention is faster.

PROOF COMPLETION DETECTION:
- Error "No proof underway. Current Line: <lineno>" indicates the proof has completed
- This happens when attempting tactics after the proof is finished
- When you see this error, the proof state is clean and no tactics are needed
- At this time, it is best to reread document content to see the completed proof

SUCCESS PATTERN: verify_file_up_to_line(N) → show_current_goals → attempt_tactic_and_insert_if_successful("tactic.") → verify → verify_file_up_to_line(N+1) → repeat

== CRITICAL: ATTEMPT_TACTIC_AND_INSERT_IF_SUCCESSFUL BEHAVIOR ==

IMPORTANT: The attempt_tactic_and_insert_if_successful MCP call will INSERT the attempted tactic into the document ONLY if the tactic is successful. If the tactic fails, it will roll back the insertion, leaving the document unchanged.

DOUBLE VISION WARNING: AI agents (especially GPT-5) may make mistakes by "double visioning" - seeing both the original document state and the modified state after attempt_tactic_and_insert_if_successful.

Remember: attempt_tactic_and_insert_if_successful = edit document + verify_file_up_to_line + validation + keep if successful / rollback if failed