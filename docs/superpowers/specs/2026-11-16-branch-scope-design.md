# Phase 10 — Per-branch figures, and who may see them

**Why.** Branches exist, each with its own hours, prices and page on the site —
but every figure in the program was still one pile. An owner with three branches
could not tell which one was losing money, and a branch manager could see the
whole network's takings. Both are wrong.

## The model

One installation runs one **terminal**, and a terminal belongs to one branch
(`settings.currentBranchId`). Every order it opens is tagged with that branch;
an order taken from the website is tagged with the branch the customer chose.
That single tag is what makes the figures separable afterwards.

People are either **head office** or **a branch**:

| | `users.branchId` | Sees |
|---|---|---|
| Head office | `NULL` | every branch, and may compare them |
| Branch | the branch | only its own orders, tables and figures |

The rule is applied in the services, never in the screens: a branch manager who
reaches a channel directly still gets their own branch only. Head office keeps
the choice — all branches, or one of them.

## What changes

- `orders.branchId` and `users.branchId` (V8).
- Every report takes an optional branch. A branch user's choice is **overridden**
  with their own branch rather than refused, so nothing in the UI can leak.
- A new report, **by branch**: takings, orders, average basket and net per
  branch, side by side. Head office only.
- The dashboard and the orders list follow the same scope.
- The employee form gains the branch; leaving it empty means head office.
- Settings gains "this terminal's branch".

## Tests

An order carries the terminal's branch; a branch user's report is their own
whatever they ask for; head office sees the comparison and a branch user cannot;
the comparison's totals equal the sum of its rows.
