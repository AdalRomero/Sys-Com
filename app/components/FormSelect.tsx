interface FormSelectProps {
  label: string;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  id?: string;
}

export default function FormSelect({
  label,
  required = false,
  value = '',
  onChange,
  options,
  placeholder = 'Seleccione...',
  id,
}: FormSelectProps) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
        {required && <span className="required">*</span>}
      </label>
      <select
        id={id}
        className="form-select"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      >
        <option value="" disabled hidden>{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
