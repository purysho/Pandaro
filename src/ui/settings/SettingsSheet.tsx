import { useUi } from '../../state/uiStore';
import { Modal } from '../components/Modal';
import { AboutSection } from './AboutSection';
import { DataSection } from './DataSection';
import { DisplaySection } from './DisplaySection';
import { NotificationSection } from './NotificationSection';
import { BehaviourSection } from './SessionsSection';
import { SoundSection } from './SoundSection';
import { TimerSection } from './TimerSection';

export function SettingsSheet() {
  const open = useUi((s) => s.sheet === 'settings');
  const openSheet = useUi((s) => s.openSheet);
  return (
    <Modal open={open} title="Settings" onClose={() => openSheet(null)} variant="sheet" wide>
      <div className="flex flex-col gap-6">
        <TimerSection />
        <BehaviourSection />
        <SoundSection />
        <NotificationSection />
        <DisplaySection />
        <DataSection />
        <AboutSection />
      </div>
    </Modal>
  );
}
