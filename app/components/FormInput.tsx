interface FormInputProps {
  label: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  type?: string;
  readOnly?: boolean;
  id?: string;
  autoComplete?: string;
}

export default function FormInput({
  label,
  required = false,
  placeholder = '',
  value = '',
  onChange,
  type = 'text',
  readOnly = false,
  id,
  autoComplete,
}: FormInputProps) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
        {required && <span className="required">*</span>}
      </label>
      <input
        id={id}
        type={type}
        className={`form-input ${readOnly ? 'readonly' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        autoComplete={autoComplete}
      />
    </div>
  );
}