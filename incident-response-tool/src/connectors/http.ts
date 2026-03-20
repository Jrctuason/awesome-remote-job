import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { IConnector, ConnectorFetchResult, IncidentEvent } from '../types/index.js';

/**
 * Generic HTTP connector — polls any REST endpoint for health / alert data.
 * Configure via WEBHOOK_SOURCES env var (comma-separated URLs).
 * Expected response shape: { status: 'ok'|'degraded'|'down', message?: string, ...metadata }
 */
export class HTTPConnector implements IConnector {
  type = 'http' as const;
  name = 'Generic HTTP';
  private sources: string[];

  constructor() {
    const raw = process.env.WEBHOOK_SOURCES ?? '';
    this.sources = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  isConfigured(): boolean {
    return this.sources.length > 0;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured()) return { ok: false, message: 'No WEBHOOK_SOURCES configured' };
    const results = await Promise.allSettled(
      this.sources.map((url) => axios.get(url, { timeout: 5000, validateStatus: () => true }))
    );
    const reachable = results.filter((r) => r.status === 'fulfilled').length;
    return {
      ok: reachable > 0,
      message: `${reachable}/${this.sources.length} sources reachable`,
    };
  }

  async fetchEvents(_since?: Date): Promise<ConnectorFetchResult> {
    if (!this.isConfigured()) return { events: [], error: 'No HTTP sources configured' };

    const events: IncidentEvent[] = [];
    const now = new Date().toISOString();

    const results = await Promise.allSettled(
      this.sources.map((url) =>
        axios.get(url, { timeout: 8000, validateStatus: () => true })
      )
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const url = this.sources[i];

      if (result.status === 'rejected') {
        events.push({
          id: uuidv4(),
          timestamp: now,
          source: 'http',
          type: 'endpoint_unreachable',
          title: `Endpoint Unreachable: ${url}`,
          description: `Failed to connect to ${url}: ${result.reason?.message ?? 'unknown error'}`,
          metadata: { url, error: result.reason?.message },
        });
        continue;
      }

      const { data, status } = result.value;
      const isDown = status >= 500 || data?.status === 'down';
      const isDegraded = status >= 400 || data?.status === 'degraded';

      if (isDown || isDegraded) {
        events.push({
          id: uuidv4(),
          timestamp: now,
          source: 'http',
          type: isDown ? 'endpoint_down' : 'endpoint_degraded',
          title: `${isDown ? 'Outage' : 'Degradation'} Detected: ${url}`,
          description: data?.message ?? `HTTP ${status} from ${url}`,
          metadata: {
            url,
            httpStatus: status,
            responseStatus: data?.status,
            ...(typeof data === 'object' ? data : {}),
          },
        });
      }
    }

    return { events };
  }
}
