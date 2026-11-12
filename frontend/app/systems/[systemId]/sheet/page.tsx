'use client';

import { useParams } from 'next/navigation';
import { SystemSheetEditorPage } from '../../../../src/features/system-creation/system-sheet-editor-page';

export default function SystemSheetPage() {
  const params=useParams<{systemId:string}>();
  return <SystemSheetEditorPage systemId={params.systemId}/>;
}
