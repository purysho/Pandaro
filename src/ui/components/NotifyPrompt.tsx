import { useEffect, useState } from 'react';
import { KEYS, readFlag, writeFlag } from '../../persistence/storage';
import { notifications } from '../../platform';
import { useHistory } from '../../state/historyStore';
import { useSettings } from '../../state/settingsStore';
import { Icon } from './Icon';

const ASKED = 'pandaro.notifyAsked';

/**
 * Offers notifications once, right after the first completed focus session, when the value is
 * obvious. Never shown again after "Not now" or once permission was decided.
 */
export function NotifyPrompt() {
  const enabled = useSettings((s) => s.settings.notifications);
  const update = useSettings((s) => s.update);
  const completed = useHistory((s) =>
    s.sessions.some((x) => x.kind === 'focus' && x.outcome === 'completed'),
  );
  const [asked, setAsked] = useState(() => readFlag(ASKED) || !readFlag(KEYS.onboarded));
  const [promptable, setPromptable] = useState(false);

  useEffect(() => {
    if (enabled || asked || !completed) return;
    let cancelled = false;
    void notifications()
      .then((port) => port.permission())
      .then((state) => {
        if (!cancelled) setPromptable(state === 'prompt' || state === 'granted');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, asked, completed]);

  if (enabled || asked || !completed || !promptable) return null;

  const dismiss = () => {
    writeFlag(ASKED, true);
    setAsked(true);
  };

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-line px-4 py-2.5 text-sm"
    >
      <Icon name="bell" size={20} />
      <p className="flex-1">Want a gentle notification when a session ends?</p>
      <button
        type="button"
        className="btn btn-primary min-h-9 px-3 text-sm"
        onClick={() => {
          void notifications()
            .then((port) => port.request())
            .then((state) => {
              if (state === 'granted') update({ notifications: true });
              dismiss();
            });
        }}
      >
        Turn on
      </button>
      <button type="button" className="btn min-h-9 px-2 text-sm text-muted" onClick={dismiss}>
        Not now
      </button>
    </div>
  );
}
