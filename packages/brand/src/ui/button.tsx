import type { ButtonHTMLAttributes, Ref } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg" | "sm";

export function buttonClass(
  options: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {},
  extra?: string,
): string {
  return [
    "tmw-button",
    `tmw-button-${options.variant ?? "primary"}`,
    options.size === undefined || options.size === "md" ? "" : `tmw-button-${options.size}`,
    options.block === true ? "tmw-button-block" : "",
    extra ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant,
  size,
  block,
  loading = false,
  className,
  type = "button",
  disabled,
  children,
  ref,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={buttonClass(
        { ...(variant && { variant }), ...(size && { size }), ...(block && { block }) },
        className,
      )}
    >
      {loading ? <span className="tmw-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
