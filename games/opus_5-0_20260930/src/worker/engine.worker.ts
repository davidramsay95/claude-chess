/// <reference lib="webworker" />

import { answer, type ThinkRequest } from "./protocol.ts";
import { think } from "./think.ts";

self.addEventListener("message", (event: MessageEvent<ThinkRequest>) => {
  const request = event.data;
  if (!request || request.type !== "think") return;
  void answer(request, think).then((response) => {
    // In a module worker `self` is typed as Window until the worker lib narrows it.
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
  });
});
