import WebSocket from "ws";

export interface FluxerGatewayOptions {
  token: string;
  onReady?: (data: any) => void;
  onMessage?: (data: any) => void;
  onError?: (error: any) => void;
  onDisconnect?: () => void;
}

export class FluxerGateway {
  private ws: WebSocket | null = null;
  private token: string;
  private sequence: number = 0;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private onReady?: (data: any) => void;
  private onMessage?: (data: any) => void;
  private onError?: (error: any) => void;
  private onDisconnect?: () => void;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  // Fluxer gateway URL with API version
  private readonly gatewayUrl = "wss://gateway.fluxer.app?v=1";

  constructor(options: FluxerGatewayOptions) {
    this.token = options.token;
    this.onReady = options.onReady;
    this.onMessage = options.onMessage;
    this.onError = options.onError;
    this.onDisconnect = options.onDisconnect;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[FluxerGateway] Connecting to ${this.gatewayUrl}...`);
        
        this.ws = new WebSocket(this.gatewayUrl, {
          headers: {
            Authorization: `Bot ${this.token}`,
          },
        });

        this.ws.on("open", () => {
          console.log("[FluxerGateway] WebSocket connection opened");
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          try {
            const payload = JSON.parse(data.toString());
            this.handlePayload(payload);
          } catch (err) {
            console.error("[FluxerGateway] Failed to parse message:", err);
          }
        });

        this.ws.on("error", (error) => {
          console.error("[FluxerGateway] WebSocket error:", error.message);
          this.onError?.(error);
          reject(error);
        });

        this.ws.on("close", (code, reason) => {
          console.log(`[FluxerGateway] WebSocket closed: ${code} - ${reason}`);
          this.onDisconnect?.();
          this.handleDisconnect();
        });

        // Wait for ready before resolving
        const originalOnReady = this.onReady;
        this.onReady = (data) => {
          console.log("[FluxerGateway] Received READY, connection established!");
          originalOnReady?.(data);
          resolve();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private handlePayload(payload: any) {
    // Update sequence
    if (payload.s) {
      this.sequence = payload.s;
    }

    const { t: eventType, d: eventData, op: opcode } = payload;

    console.log(`[FluxerGateway] Event: ${eventType || "OP " + opcode}`);

    switch (opcode) {
      case 10: // Hello
        console.log("[FluxerGateway] Received Hello, starting heartbeat...");
        this.startHeartbeat(eventData.heartbeat_interval);
        this.sendIdentify();
        break;

      case 11: // Heartbeat ACK
        console.log("[FluxerGateway] Heartbeat acknowledged");
        break;

      case 0: // Dispatch (READY)
        if (eventType === "READY") {
          this.sessionId = eventData.session_id;
          console.log(`[FluxerGateway] Session ID: ${this.sessionId}`);
          this.onReady?.(eventData);
        } else if (eventType === "MESSAGE_CREATE") {
          this.onMessage?.(eventData);
        }
        break;

      case 7: // Reconnect
        console.log("[FluxerGateway] Reconnect requested");
        this.reconnect();
        break;

      case 9: // Invalid session
        console.log("[FluxerGateway] Invalid session, will reconnect...");
        setTimeout(() => this.reconnect(), this.reconnectDelay);
        break;

      default:
        if (eventType) {
          console.log(`[FluxerGateway] Unhandled event: ${eventType}`);
        }
    }
  }

  private startHeartbeat(intervalMs: number) {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Send heartbeat every interval ms
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          op: 1,
          d: this.sequence,
        }));
      }
    }, intervalMs);
  }

  private sendIdentify() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("[FluxerGateway] Cannot identify - WebSocket not open");
      return;
    }

    console.log("[FluxerGateway] Sending IDENTIFY...");
    this.ws.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        intents: 513, // GUILD_MESSAGES + DIRECT_MESSAGES
        properties: {
          os: "node",
          browser: "FluxerBot",
          device: "FluxerBot",
        },
      },
    }));
  }

  private handleDisconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnect();
    } else {
      console.error("[FluxerGateway] Max reconnect attempts reached");
    }
  }

  private reconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[FluxerGateway] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

    setTimeout(() => {
      this.connect().catch((err) => {
        console.error("[FluxerGateway] Reconnect failed:", err.message);
      });
    }, delay);
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.ws) {
      this.ws.close(1000, "Client disconnecting");
      this.ws = null;
    }
  }
}
