/** Stream upload service for transferring models to backend. */

import * as FileSystem from "expo-file-system";
import { API_BASE_URL } from "../../lib/api";

export interface UploadProgressCallback {
  (progress: UploadProgress): void;
}

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
}

export interface UploadResult {
  success: boolean;
  filename?: string;
  sizeBytes?: number;
  path?: string;
  error?: string;
}

export class StreamUploadService {
  private activeUploads: Map<string, {
    abortController: AbortController;
    progressCallback: UploadProgressCallback;
  }> = new Map();

  /** Upload a GGUF model file to the backend */
  async uploadModel(
    filePath: string,
    fileName: string,
    progressCallback?: UploadProgressCallback,
  ): Promise<UploadResult> {
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const abortController = new AbortController();

    this.activeUploads.set(uploadId, {
      abortController,
      progressCallback: progressCallback || (() => {}),
    });

    try {
      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        throw new Error("File not found");
      }

      const totalBytes = "size" in fileInfo ? fileInfo.size : 0;

      // Read file as base64 in chunks (for large files, we might need a different approach)
      // For now, use uploadAsync which handles streaming
      const uploadUrl = `${API_BASE_URL}/api/models/upload`;

      // Create form data
      const formData = new FormData();
      formData.append("file", {
        uri: filePath,
        name: fileName,
        type: "application/octet-stream",
      } as any);

      // Use fetch with progress tracking via a custom implementation
      // Since expo-file-system doesn't have built-in upload progress,
      // we'll use a simple approach for now
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        headers: {
          // Don't set Content-Type - let fetch set it with boundary
        },
        signal: abortController.signal,
      });

      this.activeUploads.delete(uploadId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || `Upload failed: ${response.status}`,
        );
      }

      const result = await response.json();

      // Report 100% progress
      progressCallback?.({
        uploadedBytes: totalBytes,
        totalBytes,
        percentage: 100,
      });

      return {
        success: true,
        filename: result.filename,
        sizeBytes: result.size_bytes,
        path: result.path,
      };
    } catch (error) {
      this.activeUploads.delete(uploadId);

      if (error instanceof Error && error.name === "AbortError") {
        return { success: false, error: "Upload cancelled" };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  }

  /** Cancel an active upload */
  cancelUpload(uploadId: string): void {
    const entry = this.activeUploads.get(uploadId);
    if (entry) {
      entry.abortController.abort();
      this.activeUploads.delete(uploadId);
    }
  }

  /** Cancel all active uploads */
  cancelAllUploads(): void {
    this.activeUploads.forEach((entry) => {
      entry.abortController.abort();
    });
    this.activeUploads.clear();
  }

  /** Check if an upload is in progress */
  isUploading(uploadId: string): boolean {
    return this.activeUploads.has(uploadId);
  }
}

// Singleton instance
export const uploadService = new StreamUploadService();