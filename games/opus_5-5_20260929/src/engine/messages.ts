import type { SearchRequest, SearchResult } from "./search";

/** Posted by the page to the engine worker. */
export interface EngineRequestMessage {
  id: number;
  request: SearchRequest;
}

/** Posted back by the worker when a search finishes. */
export interface EngineResultMessage {
  id: number;
  result: SearchResult;
}

/** Posted back by the worker when a search throws. */
export interface EngineErrorMessage {
  id: number;
  error: string;
}

export type EngineResponseMessage = EngineResultMessage | EngineErrorMessage;
