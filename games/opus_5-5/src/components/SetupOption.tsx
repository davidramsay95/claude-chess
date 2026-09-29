import type { ReactNode } from "react";

const OPTION_CARD =
  "relative flex cursor-pointer rounded-lg border border-ink-line bg-ink p-3 transition-colors hover:border-brass/50 has-checked:border-brass has-checked:bg-brass/10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brass-bright";

interface SetupOptionProps {
  name: string;
  value: string;
  label: string;
  description?: string;
  defaultChecked: boolean;
  className: string;
  children?: ReactNode;
}

/** A radio button styled as a card; the description is announced separately from the name. */
export const SetupOption = ({
  name,
  value,
  label,
  description,
  defaultChecked,
  className,
  children,
}: SetupOptionProps): React.JSX.Element => {
  const labelId = `${name}-${value}-label`;
  const descriptionId = `${name}-${value}-description`;
  return (
    <label className={`${OPTION_CARD} ${className}`}>
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        className="sr-only"
      />
      {children}
      <span id={labelId} className="font-medium text-parchment">
        {label}
      </span>
      {description && (
        <span id={descriptionId} className="text-sm text-muted">
          {description}
        </span>
      )}
    </label>
  );
};
