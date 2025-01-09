import { ReactNode } from 'react';

const CheckBox = ({
  name,
  checked,
  setChecked,
  children,
  disabled = false,
}: {
  name: string;
  checked: boolean;
  setChecked: (checked: boolean) => void;
  children: ReactNode;
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
    <label htmlFor={name} className="cursor-pointer select-none flex flex-row gap-2">
      {children}
    </label>
  </>
);

export default CheckBox;
