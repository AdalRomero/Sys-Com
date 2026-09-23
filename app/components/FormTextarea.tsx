interface FormTextareaProps {
  label: string;
  required?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  rows?: number;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function FormTextarea({
  label,
  required = false,
  placeholder = '',
  value = '',
  onChange,
  rows = 4,
  id,
  className = '',
  style,
}: FormTextareaProps) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
        {required && <span className="required">*</span>}
      </label>
      <textarea
        id={id}
        className={`form-textarea ${className}`.trim()}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        rows={rows}
        style={style}
      />
    </div>
  );
}