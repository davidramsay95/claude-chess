const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-bright";

export const PRIMARY_BUTTON = `rounded-md bg-brass px-4 py-2.5 font-medium text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-colors hover:bg-brass-bright disabled:opacity-40 ${FOCUS_RING}`;

export const SECONDARY_BUTTON = `rounded-md border border-ink-line bg-ink px-3 py-2 text-sm text-parchment transition-colors hover:border-brass/60 hover:text-brass-bright disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-line disabled:hover:text-parchment ${FOCUS_RING}`;
