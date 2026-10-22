import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

function useField(props: FieldProps, id: string | undefined, describedBy: string | undefined) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = props.hint === undefined ? undefined : `${controlId}-hint`;
  const errorId =
    props.error === undefined || props.error === null ? undefined : `${controlId}-error`;
  const described = [describedBy, hintId, errorId].filter(Boolean).join(" ");
  return {
    controlId,
    control: {
      id: controlId,
      "aria-describedby": described === "" ? undefined : described,
      "aria-invalid": errorId === undefined ? undefined : true,
    },
    wrap: (control: ReactNode) => (
      <div className="tmw-field" data-invalid={errorId === undefined ? undefined : ""}>
        <label className="tmw-label" htmlFor={controlId}>
          {props.label}
        </label>
        {control}
        {hintId === undefined ? null : (
          <p id={hintId} className="tmw-hint">
            {props.hint}
          </p>
        )}
        {errorId === undefined ? null : (
          <p id={errorId} className="tmw-error">
            {props.error}
          </p>
        )}
      </div>
    ),
  };
}

export function TextInput({
  label,
  hint,
  error,
  id,
  className,
  ref,
  ...rest
}: FieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "children"> & { ref?: Ref<HTMLInputElement> }) {
  const field = useField({ label, hint, error }, id, rest["aria-describedby"]);
  return field.wrap(
    <input
      {...rest}
      {...field.control}
      ref={ref}
      className={className === undefined ? "tmw-input" : `tmw-input ${className}`}
    />,
  );
}

export function TextArea({
  label,
  hint,
  error,
  id,
  className,
  ref,
  ...rest
}: FieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "children"> & {
    ref?: Ref<HTMLTextAreaElement>;
  }) {
  const field = useField({ label, hint, error }, id, rest["aria-describedby"]);
  return field.wrap(
    <textarea
      {...rest}
      {...field.control}
      ref={ref}
      className={
        className === undefined ? "tmw-input tmw-textarea" : `tmw-input tmw-textarea ${className}`
      }
    />,
  );
}

export function Select({
  label,
  hint,
  error,
  id,
  className,
  children,
  ref,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  const field = useField({ label, hint, error }, id, rest["aria-describedby"]);
  return field.wrap(
    <span className="tmw-select">
      <select
        {...rest}
        {...field.control}
        ref={ref}
        className={className === undefined ? "tmw-input" : `tmw-input ${className}`}
      >
        {children}
      </select>
    </span>,
  );
}

export function Checkbox({
  label,
  hint,
  className,
  id,
  ref,
  ...rest
}: Omit<FieldProps, "error"> &
  Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
    ref?: Ref<HTMLInputElement>;
  }) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = hint === undefined ? undefined : `${controlId}-hint`;
  const described = [rest["aria-describedby"], hintId].filter(Boolean).join(" ");
  return (
    <div className={className === undefined ? "tmw-check" : `tmw-check ${className}`}>
      <input
        {...rest}
        ref={ref}
        id={controlId}
        type="checkbox"
        className="tmw-check-box"
        aria-describedby={described === "" ? undefined : described}
      />
      <label className="tmw-check-label" htmlFor={controlId}>
        {label}
      </label>
      {hintId === undefined ? null : (
        <p id={hintId} className="tmw-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
