import { ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

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
    <Checkbox
      id={name}
      disabled={disabled}
      checked={checked}
      onCheckedChange={(checked) => setChecked(checked === true)}
    />
    <label htmlFor={name} className="cursor-pointer select-none flex flex-row gap-2">
      {children}
    </label>
  </>
);

export default CheckBox;
