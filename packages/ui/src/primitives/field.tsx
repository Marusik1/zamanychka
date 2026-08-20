import { useId } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

type FieldBaseProps = {
  error?: string;
  invalid?: boolean;
  label: string;
  multiline?: boolean;
};

type InputProps = FieldBaseProps & InputHTMLAttributes<HTMLInputElement>;
type TextareaProps = FieldBaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export type FieldProps = InputProps | TextareaProps;

export function Field({
  className,
  error,
  id,
  invalid = false,
  label,
  multiline = false,
  name,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? name ?? `ui-field-${generatedId.replace(/:/g, '')}`;
  const describedBy = error ? `${controlId}-error` : undefined;
  const controlClassName = [
    'ui-field__control',
    'ui-interactive-hover',
    'ui-focus-ring',
    invalid ? 'is-error' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className="ui-field">
      <span className="ui-field__label">{label}</span>
      {multiline ? (
        <textarea
          {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          id={controlId}
          name={name}
          className={controlClassName}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={describedBy}
        />
      ) : (
        <input
          {...(props as InputHTMLAttributes<HTMLInputElement>)}
          id={controlId}
          name={name}
          className={controlClassName}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={describedBy}
        />
      )}
      {error ? (
        <span className="ui-field__error" id={describedBy} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
