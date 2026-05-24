import * as core from "@actions/core";
import { z } from "zod";

const defaultAudience = "cyspbot";
const defaultCyspbotUrl = "https://cyspbot.chikachow.org";
const defaultCyspbotTimeoutMs = 10_000;
const githubInstallationAccessTokenType = "urn:chikachow:github-app-installation-access-token";
const oidcIdTokenType = "urn:ietf:params:oauth:token-type:id_token";
const tokenExchangeGrantType = "urn:ietf:params:oauth:grant-type:token-exchange";

interface TokenResponse {
  expiresAt: string;
  token: string;
}

const oauthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  issued_token_type: z.literal(githubInstallationAccessTokenType),
  token_type: z.literal("Bearer"),
});

const oauthErrorResponseSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().min(1).optional(),
});

export interface ActionDependencies {
  createTimeoutSignal(timeoutMs: number): AbortSignal;
  fetch: typeof fetch;
  getIDToken(audience?: string): Promise<string>;
  getInput(name: string): string;
  now(): Date;
  setOutput(name: string, value: string): void;
  setSecret(value: string): void;
}

export async function runAction(
  dependencies: ActionDependencies = defaultDependencies,
): Promise<void> {
  const audience = normalizeInput(dependencies.getInput("audience")) ?? defaultAudience;
  const cyspbotUrl = new URL(
    normalizeInput(dependencies.getInput("cyspbot-url")) ?? defaultCyspbotUrl,
  );
  if (cyspbotUrl.protocol !== "https:") {
    throw new Error("cyspbot-url must use https");
  }

  const oidcToken = await dependencies.getIDToken(audience);

  const body = new URLSearchParams({
    grant_type: tokenExchangeGrantType,
    requested_token_type: githubInstallationAccessTokenType,
    subject_token: oidcToken,
    subject_token_type: oidcIdTokenType,
  });
  const response = await dependencies.fetch(new URL("/token", cyspbotUrl), {
    body,
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    signal: dependencies.createTimeoutSignal(defaultCyspbotTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(await cyspbotRequestFailureMessage(response));
  }

  const tokenResponse = parseTokenResponse(await response.json(), dependencies.now());
  dependencies.setSecret(tokenResponse.token);
  dependencies.setOutput("token", tokenResponse.token);
  dependencies.setOutput("expires_at", tokenResponse.expiresAt);
}

async function cyspbotRequestFailureMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json") === true) {
    const parsedBody = await response
      .json()
      .then((value: unknown) => oauthErrorResponseSchema.safeParse(value))
      .catch(() => null);

    if (parsedBody === null || !parsedBody.success) {
      return `cyspbot token exchange failed with ${response.status}: invalid OAuth error body`;
    }

    const description =
      parsedBody.data.error_description === undefined
        ? ""
        : `: ${parsedBody.data.error_description}`;

    return `cyspbot token exchange failed with ${response.status} ${parsedBody.data.error}${description}`;
  }

  const fallbackBodyText = await response.text();
  const suffix = fallbackBodyText.length > 0 ? `: ${fallbackBodyText}` : "";

  return `cyspbot token exchange failed with ${response.status}${suffix}`;
}

function parseTokenResponse(value: unknown, now: Date): TokenResponse {
  const result = oauthTokenResponseSchema.safeParse(value);
  if (result.success) {
    return {
      expiresAt: new Date(now.getTime() + result.data.expires_in * 1_000).toISOString(),
      token: result.data.access_token,
    };
  }

  if (!isJsonObject(value)) {
    throw new Error("cyspbot returned a non-object response");
  }

  if (result.error.issues.some((issue) => issue.path[0] === "access_token")) {
    throw new Error("cyspbot response access_token is missing or invalid");
  }

  if (result.error.issues.some((issue) => issue.path[0] === "expires_in")) {
    throw new Error("cyspbot response expires_in is missing or invalid");
  }

  if (result.error.issues.some((issue) => issue.path[0] === "issued_token_type")) {
    throw new Error("cyspbot response issued_token_type is missing or invalid");
  }

  if (result.error.issues.some((issue) => issue.path[0] === "token_type")) {
    throw new Error("cyspbot response token_type is missing or invalid");
  }

  throw new Error("cyspbot returned an invalid response");
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const defaultDependencies: ActionDependencies = {
  createTimeoutSignal: (timeoutMs: number) => AbortSignal.timeout(timeoutMs),
  fetch,
  getIDToken: (audience?: string) => core.getIDToken(audience),
  getInput: (name: string) => core.getInput(name),
  now: () => new Date(),
  setOutput: (name: string, value: string) => core.setOutput(name, value),
  setSecret: (value: string) => core.setSecret(value),
};
