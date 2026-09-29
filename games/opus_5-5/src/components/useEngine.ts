import { useCallback, useEffect, useRef } from "react";
import type { EngineClient } from "@/engine/engineClient";

/**
 * Owns one engine for the lifetime of the calling component. The engine is created on first use
 * because it spawns a Web Worker, which only exists in the browser, and it is terminated on unmount
 * so an abandoned search stops using the CPU.
 */
export const useEngine = (createEngine: () => EngineClient): (() => EngineClient) => {
  const engineRef = useRef<EngineClient | null>(null);

  useEffect(
    () => () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    },
    [],
  );

  return useCallback(() => {
    engineRef.current ??= createEngine();
    return engineRef.current;
  }, [createEngine]);
};
