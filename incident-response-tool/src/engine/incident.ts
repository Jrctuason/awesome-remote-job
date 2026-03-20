import { v4 as uuidv4 } from 'uuid';
import {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentEvent,
  TimelineEntry,
  RemediationStep,
  AIAnalysis,
  DataSourceType,
} from '../types/index.js';

// In-memory store (swap for a database in production)
const incidents = new Map<string, Incident>();

export function createIncident(params: {
  title: string;
  description: string;
  severity: IncidentSeverity;
  source: DataSourceType | 'manual';
  affectedServices?: string[];
  tags?: string[];
}): Incident {
  const now = new Date().toISOString();
  const incident: Incident = {
    id: uuidv4(),
    title: params.title,
    description: params.description,
    severity: params.severity,
    status: 'detected',
    createdAt: now,
    updatedAt: now,
    tags: params.tags ?? [],
    events: [],
    timeline: [
      {
        id: uuidv4(),
        timestamp: now,
        actor: 'system',
        message: `Incident created from source: ${params.source}`,
      },
    ],
    remediationSteps: [],
    affectedServices: params.affectedServices ?? [],
    source: params.source,
  };
  incidents.set(incident.id, incident);
  return incident;
}

export function getIncident(id: string): Incident | undefined {
  return incidents.get(id);
}

export function listIncidents(): Incident[] {
  return Array.from(incidents.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function updateIncidentStatus(id: string, status: IncidentStatus, actor = 'user'): Incident | null {
  const incident = incidents.get(id);
  if (!incident) return null;

  const now = new Date().toISOString();
  const statusLabels: Record<IncidentStatus, string> = {
    detected: 'Detected',
    triaged: 'Triaged',
    mitigating: 'Mitigation in progress',
    resolved: 'Resolved',
    'post-mortem': 'Post-mortem phase',
  };

  incident.status = status;
  incident.updatedAt = now;
  if (status === 'resolved') incident.resolvedAt = now;

  incident.timeline.push({
    id: uuidv4(),
    timestamp: now,
    actor: actor as TimelineEntry['actor'],
    message: `Status updated to: ${statusLabels[status]}`,
  });

  incidents.set(id, incident);
  return incident;
}

export function addEventToIncident(id: string, event: IncidentEvent): Incident | null {
  const incident = incidents.get(id);
  if (!incident) return null;

  incident.events.push(event);
  incident.updatedAt = new Date().toISOString();
  incident.timeline.push({
    id: uuidv4(),
    timestamp: event.timestamp,
    actor: 'system',
    message: `New event from ${event.source}: ${event.title}`,
    metadata: { eventId: event.id },
  });

  incidents.set(id, incident);
  return incident;
}

export function applyAIAnalysis(id: string, analysis: AIAnalysis): Incident | null {
  const incident = incidents.get(id);
  if (!incident) return null;

  const now = new Date().toISOString();
  incident.analysis = analysis;
  incident.severity = analysis.severity;
  incident.remediationSteps = analysis.remediationSteps;
  incident.updatedAt = now;

  // Auto-advance status if still in 'detected'
  if (incident.status === 'detected') {
    incident.status = 'triaged';
  }

  incident.timeline.push({
    id: uuidv4(),
    timestamp: now,
    actor: 'ai',
    message: `AI analysis complete. Root cause: ${analysis.rootCauseSuggestion}`,
  });

  incidents.set(id, incident);
  return incident;
}

export function completeRemediationStep(incidentId: string, stepOrder: number): Incident | null {
  const incident = incidents.get(incidentId);
  if (!incident) return null;

  const step = incident.remediationSteps.find((s) => s.order === stepOrder);
  if (!step) return null;

  step.completed = true;
  incident.updatedAt = new Date().toISOString();

  incident.timeline.push({
    id: uuidv4(),
    timestamp: incident.updatedAt,
    actor: 'user',
    message: `Remediation step ${stepOrder} completed: ${step.title}`,
  });

  // Auto-advance to 'mitigating' when first step is completed
  if (incident.status === 'triaged') {
    incident.status = 'mitigating';
  }

  // Auto-advance to 'resolved' when all steps are done
  const allDone = incident.remediationSteps.every((s) => s.completed);
  if (allDone) {
    incident.status = 'resolved';
    incident.resolvedAt = incident.updatedAt;
    incident.timeline.push({
      id: uuidv4(),
      timestamp: incident.updatedAt,
      actor: 'system',
      message: 'All remediation steps completed. Incident resolved.',
    });
  }

  incidents.set(incidentId, incident);
  return incident;
}

export function addTimelineEntry(
  incidentId: string,
  message: string,
  actor: TimelineEntry['actor'] = 'user'
): Incident | null {
  const incident = incidents.get(incidentId);
  if (!incident) return null;

  const now = new Date().toISOString();
  incident.timeline.push({ id: uuidv4(), timestamp: now, actor, message });
  incident.updatedAt = now;
  incidents.set(incidentId, incident);
  return incident;
}

export function deleteIncident(id: string): boolean {
  return incidents.delete(id);
}
