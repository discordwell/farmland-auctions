import { drainOutbox } from "./email.js";

let timer: NodeJS.Timeout | null = null;

const POLL_MS = 30_000;

export function startNotificationWorker() {
  if (timer) return; // single boot guard — dev reloads don't double-fire
  timer = setInterval(async () => {
    try {
      await drainOutbox();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("notificationWorker drainOutbox failed", error);
    }
  }, POLL_MS);

  // Run once immediately so a recently-queued notification doesn't wait 30s on boot.
  drainOutbox().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("notificationWorker initial drainOutbox failed", error);
  });
}

export function stopNotificationWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
