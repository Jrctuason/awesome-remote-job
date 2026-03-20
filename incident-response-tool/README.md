# Incident Response Tool

An AI-powered incident response platform that connects any data source — GitHub, AWS CloudWatch, PagerDuty, or any HTTP API — and uses Claude AI to identify, triage, and guide your team through remediation.

## Features

- **Multi-source ingestion** — GitHub (CI/CD failures, secret scanning), AWS CloudWatch alarms, PagerDuty alerts, generic HTTP endpoints
- **AI-powered triage** — Claude Opus analyzes the incident and generates root cause analysis, impact assessment, and severity rating
- **Step-by-step remediation** — Ordered, actionable steps with optional CLI commands and docs links
- **Incident lifecycle** — Detected → Triaged → Mitigating → Resolved → Post-Mortem
- **AI chat** — Ask Claude anything about the active incident
- **Timeline** — Full audit trail of events, system actions, and user notes
- **Web dashboard** — Clean UI for both security experts and non-technical stakeholders

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 3. Run in development
npm run dev
# → Open http://localhost:3000
```

## Configuration

Copy `.env.example` to `.env` and fill in the keys you want to use:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI analysis |
| `GITHUB_TOKEN` | Optional | GitHub personal access token |
| `GITHUB_ORG` | Optional | GitHub org to scan |
| `PAGERDUTY_API_KEY` | Optional | PagerDuty API key |
| `PAGERDUTY_SERVICE_ID` | Optional | Specific service to watch |
| `AWS_ACCESS_KEY_ID` | Optional | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | Optional | AWS credentials |
| `AWS_REGION` | Optional | AWS region (default: us-east-1) |
| `WEBHOOK_SOURCES` | Optional | Comma-separated HTTP endpoints to poll |

## API Reference

```
GET    /api/incidents               List all incidents
POST   /api/incidents               Create incident
GET    /api/incidents/:id           Get incident detail
PATCH  /api/incidents/:id/status    Update status
POST   /api/incidents/:id/analyze   Trigger Claude AI analysis
POST   /api/incidents/:id/chat      Chat with Claude about the incident
POST   /api/incidents/:id/events    Ingest an event
POST   /api/incidents/:id/timeline  Add timeline note
POST   /api/incidents/:id/remediation/:order/complete  Mark step done
DELETE /api/incidents/:id           Delete incident

GET    /api/sources                 List configured sources
POST   /api/sources/scan            Scan all sources for events
POST   /api/sources/:type/test      Test a source connection
POST   /api/sources/:type/fetch     Fetch events from a source

GET    /api/health                  Health check
```

## Architecture

```
incident-response-tool/
├── src/
│   ├── index.ts              # Express server
│   ├── types/index.ts        # Shared TypeScript types
│   ├── engine/
│   │   └── incident.ts       # Incident state machine (in-memory store)
│   ├── connectors/
│   │   ├── github.ts         # GitHub connector
│   │   ├── pagerduty.ts      # PagerDuty connector
│   │   ├── aws.ts            # AWS CloudWatch connector
│   │   └── http.ts           # Generic HTTP connector
│   ├── ai/
│   │   └── claude.ts         # Claude Opus AI integration
│   └── api/
│       ├── incidents.ts      # Incident API routes
│       └── sources.ts        # Data source API routes
└── public/
    ├── index.html            # Dashboard UI
    ├── styles.css            # Dark-theme styles
    └── app.js                # Frontend JavaScript
```

## Extending

### Add a custom data source

Implement `IConnector` from `src/types/index.ts`:

```typescript
import { IConnector, ConnectorFetchResult } from '../types/index.js';

export class MyConnector implements IConnector {
  type = 'http' as const;
  name = 'My System';
  isConfigured() { return Boolean(process.env.MY_API_KEY); }
  async testConnection() { return { ok: true, message: 'Connected' }; }
  async fetchEvents(since?: Date): Promise<ConnectorFetchResult> {
    // ... fetch and return IncidentEvent[]
  }
}
```

Then register it in `src/api/sources.ts`.

## Production Notes

- Replace the in-memory store in `src/engine/incident.ts` with a database (PostgreSQL, MongoDB, etc.)
- Add authentication (API keys, OAuth) before exposing externally
- The AWS connector uses mock data — integrate `@aws-sdk/client-cloudwatch` for real alarms
