import * as core from "@actions/core";
import { z } from "zod";

const defaultAudience = "cyspbot";
const defaultCyspbotUrl = "https://cyspbot.chikachow.org";
const defaultCyspbotTimeoutMs = 10_000;

interface TokenResponse {
  expires_at: string;
  token: string;
}

const tokenResponseSchema = z.object({
  expires_at: z.string().min(1),
  token: z.string().min(1),
});

const problemResponseSchema = z.object({
  detail: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
});

export interface ActionDependencies {
  createTimeoutSignal(timeoutMs: number): AbortSignal;
  fetch: typeof fetch;
  getIDToken(audience?: string): Promise<string>;
  getInput(name: string): string;
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
  const response = await dependencies.fetch(new URL("/github/installations/token", cyspbotUrl), {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${oidcToken}`,
    },
    method: "POST",
    signal: dependencies.createTimeoutSignal(defaultCyspbotTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(await cyspbotRequestFailureMessage(response));
  }

  const tokenResponse = parseTokenResponse(await response.json());
  dependencies.setSecret(tokenResponse.token);
  dependencies.setOutput("token", tokenResponse.token);
  dependencies.setOutput("expires_at", tokenResponse.expires_at);
}

async function cyspbotRequestFailureMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/problem+json") === true) {
    const parsedBody = await response
      .json()
      .then((value: unknown) => problemResponseSchema.safeParse(value))
      .catch(() => null);

    if (parsedBody === null || !parsedBody.success) {
      return `cyspbot request failed with ${response.status}: invalid application/problem+json body`;
    }

    const title = parsedBody.data.title ?? "Request failed";
    const detail = parsedBody.data.detail === undefined ? "" : `: ${parsedBody.data.detail}`;

    return `cyspbot request failed with ${response.status} ${title}${detail}`;
  }

  const fallbackBodyText = await response.text();
  const suffix = fallbackBodyText.length > 0 ? `: ${fallbackBodyText}` : "";

  return `cyspbot request failed with ${response.status}${suffix}`;
}

function parseTokenResponse(value: unknown): TokenResponse {
  const result = tokenResponseSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  if (!isJsonObject(value)) {
    throw new Error("cyspbot returned a non-object response");
  }

  if (result.error.issues.some((issue) => issue.path[0] === "token")) {
    throw new Error("cyspbot response token is missing or invalid");
  }

  if (result.error.issues.some((issue) => issue.path[0] === "expires_at")) {
    throw new Error("cyspbot response expires_at is missing or invalid");
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
  setOutput: (name: string, value: string) => core.setOutput(name, value),
  setSecret: (value: string) => core.setSecret(value),
};
