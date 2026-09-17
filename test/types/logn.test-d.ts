/**
 * @zakkster/lite-logn -- ambient type tests (tsc -p test/types/tsconfig.json).
 *
 * v0.1.0 is the SCAFFOLD release: the only export is `VERSION`. Each member
 * session appends a type-level assertion block for its class here. ASCII-only.
 */

import { VERSION, BinaryHeap } from '../../LogN.js';

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
