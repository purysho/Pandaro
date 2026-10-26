import { useState, useSyncExternalStore } from 'react';
import { canInstall, onInstallChange, promptInstall } from '../../app/pwa';
import { isNative } from '../../platform';
import { useUi } from '../../state/uiStore';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Section } from './controls';

function InstallHint() {
  const installable = useSyncExternalStore(onInstallChange, canInstall, () => false);
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  if (isNative || standalone) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (installable) {
    return (
      <button
        type="button"
        className="btn btn-ghost self-start"
        onClick={() => void promptInstall()}
      >
        <Icon name="download" size={18} /> Install Pandaro as an app
      </button>
    );
  }
  return (
    <p className="text-sm text-muted">
      {ios
        ? 'To install on iPhone or iPad: open Pandaro in Safari, tap Share, then “Add to Home Screen”.'
        : 'You can install Pandaro from your browser’s menu (“Install app” or “Add to Home screen”) to use it like a regular app, even offline.'}
    </p>
  );
}

function Notices() {
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost self-start"
        onClick={() => {
          setOpen(true);
          if (text === null) {
            void fetch(`${import.meta.env.BASE_URL}third-party-notices.txt`)
              .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
              .then(setText)
              .catch(() =>
                setText(
                  'The licence list could not be loaded. It is in THIRD_PARTY_NOTICES.md in the source code.',
                ),
              );
          }
        }}
      >
        Open-source licences
      </button>
      <Modal open={open} title="Open-source licences" onClose={() => setOpen(false)} wide>
        <pre className="text-xs whitespace-pre-wrap text-muted">{text ?? 'Loading…'}</pre>
      </Modal>
    </>
  );
}

export function AboutSection() {
  const openSheet = useUi((s) => s.openSheet);
  return (
    <Section title="About">
      <InstallHint />
      <p className="text-sm text-muted">
        Pandaro {__APP_VERSION__}. No account, no ads, no tracking. Your data never leaves this
        device unless you export it.
      </p>
      <button
        type="button"
        className="btn btn-ghost self-start"
        onClick={() => openSheet('shortcuts')}
      >
        <Icon name="keyboard" size={18} /> Keyboard shortcuts
      </button>
      <Notices />
    </Section>
  );
}
