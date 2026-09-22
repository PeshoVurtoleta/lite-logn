/**
 * @zakkster/lite-logn -- ambient type tests (tsc -p test/types/tsconfig.json).
 *
 * v0.1.0 is the SCAFFOLD release: the only export is `VERSION`. Each member
 * session appends a type-level assertion block for its class here. ASCII-only.
 */

import { VERSION, BinaryHeap, Fenwick, SegmentTree, Treap, Scapegoat, MinMaxHeap, SplayTree, BinomialHeap, PairingHeap, FibonacciHeap, SortedArray } from '../../LogN.js';

// VERSION is a string.
const v: string = VERSION;
void v;

// @ts-expect-error -- VERSION is not a number.
const n: number = VERSION;
void n;

// --- BinaryHeap ------------------------------------------------------------
const heap = new BinaryHeap(1024, 'min');
const heapDefault = new BinaryHeap(1024); // kind defaults to 'min'
void heapDefault;

heap.push(3, 2.5);
const popped: number | undefined = heap.pop();
const top: number | undefined = heap.peek();
const tk: number | undefined = heap.topKey();
const ko: number | undefined = heap.keyOf(3);
const present: boolean = heap.has(3);
heap.changeKey(3, 1.0);
const removed: boolean = heap.remove(3);
heap.clear();
const sz: number = heap.size;
const cap: number = heap.capacity;
const kind: 'min' | 'max' = heap.kind;
heap.forEach((id, key) => { void id; void key; });
for (const id of heap) { void id; }
const built: BinaryHeap = BinaryHeap.build('max', [0, 1], [4.0, 1.0], 16);
void popped; void top; void tk; void ko; void present; void removed;
void sz; void cap; void kind; void built;

// @ts-expect-error -- kind must be 'min' | 'max'.
new BinaryHeap(8, 'biggest');

// @ts-expect-error -- push key must be a number.
heap.push(1, 'x');

// --- Fenwick ---------------------------------------------------------------
const fen = new Fenwick(1024);
const fenU: Fenwick = fen.update(0, 2.5);   // fluent -> this
const fenS: Fenwick = fen.set(1, -3);       // fluent -> this
const fenC: Fenwick = fen.clear();          // fluent -> this
const p: number = fen.prefix(10);
const pBase: number = fen.prefix(-1);       // the empty-prefix base case
const rs: number = fen.rangeSum(2, 8);
const el: number = fen.at(5);
const flen: number = fen.length;
fen.forEach((value, index, self) => { void value; void index; void self; });
const fbuilt: Fenwick = Fenwick.build([1, 2, 3, 4]);
void fenU; void fenS; void fenC; void p; void pBase; void rs; void el; void flen; void fbuilt;

// @ts-expect-error -- update delta must be a number.
fen.update(0, 'x');

// @ts-expect-error -- Fenwick constructor takes a single length argument.
new Fenwick(8, 'min');

// --- SegmentTree -----------------------------------------------------------
const seg = new SegmentTree(1024, 'sum');
const segU: SegmentTree = seg.update(0, 2.5);   // fluent -> this
const segC: SegmentTree = seg.clear();          // fluent -> this
const q: number = seg.query(2, 8);
const sat: number = seg.at(5);
const slen: number = seg.length;
const sk: 'min' | 'max' | 'sum' | 'gcd' = seg.kind;
seg.forEach((value, index, self) => { void value; void index; void self; });
const sbuilt: SegmentTree = SegmentTree.build([1, 2, 3, 4], 'min');
void segU; void segC; void q; void sat; void slen; void sk; void sbuilt;

// @ts-expect-error -- kind must be 'min' | 'max' | 'sum' | 'gcd'.
new SegmentTree(8, 'product');

// @ts-expect-error -- update value must be a number.
seg.update(0, 'x');

// --- Treap -----------------------------------------------------------------
const tr = new Treap(1024, 7);
const trDefault = new Treap(1024); // seed defaults
void trDefault;
const trSet: Treap = tr.set(3, 2.5);          // fluent -> this
const trClear: Treap = tr.clear();            // fluent -> this
const tg: number | undefined = tr.get(3);
const thas: boolean = tr.has(3);
const tdel: boolean = tr.delete(3);
const trank: number = tr.rank(3);
const tsel: number | undefined = tr.select(0);
const tsucc: number | undefined = tr.successor(3);
const tpred: number | undefined = tr.predecessor(3);
const tsize: number = tr.size;
const tcap: number = tr.capacity;
tr.forEach((key, value, self) => { void key; void value; void self; });
for (const k of tr.rangeIter(-Infinity, Infinity)) { void k; }
const [tLeft, tRight]: [Treap, Treap] = tr.split(5);
const tMerged: Treap = Treap.merge(tLeft, tRight);
void trSet; void trClear; void tg; void thas; void tdel; void trank; void tsel;
void tsucc; void tpred; void tsize; void tcap; void tMerged;

// @ts-expect-error -- set value must be a number.
tr.set(0, 'x');

// @ts-expect-error -- Treap key must be a number.
tr.get('x');

// --- Scapegoat -------------------------------------------------------------
const sg = new Scapegoat(1024, 2 / 3);
const sgDefault = new Scapegoat(1024); // alpha defaults to 2/3
void sgDefault;
const sgSet: Scapegoat = sg.set(3, 2.5);          // fluent -> this
const sgClear: Scapegoat = sg.clear();            // fluent -> this
const sgg: number | undefined = sg.get(3);
const sghas: boolean = sg.has(3);
const sgdel: boolean = sg.delete(3);
const sgrank: number = sg.rank(3);
const sgsel: number | undefined = sg.select(0);
const sgsucc: number | undefined = sg.successor(3);
const sgpred: number | undefined = sg.predecessor(3);
const sgsize: number = sg.size;
const sgcap: number = sg.capacity;
const sgalpha: number = sg.alpha;
sg.forEach((key, value, self) => { void key; void value; void self; });
for (const k of sg.rangeIter(-Infinity, Infinity)) { void k; }
void sgSet; void sgClear; void sgg; void sghas; void sgdel; void sgrank; void sgsel;
void sgsucc; void sgpred; void sgsize; void sgcap; void sgalpha;

// @ts-expect-error -- set value must be a number.
sg.set(0, 'x');

// @ts-expect-error -- Scapegoat key must be a number.
sg.get('x');

// @ts-expect-error -- Scapegoat has no split (the documented asymmetry vs Treap).
sg.split(5);

// --- MinMaxHeap ------------------------------------------------------------
const mmh = new MinMaxHeap(1024);
mmh.push(3, 2.5);
const mmhMin: number | undefined = mmh.popMin();
const mmhMax: number | undefined = mmh.popMax();
const mmhPeekMin: number | undefined = mmh.peekMin();
const mmhPeekMax: number | undefined = mmh.peekMax();
const mmhMinKey: number | undefined = mmh.peekMinKey();
const mmhMaxKey: number | undefined = mmh.peekMaxKey();
const mmhSize: number = mmh.size;
const mmhCap: number = mmh.capacity;
mmh.clear();
mmh.forEach((id, key) => { void id; void key; });
for (const id of mmh) { void id; }
const mmhBuilt: MinMaxHeap = MinMaxHeap.build([0, 1], [4.0, 1.0], 16);
void mmhMin; void mmhMax; void mmhPeekMin; void mmhPeekMax; void mmhMinKey; void mmhMaxKey;
void mmhSize; void mmhCap; void mmhBuilt;

// @ts-expect-error -- push key must be a number.
mmh.push(1, 'x');

// @ts-expect-error -- MinMaxHeap takes a single capacity argument (no kind).
new MinMaxHeap(8, 'min');

// @ts-expect-error -- MinMaxHeap has no changeKey (the asymmetry vs BinaryHeap).
mmh.changeKey(3, 1.0);
// @ts-expect-error -- MinMaxHeap has no remove (the asymmetry vs BinaryHeap).
mmh.remove(3);
// @ts-expect-error -- MinMaxHeap has no keyOf (the asymmetry vs BinaryHeap).
mmh.keyOf(3);
// @ts-expect-error -- MinMaxHeap has no has (the asymmetry vs BinaryHeap).
mmh.has(3);

// --- SplayTree -------------------------------------------------------------
const sp = new SplayTree(1024);
const spSet: SplayTree = sp.set(3, 2.5);          // fluent -> this
const spClear: SplayTree = sp.clear();            // fluent -> this
const spg: number | undefined = sp.get(3);
const sphas: boolean = sp.has(3);
const spdel: boolean = sp.delete(3);
const spsucc: number | undefined = sp.successor(3);
const sppred: number | undefined = sp.predecessor(3);
const spsize: number = sp.size;
const spcap: number = sp.capacity;
sp.forEach((key, value, self) => { void key; void value; void self; });
for (const k of sp.rangeIter(-Infinity, Infinity)) { void k; }
for (const k of sp) { void k; }
void spSet; void spClear; void spg; void sphas; void spdel; void spsucc; void sppred;
void spsize; void spcap;

// @ts-expect-error -- set value must be a number.
sp.set(0, 'x');

// @ts-expect-error -- SplayTree key must be a number.
sp.get('x');

// @ts-expect-error -- SplayTree is the LEAN member: no rank (the asymmetry vs Treap/Scapegoat).
sp.rank(3);

// @ts-expect-error -- SplayTree has no select (the LEAN asymmetry vs Treap/Scapegoat).
sp.select(0);

// @ts-expect-error -- SplayTree has no split (the LEAN asymmetry vs Treap; reviewer nit 2).
sp.split(3);

// @ts-expect-error -- SplayTree has no static merge (the LEAN asymmetry vs Treap; reviewer nit 2).
SplayTree.merge(sp, sp);

// @ts-expect-error -- SplayTree takes a single capacity argument (no seed).
new SplayTree(8, 7);

// --- BinomialHeap ----------------------------------------------------------
const bh = new BinomialHeap(1024, 'min');
const bhDefault = new BinomialHeap(1024); // kind defaults to 'min'
void bhDefault;
bh.push(3, 2.5);
const bhMin: number | undefined = bh.popMin();
const bhPeek: number | undefined = bh.peekMin();
const bhPeekKey: number | undefined = bh.peekMinKey();
const bhSize: number = bh.size;
const bhCap: number = bh.capacity;
const bhKind: 'min' | 'max' = bh.kind;
const bhClear: BinomialHeap = bh.clear(); // fluent -> this
bh.forEach((id, key) => { void id; void key; });
for (const id of bh) { void id; }
const bhArena: BinomialHeap[] = BinomialHeap.arena(1024, 'min', 3);
const bhMelded: BinomialHeap = bhArena[0].meld(bhArena[1]); // meld -> this, consumes the arg
void bhMin; void bhPeek; void bhPeekKey; void bhSize; void bhCap; void bhKind; void bhClear; void bhMelded;

// @ts-expect-error -- push key must be a number.
bh.push(1, 'x');

// @ts-expect-error -- kind must be 'min' | 'max'.
new BinomialHeap(8, 'biggest');

// @ts-expect-error -- BinomialHeap is LEAN + NON-ADDRESSABLE: no decreaseKey.
bh.decreaseKey(3, 1.0);

// @ts-expect-error -- BinomialHeap has no remove (non-addressable).
bh.remove(3);

// @ts-expect-error -- BinomialHeap has no rank (non-addressable, no order stats).
bh.rank(3);

// @ts-expect-error -- BinomialHeap has no select (non-addressable, no order stats).
bh.select(0);

// --- PairingHeap -----------------------------------------------------------
const ph = new PairingHeap(1024, 'min');
const phDefault = new PairingHeap(1024); // kind defaults to 'min'
void phDefault;
ph.push(3, 2.5);
const phMin: number | undefined = ph.popMin();
const phPeek: number | undefined = ph.peekMin();
const phPeekKey: number | undefined = ph.peekMinKey();
ph.decreaseKey(3, 1.0);
const phRemoved: boolean = ph.remove(3);
const phHas: boolean = ph.has(3);
const phKeyOf: number | undefined = ph.keyOf(3);
const phSize: number = ph.size;
const phCap: number = ph.capacity;
const phKind: 'min' | 'max' = ph.kind;
const phClear: PairingHeap = ph.clear(); // fluent -> this
ph.forEach((id, key) => { void id; void key; });
for (const id of ph) { void id; }
const phArena: PairingHeap[] = PairingHeap.arena(1024, 'min', 3);
const phMelded: PairingHeap = phArena[0].meld(phArena[1]); // meld -> this, consumes the arg
void phMin; void phPeek; void phPeekKey; void phRemoved; void phHas; void phKeyOf;
void phSize; void phCap; void phKind; void phClear; void phMelded;

// @ts-expect-error -- push key must be a number.
ph.push(1, 'x');

// @ts-expect-error -- decreaseKey newKey must be a number.
ph.decreaseKey(1, 'x');

// @ts-expect-error -- kind must be 'min' | 'max'.
new PairingHeap(8, 'biggest');

// @ts-expect-error -- PairingHeap has no changeKey (use decreaseKey).
ph.changeKey(3, 1.0);

// @ts-expect-error -- PairingHeap is not an ordered map: no rank.
ph.rank(3);

// @ts-expect-error -- PairingHeap is not an ordered map: no select.
ph.select(0);

// @ts-expect-error -- PairingHeap is not an ordered map: no successor.
ph.successor(3);

// --- FibonacciHeap ---------------------------------------------------------
const fh = new FibonacciHeap(1024, 'min');
const fhDefault = new FibonacciHeap(1024); // kind defaults to 'min'
void fhDefault;
fh.push(3, 2.5);
const fhMin: number | undefined = fh.popMin();
const fhPeek: number | undefined = fh.peekMin();
const fhPeekKey: number | undefined = fh.peekMinKey();
fh.decreaseKey(3, 1.0);
const fhRemoved: boolean = fh.remove(3);
const fhHas: boolean = fh.has(3);
const fhKeyOf: number | undefined = fh.keyOf(3);
const fhSize: number = fh.size;
const fhCap: number = fh.capacity;
const fhKind: 'min' | 'max' = fh.kind;
const fhClear: FibonacciHeap = fh.clear(); // fluent -> this
fh.forEach((id, key) => { void id; void key; });
for (const id of fh) { void id; }
const fhArena: FibonacciHeap[] = FibonacciHeap.arena(1024, 'min', 3);
const fhMelded: FibonacciHeap = fhArena[0].meld(fhArena[1]); // meld -> this, consumes the arg
void fhMin; void fhPeek; void fhPeekKey; void fhRemoved; void fhHas; void fhKeyOf;
void fhSize; void fhCap; void fhKind; void fhClear; void fhMelded;

// @ts-expect-error -- push key must be a number.
fh.push(1, 'x');

// @ts-expect-error -- decreaseKey newKey must be a number.
fh.decreaseKey(1, 'x');

// @ts-expect-error -- kind must be 'min' | 'max'.
new FibonacciHeap(8, 'biggest');

// @ts-expect-error -- FibonacciHeap has no changeKey (use decreaseKey).
fh.changeKey(3, 1.0);

// @ts-expect-error -- FibonacciHeap is not an ordered map: no rank.
fh.rank(3);

// @ts-expect-error -- FibonacciHeap is not an ordered map: no select.
fh.select(0);

// @ts-expect-error -- FibonacciHeap is not an ordered map: no successor.
fh.successor(3);

// --- SortedArray -----------------------------------------------------------
const sa = new SortedArray(1024);
const saSet: SortedArray = sa.set(3, 2.5);          // fluent -> this
const saGet: number | undefined = sa.get(3);
const saHas: boolean = sa.has(3);
const saDel: boolean = sa.delete(3);
const saRank: number = sa.rank(3);
const saSel: number | undefined = sa.select(0);
const saKeyAt: number | undefined = sa.keyAt(0);
const saValAt: number | undefined = sa.valueAt(0);
const saSucc: number | undefined = sa.successor(3);
const saPred: number | undefined = sa.predecessor(3);
const saMin: number | undefined = sa.min();
const saMax: number | undefined = sa.max();
const saSize: number = sa.size;
const saCap: number = sa.capacity;
const saClear: SortedArray = sa.clear();            // fluent -> this
sa.forEach((key, value, self) => { void key; void value; void self; });
for (const key of sa.rangeIter(0, 10)) { void key; }
const saBuilt: SortedArray = SortedArray.build([3, 1, 2], [30, 10, 20]);
void saSet; void saGet; void saHas; void saDel; void saRank; void saSel; void saKeyAt;
void saValAt; void saSucc; void saPred; void saMin; void saMax; void saSize; void saCap;
void saClear; void saBuilt;

// @ts-expect-error -- set value must be a number.
sa.set(1, 'x');

// @ts-expect-error -- SortedArray constructor takes a single capacity argument.
new SortedArray(8, 'min');
