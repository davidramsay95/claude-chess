import type { ReactNode } from "react";

interface BoardFrameProps {
  className?: string;
  children: ReactNode;
}

/** The walnut surround with a fine brass inlay that seats the board on the page. */
export const BoardFrame = ({ className = "", children }: BoardFrameProps): React.JSX.Element => (
  <div
    className={`rounded-md bg-walnut p-[clamp(6px,1.6%,14px)] shadow-[0_28px_60px_rgba(0,0,0,0.5),inset_0_0_0_1px_var(--color-walnut-edge)] ${className}`}
  >
    <div className="ring-1 ring-brass/35 ring-offset-2 ring-offset-walnut">{children}</div>
  </div>
);
