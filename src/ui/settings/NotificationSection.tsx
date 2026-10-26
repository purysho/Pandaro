import { isNative, notifications } from '../../platform';
import { useUi } from '../../state/uiStore';
import { Section, Toggle, useSetting } from './controls';
import { useSettings } from '../../state/settingsStore';

export function NotificationSection() {
  const on = useSettings((x) => x.settings.notifications);
  const set = useSetting();
  const toast = useUi((x) => x.toast);
  async function change(next: boolean) {
    if (!next) return set({ notifications: false });
    const port = await notifications();
    const state = await port.request();
    if (state === 'granted') {
      set({ notifications: true });
    } else if (state === 'unsupported') {
      toast('Notifications aren’t supported here. The chime still plays while Pandaro is open.');
    } else {
      toast(
        'Notifications are blocked. Allow them for Pandaro in your browser or system settings, then try again.',
      );
    }
  }
  return (
    <Section title="Notifications">
      <Toggle
        label="Notify me when a session ends"
        description={
          isNative
            ? 'Works even when Pandaro is in the background. Delivery can be delayed by a few minutes by battery saving.'
            : 'Works while Pandaro is open in a tab, including background tabs. Browsers can’t notify after the tab is closed.'
        }
        checked={on}
        onChange={(v) => void change(v)}
      />
    </Section>
  );
}
