import { Icon, type IconName } from '../components/Icon';

export function Tile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-3.5">
      <dt className="flex items-center gap-1.5 text-sm text-muted">
        <Icon name={icon} size={16} />
        {label}
      </dt>
      <dd className="tabular font-display text-2xl font-bold">{value}</dd>
    </div>
  );
}

export function Outcome({ label, value, shape }: { label: string; value: number; shape: string }) {
  return (
    <li className="rounded-xl bg-surface px-2 py-2">
      <span aria-hidden="true" className="text-focus">
        {shape}
      </span>
      <span className="block tabular font-display text-xl font-bold">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </li>
  );
}
