import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { runAction, type ActionDependencies } from "../src/action.ts";

interface MockedDependencies {
  dependencies: ActionDependencies;
  getIDTokenMock: ReturnType<typeof mock.fn>;
  getInputMock: ReturnType<typeof mock.fn>;
  nowMock: ReturnType<typeof mock.fn>;
  setOutputMock: ReturnType<typeof mock.fn>;
  setSecretMock: ReturnType<typeof mock.fn>;
}

function successfulTokenResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    access_token: "ghs_token",
    expires_in: 3600,
    issued_token_type: "urn:chikachow:github-app-installation-access-token",
    scope: "contents:write pull_requests:write",
    token_type: "Bearer",
    ...overrides,
  };
}

function createDependencies(overrides?: Partial<ActionDependencies>): MockedDependencies {
  const now = new Date("2030-01-01T00:00:00Z");
  const fetchMock = mock.fn<ActionDependencies["fetch"]>();
  const getIDTokenMock = mock.fn<ActionDependencies["getIDToken"]>(async () => "oidc-token");
  const getInputMock = mock.fn<ActionDependencies["getInput"]>(() => "");
  const setOutputMock = mock.fn<ActionDependencies["setOutput"]>();
  const setSecretMock = mock.fn<ActionDependencies["setSecret"]>();
  const nowMock = mock.fn<ActionDependencies["now"]>(() => now);

  return {
    dependencies: {
      fetch: fetchMock,
      getIDToken: getIDTokenMock,
      getInput: getInputMock,
      now: nowMock,
      setOutput: setOutputMock,
      setSecret: setSecretMock,
      ...overrides,
    },
    getIDTokenMock,
    getInputMock,
    nowMock,
    setOutputMock,
    setSecretMock,
  };
}

void describe("runAction", () => {
  void it("mints a cyspbot token and exports it as an output", async () => {
    const fetchImplementation: ActionDependencies["fetch"] = async (input, init) => {
      assert.equal(
        input instanceof URL ? input.toString() : input,
        "https://cyspbot.chikachow.org/token",
      );
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("content-type"),
        "application/x-www-form-urlencoded",
      );
      assert.equal(init?.signal instanceof AbortSignal, true);

      const body = new URLSearchParams(init?.body as string);
      assert.deepEqual(Object.fromEntries(body), {
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        requested_token_type: "urn:chikachow:github-app-installation-access-token",
        subject_token: "oidc-token",
        subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      });

      return Response.json(successfulTokenResponse());
    };

    const { dependencies, getIDTokenMock, setOutputMock, setSecretMock } = createDependencies({
      fetch: mock.fn(fetchImplementation),
    });

    await runAction(dependencies);

    assert.deepEqual(getIDTokenMock.mock.calls[0]?.arguments, ["cyspbot"]);
    assert.deepEqual(setSecretMock.mock.calls[0]?.arguments, ["ghs_token"]);
    assert.equal(setOutputMock.mock.calls.length, 3);
    assert.deepEqual(setOutputMock.mock.calls[0]?.arguments, ["token", "ghs_token"]);
    assert.deepEqual(setOutputMock.mock.calls[1]?.arguments, [
      "expires_at",
      "2030-01-01T01:00:00Z",
    ]);
    assert.deepEqual(setOutputMock.mock.calls[2]?.arguments, [
      "scope",
      "contents:write pull_requests:write",
    ]);
  });

  void it("uses default values when inputs are blank", async () => {
    let requestHasAudience = true;
    let requestHasGitHubApp = true;
    let requestHasResource = true;
    let requestHasScope = true;
    const { dependencies, getIDTokenMock } = createDependencies({
      fetch: mock.fn(async (_input, init) => {
        const requestBody = new URLSearchParams(init?.body as string);
        requestHasAudience = requestBody.has("audience");
        requestHasGitHubApp = requestBody.has("github_app");
        requestHasResource = requestBody.has("resource");
        requestHasScope = requestBody.has("scope");
        return Response.json(successfulTokenResponse());
      }),
      getInput: mock.fn(() => "   "),
    });

    await runAction(dependencies);

    assert.deepEqual(getIDTokenMock.mock.calls[0]?.arguments, ["cyspbot"]);
    assert.equal(requestHasAudience, false);
    assert.equal(requestHasGitHubApp, false);
    assert.equal(requestHasResource, false);
    assert.equal(requestHasScope, false);
  });

  void it("passes explicit resource and scope token request options to cyspbot", async () => {
    const fetchImplementation: ActionDependencies["fetch"] = async (_input, init) => {
      const body = new URLSearchParams(init?.body as string);
      assert.equal(body.has("audience"), false);
      assert.equal(body.has("github_app"), false);
      assert.equal(body.get("resource"), "https://api.github.com/repos/cysp/example");
      assert.equal(body.get("scope"), "contents:write pull_requests:write");

      return Response.json(successfulTokenResponse());
    };

    const { dependencies, getIDTokenMock } = createDependencies({
      fetch: mock.fn(fetchImplementation),
      getInput: mock.fn((name: string) => {
        if (name === "resource") {
          return "  https://api.github.com/repos/cysp/example  ";
        }

        if (name === "scope") {
          return "  contents:write pull_requests:write  ";
        }

        return "";
      }),
    });

    await runAction(dependencies);

    assert.deepEqual(getIDTokenMock.mock.calls[0]?.arguments, ["cyspbot"]);
  });

  void it("passes arbitrary non-blank scopes to cyspbot", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async (_input, init) => {
        const body = new URLSearchParams(init?.body as string);
        assert.equal(body.get("scope"), "issues:write metadata:read");
        return Response.json(successfulTokenResponse());
      }),
      getInput: mock.fn((name: string) => {
        if (name === "scope") {
          return "  issues:write metadata:read  ";
        }

        return "";
      }),
    });

    await runAction(dependencies);
  });

  void it("passes non-blank resources to cyspbot without local validation", async () => {
    const { dependencies, getIDTokenMock } = createDependencies({
      fetch: mock.fn(async (_input, init) => {
        const body = new URLSearchParams(init?.body as string);
        assert.equal(body.get("resource"), "cysp/example");
        return Response.json(successfulTokenResponse());
      }),
      getInput: mock.fn((name: string) => {
        if (name === "resource") {
          return "  cysp/example  ";
        }

        return "";
      }),
    });

    await runAction(dependencies);

    assert.deepEqual(getIDTokenMock.mock.calls[0]?.arguments, ["cyspbot"]);
  });

  void it("surfaces OAuth errors from cyspbot", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return new Response(
          JSON.stringify({
            error: "invalid_target",
            error_description: "event not allowed",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 400,
          },
        );
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot token exchange failed with 400 invalid_target: event not allowed",
    });
  });

  void it("surfaces OAuth errors from case-insensitive JSON content types", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return new Response(
          JSON.stringify({
            error: "invalid_request",
          }),
          {
            headers: {
              "content-type": "Application/JSON; charset=utf-8",
            },
            status: 400,
          },
        );
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot token exchange failed with 400 invalid_request",
    });
  });

  void it("surfaces OAuth errors from structured JSON content types", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return new Response(
          JSON.stringify({
            error: "temporarily_unavailable",
          }),
          {
            headers: {
              "content-type": "application/problem+json",
            },
            status: 503,
          },
        );
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot token exchange failed with 503 temporarily_unavailable",
    });
  });

  void it("reports invalid OAuth error bodies without cloning the response", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return new Response("<html>gateway error</html>", {
          headers: {
            "content-type": "application/json",
          },
          status: 502,
        });
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot token exchange failed with 502: invalid OAuth error body",
    });
  });

  void it("does not include non-JSON error bodies in failure messages", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return new Response("upstream body with sensitive details", {
          headers: {
            "content-type": "text/plain",
          },
          status: 502,
        });
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot token exchange failed with 502: non-JSON response",
    });
  });

  void it("rejects malformed cyspbot responses", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return Response.json(successfulTokenResponse({ access_token: undefined }));
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot response access_token is missing or invalid",
    });
  });

  void it("rejects token responses without a valid expires_in", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return Response.json(successfulTokenResponse({ expires_in: undefined }));
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot response expires_in is missing or invalid",
    });
  });

  void it("rejects token responses without the expected issued_token_type", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return Response.json(successfulTokenResponse({ issued_token_type: undefined }));
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot response issued_token_type is missing or invalid",
    });
  });

  void it("rejects token responses without a valid scope", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return Response.json(successfulTokenResponse({ scope: undefined }));
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot response scope is missing or invalid",
    });
  });

  void it("rejects token responses without a bearer token_type", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return Response.json(successfulTokenResponse({ token_type: undefined }));
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot response token_type is missing or invalid",
    });
  });

  void it("rejects array responses from cyspbot", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return Response.json([]);
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot returned a non-object response",
    });
  });
});
