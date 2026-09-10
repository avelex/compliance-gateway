const TTL_SECONDS = 90;

export type QueueItem = {
  kind: string;
  gate: string;
  wallet: string;
  level: number;
  enqueuedAt: number;
};

const queue = new Map<string, QueueItem>();

function keyOf(gate: string, wallet: string): string {
  return `${gate.toLowerCase()}:${wallet.toLowerCase()}`;
}

export function enqueue(item: Omit<QueueItem, "enqueuedAt">): void {
  const gate = item.gate.toLowerCase();
  const wallet = item.wallet.toLowerCase();
  queue.set(keyOf(gate, wallet), { ...item, gate, wallet, enqueuedAt: Math.floor(Date.now() / 1000) });
}

export function snapshot(minute: number): QueueItem[] {
  const cutoff = minute * 60;
  const now = Math.floor(Date.now() / 1000);
  const items: QueueItem[] = [];
  for (const [key, item] of queue) {
    if (now - item.enqueuedAt > TTL_SECONDS) {
      queue.delete(key);
      continue;
    }
    if (item.enqueuedAt < cutoff) items.push(item);
  }
  items.sort((a, b) => (a.gate === b.gate ? a.wallet.localeCompare(b.wallet) : a.gate.localeCompare(b.gate)));
  return items;
}
