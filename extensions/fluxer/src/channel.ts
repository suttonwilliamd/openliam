import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  formatPairingApproveHint,
  getChatChannelMeta,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
  deleteAccountFromConfigSection,
  type ChannelPlugin,
  type ResolvedChannelAccount,
} from "openclaw/plugin-sdk";
import { FluxerConfigSchema, type FluxerConfig } from "./config-schema.js";
import { getFluxerRuntime } from "./runtime.js";
import { FluxerGateway } from "./gateway.js";

let fluxerGateway: FluxerGateway | null = null;
let gatewaySessionId: string | null = null;

export async function startFluxerGateway(token: string): Promise<void> {
  if (fluxerGateway && fluxerGateway.isConnected()) {
    console.log("[Fluxer] Gateway already connected");
    return;
  }

  console.log("[Fluxer] Starting gateway connection...");

  fluxerGateway = new FluxerGateway({
    token,
    onReady: (data) => {
      console.log("[Fluxer] Gateway ready!");
      gatewaySessionId = fluxerGateway?.getSessionId() ?? null;
    },
    onMessage: (data) => {
      console.log("[Fluxer] Received message:", data.id);
    },
    onError: (error) => {
      console.error("[Fluxer] Gateway error:", error.message);
    },
    onDisconnect: () => {
      console.log("[Fluxer] Gateway disconnected");
      gatewaySessionId = null;
    },
  });

  try {
    await fluxerGateway.connect();
    console.log("[Fluxer] Gateway connection established");
  } catch (error) {
    console.error("[Fluxer] Failed to connect gateway:", error);
    throw error;
  }
}

export function stopFluxerGateway(): void {
  if (fluxerGateway) {
    fluxerGateway.disconnect();
    fluxerGateway = null;
    gatewaySessionId = null;
    console.log("[Fluxer] Gateway stopped");
  }
}

export function isFluxerGatewayConnected(): boolean {
  return gatewaySessionId !== null;
}

const meta = getChatChannelMeta("fluxer");

export interface ResolvedFluxerAccount extends ResolvedChannelAccount {
  accountId: string;
  token: string;
  enabled: boolean;
}

async function resolveFluxerAccount(cfg: any, accountId: string): Promise<ResolvedFluxerAccount | null> {
  const account = cfg.channels?.fluxer?.accounts?.[accountId];
  if (!account?.enabled || !account.token) {
    return null;
  }
  return {
    accountId,
    token: account.token,
    enabled: account.enabled,
    name: account.name ?? `Fluxer Bot`,
  };
}

function resolveDefaultFluxerAccountId(cfg: any): string {
  return DEFAULT_ACCOUNT_ID;
}

function listFluxerAccountIds(cfg: any): string[] {
  const accounts = cfg.channels?.fluxer?.accounts;
  if (!accounts) return [DEFAULT_ACCOUNT_ID];
  return Object.keys(accounts);
}

// Send message via Fluxer REST API
async function sendFluxerMessage(
  token: string,
  channelId: string,
  content: string
): Promise<{ id: string }> {
  // Note: Fluxer REST API may require gateway session for some operations
  // For now, try directly via REST API
  
  const response = await fetch(`https://api.fluxer.app/v1/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(`Fluxer API error: ${error.message}`);
  }

  return response.json();
}

// Probe - verify token works
async function probeFluxer(token: string, timeoutMs: number): Promise<{ ok: boolean; note?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch("https://api.fluxer.app/v1/users/@me", {
      headers: { Authorization: `Bot ${token}` },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const user = await response.json();
      return { ok: true, note: `Connected as ${user.username}` };
    }
    return { ok: false, note: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, note: error instanceof Error ? error.message : "Connection failed" };
  }
}

export const fluxerPlugin: ChannelPlugin<ResolvedFluxerAccount> = {
  id: "fluxer",
  meta: {
    ...meta,
  },
  capabilities: {
    chatTypes: ["direct", "channel"],
    polls: false,
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
  },
  configSchema: buildChannelConfigSchema(FluxerConfigSchema),
  config: {
    listAccountIds: (cfg) => listFluxerAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveFluxerAccount(cfg, accountId),
    defaultAccountId: (cfg) => resolveDefaultFluxerAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "fluxer",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "fluxer",
        accountId,
        clearBaseFields: ["token", "name"],
      }),
    isConfigured: (account) => Boolean(account.token?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
    }),
  },
  outbound: {
    deliveryMode: "direct",
    chunker: null,
    textChunkLimit: 2000,
    pollMaxOptions: 0,
    resolveTarget: ({ to }) => {
      // Accept channel IDs directly
      return to;
    },
    sendText: async ({ to, text, accountId, replyToId, silent }) => {
      const cfg = getFluxerRuntime().config.get();
      const account = await resolveFluxerAccount(cfg, accountId ?? DEFAULT_ACCOUNT_ID);
      if (!account) {
        throw new Error("Fluxer account not configured");
      }

      const result = await sendFluxerMessage(account.token, to, text);
      return { channel: "fluxer", id: result.id };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: () => [],
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: "manual",
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) => {
      const result = await probeFluxer(account.token, timeoutMs);
      return {
        ok: result.ok,
        note: result.note,
      };
    },
  },
};
