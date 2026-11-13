// Min-cost flow by successive shortest paths with Johnson potentials and a binary heap. Integer capacities and costs only, so every engine computes
// the same flow. Ties break on node and edge order, which the caller fixes, so results are deterministic. Sized for a student's fortnight: a few
// hundred nodes and a few thousand edges solve in a few milliseconds.

export class MinCostFlow {
  private readonly n: number;
  private head: Int32Array;
  private to: number[] = [];
  private cap: number[] = [];
  private cost: number[] = [];
  private next: number[] = [];

  constructor(nodes: number) {
    this.n = nodes;
    this.head = new Int32Array(nodes).fill(-1);
  }

  /** Adds an edge and its residual twin. Returns the forward edge's index. Costs must be non-negative. */
  addEdge(from: number, to: number, capacity: number, cost: number): number {
    if (capacity <= 0) return -1;
    if (cost < 0 || !Number.isInteger(cost) || !Number.isInteger(capacity)) throw new Error("MinCostFlow needs non-negative integer costs and integer capacities");
    const index = this.to.length;
    this.to.push(to); this.cap.push(capacity); this.cost.push(cost); this.next.push(this.head[from]);
    this.head[from] = index;
    this.to.push(from); this.cap.push(0); this.cost.push(-cost); this.next.push(this.head[to]);
    this.head[to] = index + 1;
    return index;
  }

  /** Units pushed through a forward edge. */
  flowOn(edge: number): number {
    return edge < 0 ? 0 : this.cap[edge + 1];
  }

  run(source: number, sink: number, limit = Number.MAX_SAFE_INTEGER): { flow: number; cost: number } {
    const n = this.n;
    const potential = new Float64Array(n);
    const dist = new Float64Array(n);
    const prevEdge = new Int32Array(n);
    let flow = 0;
    let total = 0;
    // Heap of [distance, node] pairs kept in parallel arrays.
    const heapD: number[] = [];
    const heapN: number[] = [];
    const push = (d: number, v: number) => {
      let i = heapD.length;
      heapD.push(d); heapN.push(v);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heapD[p] < d || (heapD[p] === d && heapN[p] <= v)) break;
        heapD[i] = heapD[p]; heapN[i] = heapN[p];
        i = p;
      }
      heapD[i] = d; heapN[i] = v;
    };
    const pop = (): [number, number] => {
      const topD = heapD[0]; const topN = heapN[0];
      const lastD = heapD.pop()!; const lastN = heapN.pop()!;
      if (heapD.length) {
        let i = 0;
        const size = heapD.length;
        for (;;) {
          const l = 2 * i + 1; const r = l + 1;
          let m = i; let md = lastD; let mn = lastN;
          if (l < size && (heapD[l] < md || (heapD[l] === md && heapN[l] < mn))) { m = l; md = heapD[l]; mn = heapN[l]; }
          if (r < size && (heapD[r] < md || (heapD[r] === md && heapN[r] < mn))) { m = r; md = heapD[r]; mn = heapN[r]; }
          if (m === i) break;
          heapD[i] = heapD[m]; heapN[i] = heapN[m];
          i = m;
        }
        heapD[i] = lastD; heapN[i] = lastN;
      }
      return [topD, topN];
    };

    while (flow < limit) {
      dist.fill(Infinity);
      prevEdge.fill(-1);
      dist[source] = 0;
      push(0, source);
      while (heapD.length) {
        const [d, u] = pop();
        if (d > dist[u]) continue;
        for (let e = this.head[u]; e !== -1; e = this.next[e]) {
          if (this.cap[e] <= 0) continue;
          const v = this.to[e];
          const nd = d + this.cost[e] + potential[u] - potential[v];
          if (nd < dist[v] - 1e-9) {
            dist[v] = nd;
            prevEdge[v] = e;
            push(nd, v);
          }
        }
      }
      if (dist[sink] === Infinity) break;
      for (let v = 0; v < n; v++) if (dist[v] !== Infinity) potential[v] += dist[v];
      let push_ = limit - flow;
      for (let v = sink; v !== source; v = this.to[prevEdge[v] ^ 1]) push_ = Math.min(push_, this.cap[prevEdge[v]]);
      for (let v = sink; v !== source; v = this.to[prevEdge[v] ^ 1]) {
        const e = prevEdge[v];
        this.cap[e] -= push_;
        this.cap[e ^ 1] += push_;
        total += push_ * this.cost[e];
      }
      flow += push_;
    }
    return { flow, cost: total };
  }
}
