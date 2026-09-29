import { handleEngineRequest } from "./handleRequest";
import type { EngineRequest, EngineResponse } from "./protocol";

/** Always produces exactly one response, because the client waits on one reply per request id. */
const respond = (request: EngineRequest): EngineResponse => {
  try {
    return handleEngineRequest(request);
  } catch (error) {
    // handleEngineRequest reports its own failures; this only fires for a payload too malformed to read.
    return { id: request?.id ?? -1, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

addEventListener("message", (event: MessageEvent<EngineRequest>) => {
  postMessage(respond(event.data));
});
