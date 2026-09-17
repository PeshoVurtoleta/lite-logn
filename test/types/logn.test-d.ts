/**
 * @zakkster/lite-logn -- ambient type tests (tsc -p test/types/tsconfig.json).
 *
 * v0.1.0 is the SCAFFOLD release: the only export is `VERSION`. Each member
 * session appends a type-level assertion block for its class here. ASCII-only.
 */

import { VERSION, BinaryHeap, Fenwick } from '../../LogN.js';

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
