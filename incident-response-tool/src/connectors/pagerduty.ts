import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { IConnector, ConnectorFetchResult, IncidentEvent } from '../types/index.js';

interface PDIncident {
  id: string;
  title: string;
  description?: string;
  urgency: string;
  status: string;
  created_at: string;
  service: { summary: string };
  html_url: string;
  body?: { details?: string };
}

export class PagerDutyConnector implements IConnector {
  type = 'pagerduty' as const;
  name = 'PagerDuty';
  private apiKey: string;
  private serviceId: string;

  constructor() {
    this.apiKey = process.env.PAGERDUTY_API_KEY ?? '';
    this.serviceId = process.env.PAGERDUTY_SERVICE_ID ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.apiKey) return { ok: false, message: 'PagerDuty API key not configured' };
    try {
      const res = await axios.get('https://api.pagerduty.com/users/me', {
        headers: { Authorization: `Token token=${this.apiKey}`, Accept: 'application/vnd.pagerduty+json;version=2' },
      });
      return { ok: true, message: `Connected as PagerDuty user: ${res.data.user.email}` };
    } catch (e: unknown) {
      return { ok: false, message: `PagerDuty connection failed: ${(e as Error).message}` };
    }
  }

  async fetchEvents(since?: Date): Promise<ConnectorFetchResult> {
    if (!this.isConfigured()) return { events: [], error: 'PagerDuty connector not configured' };

    const sinceISO = since?.toISOString() ?? new Date(Date.now() - 3600_000).toISOString();
    const events: IncidentEvent[] = [];

    try {
      const params: Record<string, string> = {
        'statuses[]': 'triggered',
        since: sinceISO,
        limit: '25',
      };
      if (this.serviceId) params['service_ids[]'] = this.serviceId;

      const res = await axios.get('https://api.pagerduty.com/incidents', {
        headers: {
          Authorization: `Token token=${this.apiKey}`,
          Accept: 'application/vnd.pagerduty+json;version=2',
        },
        params,
      });

      for (const inc of res.data.incidents as PDIncident[]) {
        events.push({
          id: uuidv4(),
          timestamp: inc.created_at,
          source: 'pagerduty',
          type: 'alert_triggered',
          title: `Alert: ${inc.title}`,
          description: inc.body?.details ?? inc.description ?? `PagerDuty alert on service ${inc.service.summary}`,
          metadata: {
            pdId: inc.id,
            urgency: inc.urgency,
            status: inc.status,
            service: inc.service.summary,
            url: inc.html_url,
          },
        });
      }
    } catch (e: unknown) {
      return { events, error: `PagerDuty fetch error: ${(e as Error).message}` };
    }

    return { events };
  }
}
