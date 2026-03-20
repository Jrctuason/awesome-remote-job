import { Octokit } from '@octokit/rest';
import { v4 as uuidv4 } from 'uuid';
import { IConnector, ConnectorFetchResult, IncidentEvent } from '../types/index.js';

export class GitHubConnector implements IConnector {
  type = 'github' as const;
  name = 'GitHub';
  private octokit: Octokit | null = null;
  private org: string;
  private token: string;

  constructor() {
    this.token = process.env.GITHUB_TOKEN ?? '';
    this.org = process.env.GITHUB_ORG ?? '';
    if (this.token) {
      this.octokit = new Octokit({ auth: this.token });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.token && this.org);
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.octokit) return { ok: false, message: 'GitHub token not configured' };
    try {
      const { data } = await this.octokit.orgs.get({ org: this.org });
      return { ok: true, message: `Connected to GitHub org: ${data.login}` };
    } catch (e: unknown) {
      return { ok: false, message: `GitHub connection failed: ${(e as Error).message}` };
    }
  }

  async fetchEvents(since?: Date): Promise<ConnectorFetchResult> {
    if (!this.octokit || !this.isConfigured()) {
      return { events: [], error: 'GitHub connector not configured' };
    }

    const events: IncidentEvent[] = [];
    const sinceISO = since?.toISOString() ?? new Date(Date.now() - 3600_000).toISOString();

    try {
      // Fetch failed workflow runs (CI/CD failures)
      const repos = await this.octokit.repos.listForOrg({ org: this.org, per_page: 30 });
      for (const repo of repos.data.slice(0, 10)) {
        const runs = await this.octokit.actions.listWorkflowRunsForRepo({
          owner: this.org,
          repo: repo.name,
          status: 'failure',
          per_page: 5,
        });

        for (const run of runs.data.workflow_runs) {
          if (new Date(run.created_at) < new Date(sinceISO)) continue;
          events.push({
            id: uuidv4(),
            timestamp: run.created_at,
            source: 'github',
            type: 'workflow_failure',
            title: `CI/CD Failure: ${run.name} in ${repo.name}`,
            description: `Workflow "${run.name}" failed on branch ${run.head_branch}`,
            metadata: {
              repo: repo.full_name,
              runId: run.id,
              branch: run.head_branch,
              url: run.html_url,
              conclusion: run.conclusion,
            },
          });
        }

        // Fetch open incidents / security advisories
        try {
          const alerts = await this.octokit.secretScanning.listAlertsForRepo({
            owner: this.org,
            repo: repo.name,
            state: 'open',
            per_page: 5,
          });
          for (const alert of alerts.data) {
            events.push({
              id: uuidv4(),
              timestamp: alert.created_at ?? new Date().toISOString(),
              source: 'github',
              type: 'secret_scanning_alert',
              title: `Secret Exposed: ${alert.secret_type_display_name ?? alert.secret_type} in ${repo.name}`,
              description: `A secret was detected in repository ${repo.full_name}`,
              metadata: {
                repo: repo.full_name,
                alertNumber: alert.number,
                secretType: alert.secret_type,
                url: alert.html_url,
              },
            });
          }
        } catch {
          // secret scanning may not be enabled on all repos
        }
      }
    } catch (e: unknown) {
      return { events, error: `GitHub fetch error: ${(e as Error).message}` };
    }

    return { events };
  }
}
