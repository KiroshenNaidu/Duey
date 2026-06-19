import { registerPlugin } from '@capacitor/core';

export interface FolderAccessPlugin {
  /** Launches the system folder picker (internal / SD card / USB). Rejects with "cancelled" if dismissed. */
  pickFolder(): Promise<{ uri: string; name: string }>;
  /** Writes a base64 blob into the chosen folder, overwriting any same-named file. */
  saveFile(options: { folderUri: string; name: string; mimeType: string; data: string }): Promise<{ uri: string }>;
  /** Verifies the persisted grant for a saved folder URI is still valid. */
  checkFolder(options: { folderUri: string }): Promise<{ valid: boolean; name: string }>;
}

export const FolderAccess = registerPlugin<FolderAccessPlugin>('FolderAccess');
