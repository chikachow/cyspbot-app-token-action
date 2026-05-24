import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { runAction, type ActionDependencies } from "../src/action.ts";

interface MockedDependencies {
  createTimeoutSignalMock: ReturnType<typeof mock.fn>;
  dependencies: ActionDependencies;
  fetchMock: ReturnType<typeof mock.fn>;
  getIDTokenMock: ReturnType<typeof mock.fn>;
  getInputMock: ReturnType<typeof mock.fn>;
  nowMock: ReturnType<typeof mock.fn>;
  setOutputMock: ReturnType<typeof mock.fn>;
  setSecretMock: ReturnType<typeof mock.fn>;
}

function createDependencies(overrides?: Partial<ActionDependencies>): MockedDependencies {
  const now = new Date("2030-01-01T00:00:00Z");
  const timeoutSignal = AbortSignal.abort("timeout");
  const createTimeoutSignalMock = mock.fn<ActionDependencies["createTimeoutSignal"]>(
    (timeoutMs: number) => {
      assert.equal(timeoutMs, 10_000);
      return timeoutSignal;
    },
  );
  const fetchMock = mock.fn<ActionDependencies["fetch"]>();
  const getIDTokenMock = mock.fn<ActionDependencies["getIDToken"]>(async () => "oidc-token");
  const getInputMock = mock.fn<ActionDependencies["getInput"]>((name: string) => {
    if (name === "audience") {
      return "cyspbot";
    }

    if (name === "cyspbot-url") {
      return "https://cyspbot.chikachow.org";
    }

    return "";
  });
  const setOutputMock = mock.fn<ActionDependencies["setOutput"]>();
  const setSecretMock = mock.fn<ActionDependencies["setSecret"]>();
  const nowMock = mock.fn<ActionDependencies["now"]>(() => now);

  return {
    dependencies: {
      createTimeoutSignal: createTimeoutSignalMock,
      fetch: fetchMock,
      getIDToken: getIDTokenMock,
      getInput: getInputMock,
      now: nowMock,
      setOutput: setOutputMock,
      setSecret: setSecretMock,
      ...overrides,
    },
    createTimeoutSignalMock,
    fetchMock,
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
      assert.equal(init?.signal?.aborted, true);

      const body = new URLSearchParams(init?.body as string);
      assert.deepEqual(Object.fromEntries(body), {
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        requested_token_type: "urn:chikachow:github-app-installation-access-token",
        subject_token: "oidc-token",
        subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      });

      return Response.json({
        access_token: "ghs_token",
        expires_in: 3600,
        issued_token_type: "urn:chikachow:github-app-installation-access-token",
        token_type: "Bearer",
      });
    };

    const { createTimeoutSignalMock, dependencies, getIDTokenMock, setOutputMock, setSecretMock } =
      createDependencies({ fetch: mock.fn(fetchImplementation) });

    await runAction(dependencies);

    assert.equal(createTimeoutSignalMock.mock.calls.length, 1);
    assert.deepEqual(getIDTokenMock.mock.calls[0]?.arguments, ["cyspbot"]);
    assert.deepEqual(setSecretMock.mock.calls[0]?.arguments, ["ghs_token"]);
    assert.equal(setOutputMock.mock.calls.length, 2);
    assert.deepEqual(setOutputMock.mock.calls[0]?.arguments, ["token", "ghs_token"]);
    assert.deepEqual(setOutputMock.mock.calls[1]?.arguments, [
      "expires_at",
      "2030-01-01T01:00:00.000Z",
    ]);
  });

  void it("uses default values when inputs are blank", async () => {
    const { dependencies, getIDTokenMock } = createDependencies({
      fetch: mock.fn(async () => {
        return Response.json({
          access_token: "ghs_token",
          expires_in: 3600,
          issued_token_type: "urn:chikachow:github-app-installation-access-token",
          token_type: "Bearer",
        });
      }),
      getInput: mock.fn(() => "   "),
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

  void it("rejects malformed cyspbot responses", async () => {
    const { dependencies } = createDependencies({
      fetch: mock.fn(async () => {
        return Response.json({
          expires_in: 3600,
          issued_token_type: "urn:chikachow:github-app-installation-access-token",
          token_type: "Bearer",
        });
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot response access_token is missing or invalid",
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

  void it("rejects non-https cyspbot urls before requesting an OIDC token", async () => {
    const { dependencies, fetchMock, getIDTokenMock } = createDependencies({
      getInput: mock.fn((name: string) => {
        if (name === "audience") {
          return "cyspbot";
        }

        if (name === "cyspbot-url") {
          return "http://cyspbot.chikachow.org";
        }

        return "";
      }),
    });

    await assert.rejects(runAction(dependencies), {
      message: "cyspbot-url must use https",
    });
    assert.equal(getIDTokenMock.mock.calls.length, 0);
    assert.equal(fetchMock.mock.calls.length, 0);
  });
});
