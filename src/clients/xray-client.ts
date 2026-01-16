import {
  XrayImportPayload,
  XrayTestPlansResponse,
  XrayTestExecutionsResponse,
  XrayMutationResponse,
} from '../types';

/**
 * Client pour l'API Xray Cloud (REST v2 + GraphQL)
 * Gère l'authentification, l'import des résultats et les mutations GraphQL
 */
export class XrayClient {
  private static readonly BASE_URL = 'https://xray.cloud.getxray.app';
  private static readonly AUTH_ENDPOINT = '/api/v2/authenticate';
  private static readonly IMPORT_ENDPOINT = '/api/v2/import/execution';
  private static readonly GRAPHQL_ENDPOINT = '/api/v2/graphql';

  private clientId: string;
  private clientSecret: string;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Authentification et récupération du token JWT
   */
  async authenticate(): Promise<string> {
    // Vérifier si le token est encore valide (avec marge de 5 minutes)
    if (this.token && this.tokenExpiry) {
      const now = new Date();
      const margin = 5 * 60 * 1000; // 5 minutes
      if (this.tokenExpiry.getTime() - margin > now.getTime()) {
        return this.token;
      }
    }

    const response = await fetch(
      `${XrayClient.BASE_URL}${XrayClient.AUTH_ENDPOINT}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[XRAY] Échec authentification: ${response.status} - ${errorBody}`
      );
    }

    // Le token est retourné comme string directe (avec quotes)
    const tokenRaw = await response.text();
    this.token = tokenRaw.replace(/^"|"$/g, ''); // Enlever les quotes

    // Les tokens Xray expirent généralement après 1 heure
    this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);

    return this.token;
  }

  /**
   * Récupère le token, en s'authentifiant si nécessaire
   */
  private async getToken(): Promise<string> {
    if (!this.token) {
      await this.authenticate();
    }
    return this.token!;
  }

  /**
   * Import des résultats d'exécution vers Xray
   */
  async importExecutionResults(payload: XrayImportPayload): Promise<unknown> {
    const token = await this.getToken();

    const response = await fetch(
      `${XrayClient.BASE_URL}${XrayClient.IMPORT_ENDPOINT}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[XRAY] Échec import résultats: ${response.status} - ${errorBody}`
      );
    }

    return response.json();
  }

  /**
   * Exécute une requête GraphQL
   */
  private async executeGraphQL<T>(query: string): Promise<T> {
    const token = await this.getToken();

    const response = await fetch(
      `${XrayClient.BASE_URL}${XrayClient.GRAPHQL_ENDPOINT}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `[XRAY] Échec requête GraphQL: ${response.status} - ${errorBody}`
      );
    }

    const result = (await response.json()) as T & { errors?: unknown[] };

    if (result.errors) {
      throw new Error(
        `[XRAY] Erreurs GraphQL: ${JSON.stringify(result.errors)}`
      );
    }

    return result as T;
  }

  /**
   * Récupère l'issueId Xray d'un Test Plan via sa clé JIRA
   */
  async getTestPlanIssueId(jiraKey: string): Promise<string | null> {
    const query = `{
      getTestPlans(jql: "issueKey = '${jiraKey}'", limit: 1) {
        results {
          issueId
        }
      }
    }`;

    const result = await this.executeGraphQL<XrayTestPlansResponse>(query);

    if (result.data.getTestPlans.results.length > 0) {
      return result.data.getTestPlans.results[0].issueId;
    }

    return null;
  }

  /**
   * Récupère l'issueId Xray d'une Test Execution via sa clé JIRA
   */
  async getTestExecutionIssueId(jiraKey: string): Promise<string | null> {
    const query = `{
      getTestExecutions(jql: "issueKey = '${jiraKey}'", limit: 1) {
        results {
          issueId
        }
      }
    }`;

    const result = await this.executeGraphQL<XrayTestExecutionsResponse>(query);

    if (result.data.getTestExecutions.results.length > 0) {
      return result.data.getTestExecutions.results[0].issueId;
    }

    return null;
  }

  /**
   * Associe une Test Execution à un Test Plan
   */
  async addTestExecutionToTestPlan(
    testPlanIssueId: string,
    testExecIssueId: string
  ): Promise<XrayMutationResponse> {
    const query = `mutation {
      addTestExecutionsToTestPlan(
        issueId: "${testPlanIssueId}",
        testExecIssueIds: ["${testExecIssueId}"]
      ) {
        addedTestExecutions
        warning
      }
    }`;

    return this.executeGraphQL<XrayMutationResponse>(query);
  }

  /**
   * Associe plusieurs Test Executions à un Test Plan
   */
  async addMultipleTestExecutionsToTestPlan(
    testPlanIssueId: string,
    testExecIssueIds: string[]
  ): Promise<XrayMutationResponse> {
    const idsString = testExecIssueIds.map((id) => `"${id}"`).join(', ');

    const query = `mutation {
      addTestExecutionsToTestPlan(
        issueId: "${testPlanIssueId}",
        testExecIssueIds: [${idsString}]
      ) {
        addedTestExecutions
        warning
      }
    }`;

    return this.executeGraphQL<XrayMutationResponse>(query);
  }

  /**
   * Ajoute des environnements de test à une Test Execution
   */
  async addTestEnvironmentsToTestExecution(
    testExecIssueId: string,
    environments: string[]
  ): Promise<XrayMutationResponse> {
    const envsString = environments.map((e) => `"${e}"`).join(', ');

    const query = `mutation {
      addTestEnvironmentsToTestExecution(
        issueId: "${testExecIssueId}",
        testEnvironments: [${envsString}]
      ) {
        associatedTestEnvironments
        createdTestEnvironments
        warning
      }
    }`;

    return this.executeGraphQL<XrayMutationResponse>(query);
  }

  /**
   * Récupère les Tests associés à un Test Plan
   */
  async getTestsFromTestPlan(
    testPlanIssueId: string,
    limit: number = 100
  ): Promise<Array<{ issueId: string; jiraKey: string }>> {
    const query = `{
      getTestPlan(issueId: "${testPlanIssueId}") {
        tests(limit: ${limit}) {
          results {
            issueId
            jira(fields: ["key"]) {
              key
            }
          }
        }
      }
    }`;

    interface TestPlanTestsResponse {
      data: {
        getTestPlan: {
          tests: {
            results: Array<{
              issueId: string;
              jira: { key: string };
            }>;
          };
        };
      };
    }

    const result = await this.executeGraphQL<TestPlanTestsResponse>(query);

    return result.data.getTestPlan.tests.results.map((t) => ({
      issueId: t.issueId,
      jiraKey: t.jira.key,
    }));
  }

  /**
   * Récupère les détails d'une Test Execution
   */
  async getTestExecutionDetails(testExecIssueId: string): Promise<{
    issueId: string;
    jiraKey: string;
    testEnvironments: string[];
  } | null> {
    const query = `{
      getTestExecution(issueId: "${testExecIssueId}") {
        issueId
        jira(fields: ["key"]) {
          key
        }
        testEnvironments
      }
    }`;

    interface TestExecDetailsResponse {
      data: {
        getTestExecution: {
          issueId: string;
          jira: { key: string };
          testEnvironments: string[];
        } | null;
      };
    }

    const result = await this.executeGraphQL<TestExecDetailsResponse>(query);

    if (result.data.getTestExecution) {
      return {
        issueId: result.data.getTestExecution.issueId,
        jiraKey: result.data.getTestExecution.jira.key,
        testEnvironments: result.data.getTestExecution.testEnvironments,
      };
    }

    return null;
  }
}
