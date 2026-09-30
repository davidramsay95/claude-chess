import type { ChangeEvent, JSX } from "react";
import { useRef, useState } from "react";
import { exportGame, validateAndReplay, type GameRecord } from "../lib/gameRecord";

interface ImportExportPanelProps {
  record: GameRecord | null;
  onImport: (record: GameRecord) => void;
}

export function ImportExportPanel({ record, onImport }: ImportExportPanelProps): JSX.Element {
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function runImport(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("That isn't valid JSON.");
      return;
    }

    const result = validateAndReplay(parsed);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    setPasteText("");
    onImport(result.record);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then(runImport)
      .catch(() => setError("Could not read that file."));
    event.target.value = "";
  }

  function handleExportDownload(): void {
    if (!record) return;
    const json = JSON.stringify(exportGame(record), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "chess-game.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleCopy(): void {
    if (!record) return;
    const json = JSON.stringify(exportGame(record));
    navigator.clipboard
      .writeText(json)
      .then(() => {
        setCopyStatus("Copied!");
        setTimeout(() => setCopyStatus(null), 2000);
      })
      .catch(() => setCopyStatus("Could not copy — try downloading instead."));
  }

  return (
    <div className="import-export">
      <h3 className="import-export__heading">Export / Import</h3>

      <div className="import-export__row">
        <button type="button" onClick={handleExportDownload} disabled={!record}>
          Download game (.json)
        </button>
        <button type="button" onClick={handleCopy} disabled={!record}>
          Copy to clipboard
        </button>
        {copyStatus && <span className="import-export__status">{copyStatus}</span>}
      </div>

      <div className="import-export__row">
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          Import from file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </div>

      <div className="import-export__paste">
        <textarea
          placeholder="Or paste exported game JSON here"
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          rows={4}
        />
        <button type="button" onClick={() => runImport(pasteText)} disabled={pasteText.trim() === ""}>
          Import pasted JSON
        </button>
      </div>

      {error && (
        <p className="import-export__error" role="alert">
          Import failed: {error}
        </p>
      )}
    </div>
  );
}
