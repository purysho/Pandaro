import { useRef, useState } from 'react';
import { parseBackup, previewImport, type ImportPreview } from '../../persistence/backup';
import type { Backup } from '../../persistence/schema';
import { deleteAllData, exportData, importData } from '../../state/dataOps';
import { useHistory } from '../../state/historyStore';
import { useUi } from '../../state/uiStore';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { Section } from './controls';

export function DataSection() {
  const sessions = useHistory((x) => x.sessions);
  const toast = useUi((x) => x.toast);
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: Backup; preview: ImportPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');

  async function onFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    const result = parseBackup(await f.text());
    if (!result.ok) return setError(result.error);
    setPending({ backup: result.backup, preview: previewImport(result.backup, sessions) });
  }

  async function apply(mode: 'merge' | 'replace') {
    if (!pending) return;
    try {
      const undo = await importData(pending.backup, mode);
      setPending(null);
      toast(
        mode === 'merge' ? 'Backup merged' : 'Data replaced from backup',
        { label: 'Undo', run: () => void undo() },
        10_000,
      );
    } catch {
      setError('The import could not be saved. Your existing data is unchanged.');
    }
  }

  return (
    <Section title="Your data">
      <p className="text-sm text-muted">
        Everything stays on this device. Export a backup to move it or keep it safe.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            void exportData()
              .then((how) => toast(how === 'saved' ? 'Backup downloaded' : 'Backup ready to save'))
              .catch(() => toast('Export failed. Try again.'))
          }
        >
          <Icon name="download" size={18} /> Export backup
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => file.current?.click()}>
          <Icon name="upload" size={18} /> Import backup
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose a backup file"
          tabIndex={-1}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {pending && (
        <div
          className="rounded-2xl border-[1.5px] border-line p-3 text-sm"
          role="region"
          aria-label="Import preview"
        >
          <p className="font-semibold">
            Backup from {new Date(pending.preview.exportedAt).toLocaleString()}
          </p>
          <p className="text-muted">
            {pending.preview.tasks} tasks, {pending.preview.sessions} sessions (
            {pending.preview.newSessions} new).
          </p>
          <p className="mt-2 text-muted">
            Merge adds what is missing and keeps your settings. Replace swaps all tasks, history and
            settings for the backup. You can undo either for a few seconds.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void apply('merge')}>
              Merge
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void apply('replace')}>
              Replace
            </button>
            <button type="button" className="btn" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="btn self-start text-danger"
        onClick={() => setConfirmDelete(true)}
      >
        <Icon name="trash" size={18} /> Delete all data
      </button>
      <Modal open={confirmDelete} title="Delete all data?" onClose={() => setConfirmDelete(false)}>
        <p className="text-muted">
          This removes every task, session, setting and your garden from this device. It can’t be
          undone. Export a backup first if you might want it later.
        </p>
        <label htmlFor="delete-confirm" className="mt-4 block text-sm font-semibold">
          Type DELETE to confirm
        </label>
        <input
          id="delete-confirm"
          className="field mt-1"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={typed.trim().toUpperCase() !== 'DELETE'}
            onClick={() => void deleteAllData().then(() => window.location.reload())}
          >
            Delete everything
          </button>
        </div>
      </Modal>
    </Section>
  );
}
