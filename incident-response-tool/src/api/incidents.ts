import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createIncident,
  listIncidents,
  getIncident,
  updateIncidentStatus,
  applyAIAnalysis,
  completeRemediationStep,
  addTimelineEntry,
  addEventToIncident,
  deleteIncident,
} from '../engine/incident.js';
import { analyzeIncident, chatWithAI } from '../ai/claude.js';
import { IncidentEvent } from '../types/index.js';

const router = Router();

function id(req: Request): string {
  return req.params['id'] as string;
}

// GET /api/incidents — list all incidents
router.get('/', (_req: Request, res: Response) => {
  res.json(listIncidents());
});

// POST /api/incidents — create a new incident
router.post('/', (req: Request, res: Response) => {
  const { title, description, severity = 'medium', source = 'manual', affectedServices, tags } = req.body as {
    title: string;
    description: string;
    severity?: string;
    source?: string;
    affectedServices?: string[];
    tags?: string[];
  };

  if (!title || !description) {
    res.status(400).json({ error: 'title and description are required' });
    return;
  }

  const incident = createIncident({
    title,
    description,
    severity: severity as 'critical' | 'high' | 'medium' | 'low',
    source: source as 'manual',
    affectedServices,
    tags,
  });

  res.status(201).json(incident);
});

// GET /api/incidents/:id
router.get('/:id', (req: Request, res: Response) => {
  const incident = getIncident(id(req));
  if (!incident) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }
  res.json(incident);
});

// PATCH /api/incidents/:id/status
router.patch('/:id/status', (req: Request, res: Response) => {
  const { status } = req.body as { status: string };
  const incident = updateIncidentStatus(
    id(req),
    status as 'detected' | 'triaged' | 'mitigating' | 'resolved' | 'post-mortem'
  );
  if (!incident) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }
  res.json(incident);
});

// POST /api/incidents/:id/analyze — trigger Claude AI analysis
router.post('/:id/analyze', async (req: Request, res: Response) => {
  const incident = getIncident(id(req));
  if (!incident) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }

  try {
    const analysis = await analyzeIncident(incident);
    const updated = applyAIAnalysis(id(req), analysis);
    res.json(updated);
  } catch (e: unknown) {
    res.status(500).json({ error: `AI analysis failed: ${(e as Error).message}` });
  }
});

// POST /api/incidents/:id/chat — chat with AI about an incident
router.post('/:id/chat', async (req: Request, res: Response) => {
  const { message } = req.body as { message: string };
  const incident = getIncident(id(req));
  if (!incident) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const reply = await chatWithAI(incident, message);
    addTimelineEntry(id(req), `User asked: "${message.slice(0, 100)}"`, 'user');
    addTimelineEntry(id(req), `AI responded: "${reply.slice(0, 100)}"`, 'ai');
    res.json({ reply });
  } catch (e: unknown) {
    res.status(500).json({ error: `AI chat failed: ${(e as Error).message}` });
  }
});

// POST /api/incidents/:id/remediation/:order/complete
router.post('/:id/remediation/:order/complete', (req: Request, res: Response) => {
  const order = parseInt(req.params['order'] as string, 10);
  const updated = completeRemediationStep(id(req), order);
  if (!updated) {
    res.status(404).json({ error: 'Incident or step not found' });
    return;
  }
  res.json(updated);
});

// POST /api/incidents/:id/events — ingest a raw event
router.post('/:id/events', (req: Request, res: Response) => {
  const incident = getIncident(id(req));
  if (!incident) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }

  const event: IncidentEvent = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    source: ((req.body.source as string) ?? 'http') as 'http',
    type: (req.body.type as string) ?? 'manual',
    title: (req.body.title as string) ?? 'Manual event',
    description: (req.body.description as string) ?? '',
    metadata: (req.body.metadata as Record<string, unknown>) ?? {},
    rawPayload: req.body as unknown,
  };

  const updated = addEventToIncident(id(req), event);
  res.status(201).json(updated);
});

// POST /api/incidents/:id/timeline
router.post('/:id/timeline', (req: Request, res: Response) => {
  const { message } = req.body as { message: string };
  const updated = addTimelineEntry(id(req), message, 'user');
  if (!updated) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }
  res.json(updated);
});

// DELETE /api/incidents/:id
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = deleteIncident(id(req));
  if (!deleted) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }
  res.status(204).send();
});

export default router;
