// Where the app finds the agent and the two stores (server-side env, read per request).
export interface StoreRef {
  key: "pulso" | "kilometro";
  name: string;
  url: string;
}

export function storesConfig(): StoreRef[] {
  // Display order is fixed (not the order the agent receives), so the audience
  // always reads Pulso on the left of each comparison and Kilómetro on the right.
  return [
    { key: "pulso", name: "Pulso", url: (process.env.PULSO_URL ?? "http://localhost:3002").replace(/\/$/, "") },
    { key: "kilometro", name: "Kilómetro", url: (process.env.KILOMETRO_URL ?? "http://localhost:3001").replace(/\/$/, "") },
  ];
}

export const agentUrl = () => (process.env.AGENT_URL ?? "http://localhost:8000").replace(/\/$/, "");
