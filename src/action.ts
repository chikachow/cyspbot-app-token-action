import * as core from "@actions/core";

const cyspbotOidcAudience = "cyspbot";
const cyspbotTokenEndpoint = "https://cyspbot.chikachow.org/token";
const defaultCyspbotTimeoutMs = 10_000;
const githubInstallationAccessTokenType = "urn:chikachow:github-app-installation-access-token";
const oidcIdTokenType = "urn:ietf:params:oauth:token-type:id_token";
const tokenExchangeGrantType = "urn:ietf:params:oauth:grant-type:token-exchange";

interface TokenResponse {
  expiresAt: string;
  scope: string;
  token: string;
}

interface OAuthErrorResponse {
  error: string;
  errorDescription?: string;
}

export interface ActionDependencies {
  fetch: typeof fetch;
  getIDToken(audience: string): Promise<string>;
  getInput(name: string): string;
  now(): Date;
  setOutput(name: string, value: string): void;
  setSecret(value: string): void;
}

export async function runAction(
  dependencies: ActionDependencies = defaultDependencies,
): Promise<void> {
  const resource = normalizeInput(dependencies.getInput("resource"));
  const scope = normalizeInput(dependencies.getInput("scope"));

  const oidcToken = await dependencies.getIDToken(cyspbotOidcAudience);

  const body = new URLSearchParams({
    grant_type: tokenExchangeGrantType,
    requested_token_type: githubInstallationAccessTokenType,
    subject_token: oidcToken,
    subject_token_type: oidcIdTokenType,
  });
  if (resource !== null) {
    body.set("resource", resource);
  }
  if (scope !== null) {
    body.set("scope", scope);
  }
  const response = await dependencies.fetch(cyspbotTokenEndpoint, {
    body,
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    signal: AbortSignal.timeout(defaultCyspbotTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(await cyspbotRequestFailureMessage(response));
  }

  const tokenResponse = parseTokenResponse(await response.json(), dependencies.now());
  dependencies.setSecret(tokenResponse.token);
  dependencies.setOutput("token", tokenResponse.token);
  dependencies.setOutput("expires_at", tokenResponse.expiresAt);
  dependencies.setOutput("scope", tokenResponse.scope);
}

async function cyspbotRequestFailureMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type");

  if (isJsonContentType(contentType)) {
    const parsedBody = await response
      .json()
      .then((value: unknown) => parseOAuthErrorResponse(value))
      .catch(() => null);

    if (parsedBody === null) {
      return `cyspbot token exchange failed with ${response.status}: invalid OAuth error body`;
    }

    const description =
      parsedBody.errorDescription === undefined ? "" : `: ${parsedBody.errorDescription}`;

    return `cyspbot token exchange failed with ${response.status} ${parsedBody.error}${description}`;
  }

  return `cyspbot token exchange failed with ${response.status}: non-JSON response`;
}

function parseOAuthErrorResponse(value: unknown): OAuthErrorResponse | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const error = value["error"];
  const errorDescription = value["error_description"];

  if (typeof error !== "string" || error.length === 0) {
    return null;
  }

  if (errorDescription === undefined) {
    return { error };
  }

  if (typeof errorDescription !== "string" || errorDescription.length === 0) {
    return null;
  }

  return {
    error,
    errorDescription,
  };
}

function isJsonContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }

  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/json" ||
    (mediaType?.startsWith("application/") === true && mediaType.endsWith("+json"))
  );
}

function parseTokenResponse(value: unknown, now: Date): TokenResponse {
  if (!isJsonObject(value)) {
    throw new Error("cyspbot returned a non-object response");
  }

  const accessToken = value["access_token"];
  const expiresIn = value["expires_in"];
  const issuedTokenType = value["issued_token_type"];
  const scope = value["scope"];
  const tokenType = value["token_type"];

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error("cyspbot response access_token is missing or invalid");
  }

  if (typeof expiresIn !== "number" || !Number.isInteger(expiresIn) || expiresIn <= 0) {
    throw new Error("cyspbot response expires_in is missing or invalid");
  }

  if (issuedTokenType !== githubInstallationAccessTokenType) {
    throw new Error("cyspbot response issued_token_type is missing or invalid");
  }

  if (typeof scope !== "string" || scope.length === 0) {
    throw new Error("cyspbot response scope is missing or invalid");
  }

  if (tokenType !== "Bearer") {
    throw new Error("cyspbot response token_type is missing or invalid");
  }

  return {
    expiresAt: toSecondPrecisionIso(new Date(now.getTime() + expiresIn * 1_000)),
    scope,
    token: accessToken,
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSecondPrecisionIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/u, "Z");
}

function normalizeInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const defaultDependencies: ActionDependencies = {
  fetch,
  getIDToken: (audience: string) => core.getIDToken(audience),
  getInput: (name: string) => core.getInput(name),
  now: () => new Date(),
  setOutput: (name: string, value: string) => core.setOutput(name, value),
  setSecret: (value: string) => core.setSecret(value),
};
