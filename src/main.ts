import * as core from "@actions/core";

import { runAction } from "./action.js";

void runAction().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
