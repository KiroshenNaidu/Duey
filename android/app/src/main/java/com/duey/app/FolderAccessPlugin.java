package com.duey.app;

import android.app.Activity;
import android.content.Intent;
import android.content.UriPermission;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/**
 * FolderAccess — Storage Access Framework wrapper.
 *
 * Uses ACTION_OPEN_DOCUMENT_TREE so the user picks a real folder (the system
 * picker lists internal storage, SD card and USB automatically). The grant is
 * persisted across reboots via takePersistableUriPermission, so we only ask once.
 */
@CapacitorPlugin(name = "FolderAccess")
public class FolderAccessPlugin extends Plugin {

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderPickedResult");
    }

    @ActivityCallback
    private void folderPickedResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("cancelled");
            return;
        }
        final int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
        try {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
        } catch (Exception e) {
            // Non-fatal — the URI may still work for this session.
        }
        DocumentFile dir = DocumentFile.fromTreeUri(getContext(), treeUri);
        JSObject ret = new JSObject();
        ret.put("uri", treeUri.toString());
        ret.put("name", dir != null && dir.getName() != null ? dir.getName() : "");
        call.resolve(ret);
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String folderUri = call.getString("folderUri");
        String name = call.getString("name");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String data = call.getString("data");

        if (folderUri == null || name == null || data == null) {
            call.reject("missing-args");
            return;
        }

        try {
            Uri treeUri = Uri.parse(folderUri);
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (dir == null || !dir.canWrite()) {
                call.reject("no-access");
                return;
            }
            // Overwrite an existing file of the same name to avoid "name (1)" copies.
            DocumentFile existing = dir.findFile(name);
            if (existing != null) {
                existing.delete();
            }
            DocumentFile file = dir.createFile(mimeType, name);
            if (file == null) {
                call.reject("create-failed");
                return;
            }
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            OutputStream os = getContext().getContentResolver().openOutputStream(file.getUri());
            if (os == null) {
                call.reject("stream-failed");
                return;
            }
            os.write(bytes);
            os.flush();
            os.close();

            JSObject ret = new JSObject();
            ret.put("uri", file.getUri().toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("write-failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openFile(PluginCall call) {
        String fileUri = call.getString("fileUri");
        String mimeType = call.getString("mimeType", "*/*");
        if (fileUri == null) {
            call.reject("missing-args");
            return;
        }
        try {
            Uri uri = Uri.parse(fileUri);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("open-failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkFolder(PluginCall call) {
        String folderUri = call.getString("folderUri");
        JSObject ret = new JSObject();
        if (folderUri == null) {
            ret.put("valid", false);
            ret.put("name", "");
            call.resolve(ret);
            return;
        }
        boolean valid = false;
        String name = "";
        try {
            Uri treeUri = Uri.parse(folderUri);
            for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
                if (p.getUri().equals(treeUri) && p.isWritePermission()) {
                    valid = true;
                    break;
                }
            }
            if (valid) {
                DocumentFile dir = DocumentFile.fromTreeUri(getContext(), treeUri);
                if (dir != null && dir.getName() != null) {
                    name = dir.getName();
                }
            }
        } catch (Exception e) {
            valid = false;
        }
        ret.put("valid", valid);
        ret.put("name", name);
        call.resolve(ret);
    }
}
