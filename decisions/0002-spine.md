# 0002 -- Ordered-collection spine reach (D-03)

- Status: ACCEPTED
- Severity: S2 (shapes every member's public surface)
- Date: 2026-09-17
- Session: S0 (scaffold)

## Context

The family spans structures with very different capabilities: a heap has a min
but no `successor`; a Fenwick has a `prefix` sum but no `get` in the
key-to-value map sense; a SkipList has the full ordered-map surface. If we
declare a broad shared interface (`get` / `has` / `delete` / `min` /
`successor` / `rank`) and force every member to implement all of it, members
will either throw on ops they cannot honor or -- worse -- fake them. A heap that
grows a fake `successor` lies about its shape.

The question: how much is a SHARED interface before it starts lying about
members that do not fit?

## Decision

**Offer the shared surface where honest, force it nowhere.**

Minimal shared surface, implemented by every member:

- `size` -- live element count.
- `clear()` -- reset to empty (fail-closed capacity preserved).
- iteration -- an alloc-free traversal (`forEach` and / or `[Symbol.iterator]`),
  where the member has a meaningful order to iterate.

Structure-specific ops EXTEND the spine per member; they are NOT part of the
shared contract and no member is required to implement one it cannot honor:

- BinaryHeap: `push` / `pop` / `peek`.
- Fenwick: `update` / `prefix` / `rangeSum`.
- SegmentTree: `pointUpdate` / `rangeQuery`.
- SkipList: `get` / `set` / `delete` / `successor` / `rangeIter`.

A heap never fakes `successor`; a Fenwick never fakes `get`. A member that does
not have an honest implementation of an op simply does not expose it -- absence,
not a throwing stub.

## Consequences

- Every future member knows, before code, exactly what it MUST implement
  (`size` / `clear` / iterate where ordered) and what it MUST NOT fake.
- The README / GUIDE picker routes by capability, so a user never reaches for a
  member expecting an op it does not have.
- Cross-member tests assert the shared surface exists on every member and do NOT
  assert structure-specific ops exist on members that opt out.

## Alternatives rejected

- **One broad interface every member implements.** Rejected: forces fake or
  throwing stubs (a heap's `successor`), which is exactly the lie this decision
  removes.
- **No shared surface at all.** Rejected: `size` / `clear` / iterate are
  genuinely universal and honest on every member; dropping them would cost real
  ergonomics for no honesty gain.
