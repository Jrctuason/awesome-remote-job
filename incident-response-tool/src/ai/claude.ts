import Anthropic from '@anthropic-ai/sdk';
import { Incident, AIAnalysis, RemediationStep, IncidentSeverity } from '../types/index.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert incident response analyst for a security and reliability engineering team.
Your role is to analyze incidents from any data source (GitHub, AWS, PagerDuty, HTTP APIs) and provide:
1. A clear, concise summary of what happened
2. Probable root cause (be specific — mention affected services, components, or infrastructure)
3. Impact assessment (who is affected, severity, blast radius)
4. Severity rating (critical/high/medium/low)
5. Step-by-step remediation plan ordered by priority

You serve both security experts and non-technical stakeholders. Be precise but accessible.
For each remediation step include:
- A short title (5–10 words)
- A clear description of the action
- An optional CLI command if applicable
- Whether it can be automated

Always think carefully before responding. Prioritize safety and minimal blast radius in remediation.`;

function buildIncidentContext(incident: Incident): string {
  const eventSummary = incident.events
    .slice(0, 20)
    .map((e) => `[${e.source.toUpperCase()}] ${e.type}: ${e.title}\n  ${e.description}`)
    .join('\n');

  return `
INCIDENT TITLE: ${incident.title}
DESCRIPTION: ${incident.description}
CURRENT SEVERITY: ${incident.severity}
AFFECTED SERVICES: ${incident.affectedServices.join(', ') || 'Unknown'}
TAGS: ${incident.tags.join(', ') || 'None'}
CREATED: ${incident.createdAt}

EVENTS FROM DATA SOURCES (${incident.events.length} total):
${eventSummary || 'No events collected yet'}

TIMELINE ENTRIES:
${incident.timeline
  .slice(-10)
  .map((t) => `[${t.timestamp}] ${t.actor.toUpperCase()}: ${t.message}`)
  .join('\n')}
`;
}

export async function analyzeIncident(incident: Incident): Promise<AIAnalysis> {
  const context = buildIncidentContext(incident);

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thinking: { type: 'adaptive' } as any,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analyze this incident and respond with a JSON object matching exactly this schema:

{
  "summary": "string — 2-3 sentence summary of the incident",
  "rootCauseSuggestion": "string — probable root cause",
  "impactAssessment": "string — who/what is affected and how severely",
  "severity": "critical" | "high" | "medium" | "low",
  "remediationSteps": [
    {
      "order": number,
      "title": "string",
      "description": "string",
      "command": "string (optional CLI command)",
      "link": "string (optional docs link)",
      "automated": boolean,
      "completed": false
    }
  ],
  "similarIncidents": ["string — description of potentially similar past incident patterns"]
}

Respond with ONLY the JSON object, no markdown fences, no explanation text.

INCIDENT DATA:
${context}`,
      },
    ],
  });

  const message = await stream.finalMessage();

  const rawText = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let parsed: Omit<AIAnalysis, 'generatedAt'>;
  try {
    // Strip any accidental markdown fences
    const jsonText = rawText.replace(/^```json?\s*/m, '').replace(/```\s*$/m, '').trim();
    parsed = JSON.parse(jsonText) as Omit<AIAnalysis, 'generatedAt'>;
  } catch {
    // Fallback if JSON parse fails
    parsed = {
      summary: 'AI analysis completed but response could not be parsed.',
      rootCauseSuggestion: rawText.slice(0, 500),
      impactAssessment: 'Unknown — review raw AI output',
      severity: incident.severity as IncidentSeverity,
      remediationSteps: [],
      similarIncidents: [],
    };
  }

  // Ensure all remediationSteps have the completed field
  const remediationSteps: RemediationStep[] = (parsed.remediationSteps ?? []).map((s) => ({
    ...s,
    completed: false,
  }));

  return {
    ...parsed,
    remediationSteps,
    generatedAt: new Date().toISOString(),
  };
}

export async function chatWithAI(
  incident: Incident,
  userMessage: string
): Promise<string> {
  const context = buildIncidentContext(incident);

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    system: `${SYSTEM_PROMPT}

You are helping with an active incident. Here is the current incident context:
${context}`,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
