import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import {
  JiraIssueResponse,
  JiraSearchResponse,
  JiraProject,
  JiraAdfDocument,
} from '../types';

/**
 * Client pour l'API REST JIRA v3
 * Gère toutes les interactions avec JIRA Cloud
 */
export class JiraClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(baseUrl: string, email: string, apiToken: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * Récupère les informations d'un projet JIRA
   */
  async getProjectInfo(projectKey: string): Promise<JiraProject> {
    const response = await fetch(
      `${this.baseUrl}/rest/api/3/project/${projectKey}`,
      {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `[JIRA] Échec récupération projet ${projectKey}: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<JiraProject>;
  }

  /**
   * Recherche des issues via JQL
   */
  async searchIssuesByJql(
    jql: string,
    fields: string[] = ['key', 'summary'],
    maxResults: number = 10
  ): Promise<JiraSearchResponse> {
    const params = new URLSearchParams({
      jql,
      maxResults: maxResults.toString(),
      fields: fields.join(','),
    });

    const response = await fetch(
      `${this.baseUrl}/rest/api/3/search?${params}`,
      {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `[JIRA] Échec recherche JQL: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<JiraSearchResponse>;
  }

  /**
   * Recherche un Test Plan par son summary
   */
  async findTestPlanBySummary(
    summary: string,
    projectKey: string
  ): Promise<string | null> {
    const jql = `project = "${projectKey}" AND issuetype = "Test Plan" AND summary ~ "\\"${summary}\\""`;
    const result = await this.searchIssuesByJql(jql, ['key'], 1);

    if (result.issues.length > 0) {
      return result.issues[0].key;
    }
    return null;
  }

  /**
   * Crée une nouvelle Test Execution
   */
  async createTestExecution(
    projectId: string,
    issueTypeId: string,
    summary: string,
    labels: string[] = ['Automation'],
    description?: JiraAdfDocument
  ): Promise<JiraIssueResponse> {
    const body: Record<string, unknown> = {
      fields: {
        project: { id: projectId },
        issuetype: { id: issueTypeId },
        summary,
        labels,
      },
    };

    if (description) {
      (body.fields as Record<string, unknown>).description = description;
    }

    const response = await fetch(`${this.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[JIRA] Échec création Test Execution: ${response.status} - ${errorBody}`
      );
    }

    return response.json() as Promise<JiraIssueResponse>;
  }

  /**
   * Crée un lien entre deux issues (Test Plan ↔ Test Execution)
   */
  async createIssueLink(
    inwardKey: string,
    outwardKey: string,
    linkType: string = 'Relates'
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/rest/api/3/issueLink`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        inwardIssue: { key: inwardKey },
        outwardIssue: { key: outwardKey },
        type: { name: linkType },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[JIRA] Échec création lien ${inwardKey} → ${outwardKey}: ${response.status} - ${errorBody}`
      );
    }
  }

  /**
   * Ajoute un lien distant (vers Katalon TestOps ou autre)
   */
  async createRemoteLink(
    issueKey: string,
    title: string,
    url: string
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/rest/api/3/issue/${issueKey}/remotelink`,
      {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          object: { title, url },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[JIRA] Échec création remote link sur ${issueKey}: ${response.status} - ${errorBody}`
      );
    }
  }

  /**
   * Ajoute une pièce jointe à une issue
   */
  async addAttachment(issueKey: string, filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[JIRA] Fichier non trouvé: ${filePath}`);
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), {
      filename: path.basename(filePath),
    });

    const response = await fetch(
      `${this.baseUrl}/rest/api/3/issue/${issueKey}/attachments`,
      {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          'X-Atlassian-Token': 'no-check',
          ...form.getHeaders(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: form as any,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[JIRA] Échec upload attachment sur ${issueKey}: ${response.status} - ${errorBody}`
      );
    }
  }

  /**
   * Ajoute plusieurs pièces jointes à une issue
   */
  async addMultipleAttachments(
    issueKey: string,
    filePaths: string[]
  ): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const filePath of filePaths) {
      try {
        await this.addAttachment(issueKey, filePath);
        success.push(filePath);
      } catch (error) {
        failed.push(filePath);
        console.error(`[JIRA] Échec upload ${filePath}:`, error);
      }
    }

    return { success, failed };
  }

  /**
   * Effectue une transition sur une issue
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`,
      {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          transition: { id: transitionId },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[JIRA] Échec transition ${issueKey}: ${response.status} - ${errorBody}`
      );
    }
  }

  /**
   * Met à jour les champs d'une issue
   */
  async updateIssueFields(
    issueKey: string,
    fields: Record<string, unknown>
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/rest/api/3/issue/${issueKey}`,
      {
        method: 'PUT',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
          Accept: '*/*',
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[JIRA] Échec mise à jour ${issueKey}: ${response.status} - ${errorBody}`
      );
    }
  }

  /**
   * Récupère l'ID du type d'issue "Test Execution" pour le projet
   */
  async getTestExecutionIssueTypeId(projectKey: string): Promise<string> {
    const project = await this.getProjectInfo(projectKey);

    if (!project.issueTypes) {
      // Récupérer les types d'issues séparément
      const response = await fetch(
        `${this.baseUrl}/rest/api/3/issuetype/project?projectId=${project.id}`,
        {
          method: 'GET',
          headers: {
            Authorization: this.authHeader,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `[JIRA] Échec récupération types d'issues: ${response.status}`
        );
      }

      const issueTypes = (await response.json()) as Array<{
        id: string;
        name: string;
      }>;
      const testExecType = issueTypes.find(
        (it) =>
          it.name.toLowerCase() === 'test execution' ||
          it.name.toLowerCase() === 'test exec'
      );

      if (!testExecType) {
        throw new Error(
          `[JIRA] Type "Test Execution" non trouvé dans le projet ${projectKey}`
        );
      }

      return testExecType.id;
    }

    const testExecType = project.issueTypes.find(
      (it) =>
        it.name.toLowerCase() === 'test execution' ||
        it.name.toLowerCase() === 'test exec'
    );

    if (!testExecType) {
      throw new Error(
        `[JIRA] Type "Test Execution" non trouvé dans le projet ${projectKey}`
      );
    }

    return testExecType.id;
  }
}
