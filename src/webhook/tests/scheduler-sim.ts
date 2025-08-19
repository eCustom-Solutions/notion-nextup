// Initialize structured logging & env first
import '../../utils/logger';
import * as dotenv from 'dotenv';
dotenv.config();

import { startScheduler } from '../scheduler';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('🧪 Scheduler simulation start');

  const processed: string[] = [];
  const processUser = async (userId: string, userName: string) => {
    console.log(`▶️ processUser start ${userName} (${userId})`);
    processed.push(userName);
    await sleep(100); // simulate some work
    console.log(`⏹️ processUser done  ${userName} (${userId})`);
  };

  const scheduler = startScheduler({ debounceMs: 300, enableLogging: true, processUser });

  // Simulate A, B, A, C, A, C, B all within debounce window
  const A = { id: 'A', name: 'Alice' };
  const B = { id: 'B', name: 'Bob' };
  const C = { id: 'C', name: 'Carol' };

  scheduler.routeEvent(A.id, A.name);
  await sleep(50);
  scheduler.routeEvent(B.id, B.name);
  await sleep(50);
  scheduler.routeEvent(A.id, A.name);
  await sleep(50);
  scheduler.routeEvent(C.id, C.name);
  await sleep(50);
  scheduler.routeEvent(A.id, A.name);
  await sleep(50);
  scheduler.routeEvent(C.id, C.name);
  await sleep(50);
  scheduler.routeEvent(B.id, B.name);

  // Wait for debounce + processing to complete
  await sleep(1500);

  console.log('Processed order:', processed.join(' → '));
  console.log('✅ Simulation complete');
  scheduler.stop();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


