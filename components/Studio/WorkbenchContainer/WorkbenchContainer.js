"use client";

import { useStore } from "@nanostores/react";
import {
  $actions,
  $currentStreamingFile,
  areAllActionsComplete,
} from "../../../stores/workbench";
import Workbench from "../Workbench/Workbench";

/**
 * WorkbenchContainer - Connects Workbench to nanostores
 * Uses Chef-style persistent state management
 */
export default function WorkbenchContainer({ title, onFileClick }) {
  // Subscribe to actions store
  const actionsMap = useStore($actions);
  const currentStreamingFile = useStore($currentStreamingFile);

  // Convert actions map to array sorted by creation time
  // Keep status as-is - Workbench handles "running", "pending", "complete"
  const actions = Object.values(actionsMap)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((action) => ({
      id: action.id,
      file: action.path,
      status: action.status,
      isEdit: action.isEdit,
    }));

  // Check if all actions are complete
  const allComplete =
    actions.length > 0 &&
    actions.every((a) => a.status === "complete" || a.status === "completed");

  return (
    <Workbench
      title={title}
      actions={actions}
      allComplete={allComplete}
      onFileClick={onFileClick}
    />
  );
}
