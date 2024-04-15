const CheckBox = ({
  name,
  checked,
  setChecked,
  label,
}: {
  name: string;
  checked: boolean;
  setChecked: (checked: boolean) => void;
  label: string;
}) => (
  <>
    <input
      className="checkbox checkbox-primary"
      id={name}
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
