export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'detected' | 'triaged' | 'mitigating' | 'resolved' | 'post-mortem';
export type DataSourceType = 'github' | 'aws' | 'pagerduty' | 'http';

export interface IncidentEvent {
  id: string;
  timestamp: string;
  source: DataSourceType;
  type: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  rawPayload?: unknown;
}

export interface RemediationStep {
  order: number;
  title: string;
  description: string;
  command?: string;          // optional runbook command
  link?: string;             // link to docs / runbook
  automated: boolean;
  completed: boolean;
}

export interface AIAnalysis {
  summary: string;
  rootCauseSuggestion: string;
  impactAssessment: string;
  severity: IncidentSeverity;
  remediationSteps: RemediationStep[];
  similarIncidents: string[];
  generatedAt: string;
}

export interface TimelineEntry {
  id: string;
  timestamp: string;
  actor: 'system' | 'ai' | 'user';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  assignee?: string;
  tags: string[];
  events: IncidentEvent[];
  timeline: TimelineEntry[];
  analysis?: AIAnalysis;
  remediationSteps: RemediationStep[];
  affectedServices: string[];
  source: DataSourceType | 'manual';
}

export interface DataSourceConfig {
  type: DataSourceType;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
}

export interface ConnectorFetchResult {
  events: IncidentEvent[];
  error?: string;
}

export interface IConnector {
  type: DataSourceType;
  name: string;
  isConfigured(): boolean;
  fetchEvents(since?: Date): Promise<ConnectorFetchResult>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
