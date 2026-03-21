import { Router, Request, Response } from 'express';
import { GitHubConnector } from '../connectors/github';
import { PagerDutyConnector } from '../connectors/pagerduty';
import { AWSConnector } from '../connectors/aws';
import { HTTPConnector } from '../connectors/http';
import { IConnector } from '../types/index';

const router = Router();

const connectors: IConnector[] = [
  new GitHubConnector(),
  new PagerDutyConnector(),
  new AWSConnector(),
  new HTTPConnector(),
];

// GET /api/sources — list all sources and their status
router.get('/', (_req: Request, res: Response) => {
  res.json(
    connectors.map((c) => ({
      type: c.type,
      name: c.name,
      configured: c.isConfigured(),
    }))
  );
});

// POST /api/sources/:type/test — test a connector's connection
router.post('/:type/test', async (req: Request, res: Response) => {
  const typeParam = req.params['type'] as string;
  const connector = connectors.find((c) => c.type === typeParam);
  if (!connector) {
    res.status(404).json({ error: `Unknown source type: ${typeParam}` });
    return;
  }

  const result = await connector.testConnection();
  res.json(result);
});

// POST /api/sources/scan — fetch events from all configured sources
router.post('/scan', async (_req: Request, res: Response) => {
  const since = new Date(Date.now() - 3600_000); // last hour
  const results = await Promise.allSettled(
    connectors.map(async (c) => ({
      source: c.type,
      name: c.name,
      configured: c.isConfigured(),
      result: c.isConfigured() ? await c.fetchEvents(since) : { events: [] },
    }))
  );

  const output = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { source: 'unknown', error: (r.reason as Error).message }
  );

  res.json(output);
});

// POST /api/sources/:type/fetch — fetch events from a single source
router.post('/:type/fetch', async (req: Request, res: Response) => {
  const typeParam = req.params['type'] as string;
  const connector = connectors.find((c) => c.type === typeParam);
  if (!connector) {
    res.status(404).json({ error: `Unknown source type: ${typeParam}` });
    return;
  }

  if (!connector.isConfigured()) {
    res.status(400).json({ error: `${connector.name} is not configured. Check your .env file.` });
    return;
  }

  const sinceMs = req.body.since
    ? new Date(req.body.since as string).getTime()
    : Date.now() - 3600_000;

  const result = await connector.fetchEvents(new Date(sinceMs));
  res.json(result);
});

export default router;
