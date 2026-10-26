import type { View } from '../../state/uiStore';
import type { IconName } from '../../ui/components/Icon';

export const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: 'timer', label: 'Timer', icon: 'timer' },
  { id: 'tasks', label: 'Tasks', icon: 'list' },
  { id: 'stats', label: 'Stats', icon: 'chart' },
  { id: 'garden', label: 'Garden', icon: 'leaf' },
];

/** Desktop: two columns. Short landscape (phones on their side): side rail. Otherwise: bottom bar. */
export const WIDE_QUERY = '(min-width: 1024px)';
export const SHORT_LANDSCAPE_QUERY = '(orientation: landscape) and (max-height: 540px)';
