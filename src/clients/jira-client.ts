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
 * Client for the JIRA REST API v3.
 * Handles all interactions with JIRA Cloud.
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
   * Fetches information about a JIRA project.
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
        `[JIRA] Failed to fetch project ${projectKey}: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<JiraProject>;
  }

  /**
   * Searches issues via JQL.
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
        `[JIRA] JQL search failed: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<JiraSearchResponse>;
  }

  /**
   * Searches a Test Plan by its summary.
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
   * Creates a new Test Execution.
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
        `[JIRA] Failed to create Test Execution: ${response.status} - ${errorBody}`
      );
    }

    return response.json() as Promise<JiraIssueResponse>;
  }

  /**
   * Creates a link between two issues (Test Plan ↔ Test Execution).
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
        `[JIRA] Failed to create link ${inwardKey} → ${outwardKey}: ${response.status} - ${errorBody}`
      );
    }
  }

  /**
   * Adds a remote link (to Katalon TestOps or similar).
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
        `[JIRA] Failed to create remote link on ${issueKey}: ${response.status} - ${errorBody}`
      );
    }
  }

  /**
   * Adds an attachment to an issue.
   */
  async addAttachment(issueKey: string, filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[JIRA] File not found: ${filePath}`);
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
        `[JIRA] Failed to upload attachment on ${issueKey}: ${response.status} - ${errorBody}`
      );
    }
  }

  /**
   * Adds multiple attachments to an issue.
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
        console.error(`[JIRA] Failed to upload ${filePath}:`, error);
      }
    }

    return { success, failed };
  }

  /**
   * Performs a transition on an issue.
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
        `[JIRA] Failed transition on ${issueKey}: ${response.status} - ${errorBody}`
      );
    }
  }

  /**
   * Updates the fields of an issue.
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
        `[JIRA] Failed to update ${issueKey}: ${response.status} - ${errorBody}`
      );
    }
  }

  /**
   * Fetches the "Test Execution" issue type ID for the project.
   */
  async getTestExecutionIssueTypeId(projectKey: string): Promise<string> {
    const project = await this.getProjectInfo(projectKey);

    if (!project.issueTypes) {
      // Fetch issue types separately
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
          `[JIRA] Failed to fetch issue types: ${response.status}`
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
          `[JIRA] "Test Execution" type not found in project ${projectKey}`
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
        `[JIRA] "Test Execution" type not found in project ${projectKey}`
      );
    }

    return testExecType.id;
  }
}
