const CheckBox = ({
  name,
  checked,
  setChecked,
  label,
  disabled = false,
}: {
  name: string;
  checked: boolean;
  setChecked: (checked: boolean) => void;
  label: string;
  disabled: boolean;
}) => (
  <>
    <input
      className="checkbox checkbox-primary"
      id={name}
      disabled={disabled}
      type="checkbox"
      checked={checked}
      onChange={e => setChecked(e.currentTarget.checked)}
    />
    <label htmlFor={name} className="cursor-pointer select-none">
      {label}
    </label>
  </>
);

export default CheckBox;
