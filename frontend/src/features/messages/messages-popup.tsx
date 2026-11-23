'use client';

import { Modal } from '../shell/modal';
import { MessagesPanel } from './messages-panel';

export function MessagesPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title="Mensagens" className="messages-popup">
    <MessagesPanel />
  </Modal>;
}
