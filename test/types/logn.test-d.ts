/**
 * @zakkster/lite-logn -- ambient type tests (tsc -p test/types/tsconfig.json).
 *
 * v0.1.0 is the SCAFFOLD release: the only export is `VERSION`. Each member
 * session appends a type-level assertion block for its class here. ASCII-only.
 */

import { VERSION, BinaryHeap, Fenwick, SegmentTree, Treap, Scapegoat } from '../../LogN.js';

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
