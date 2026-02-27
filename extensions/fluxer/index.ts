import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { fluxerPlugin, startFluxerGateway, stopFluxerGateway } from "./src/channel.js";
import { setFluxerRuntime } from "./src/runtime.js";

const FLUXER_TOKEN = "1476673502723858547.75_p3FCiyrKb1PAdWqznKUZe90PQOFNFNp7n93nxp9A";

const plugin = {
  id: "fluxer",
  name: "Fluxer",
  description: "Fluxer channel plugin - Discord-like chat platform",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setFluxerRuntime(api.runtime);
    api.registerChannel({ plugin: fluxerPlugin as ChannelPlugin });
    
    console.log("[Fluxer] Starting gateway with token...");
    startFluxerGateway(FLUXER_TOKEN).catch(err => {
      console.error("[Fluxer] Failed to start gateway:", err);
    });
  },
};

export default plugin;
