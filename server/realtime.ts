import type { ServerResponse } from "node:http";

type Client = {
  id: string;
  response: ServerResponse;
};

class AuctionEventHub {
  private clients = new Map<string, Set<Client>>();

  subscribe(auctionId: string, response: ServerResponse) {
    const client = {
      id: crypto.randomUUID(),
      response
    };
    const clients = this.clients.get(auctionId) ?? new Set<Client>();
    clients.add(client);
    this.clients.set(auctionId, clients);

    return () => {
      clients.delete(client);
      if (!clients.size) this.clients.delete(auctionId);
    };
  }

  publish(auctionId: string, event: string, payload: unknown) {
    const clients = this.clients.get(auctionId);
    if (!clients) return;

    const data = JSON.stringify(payload);
    for (const client of clients) {
      client.response.write(`event: ${event}\n`);
      client.response.write(`data: ${data}\n\n`);
    }
  }
}

export const auctionEvents = new AuctionEventHub();
