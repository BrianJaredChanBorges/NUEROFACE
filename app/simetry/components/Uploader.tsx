// app/simetry/components/Uploader.tsx
"use client";

import * as React from "react";
import * as FileUpload from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";

type UploadHandlers = {
  onProgress: (file: File, pct: number) => void;
  onSuccess: (file: File) => void;
  onError: (file: File, err: Error) => void;
};

async function uploadSingleFileXHR(
  file: File,
  { onProgress, onSuccess, onError }: UploadHandlers
) {
  return new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(file, pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onSuccess(file);
      } else {
        onError(file, new Error(`Upload failed (${xhr.status})`));
      }
      resolve();
    };

    xhr.onerror = () => {
      onError(file, new Error("Network error"));
      resolve();
    };

    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export type UploaderProps = {
  onFiles?: (files: File[]) => Promise<void> | void;
  accept?: string;
  maxSize?: number;
  multiple?: boolean;
};

const FilesList: React.FC = () => {
  // Este hook YA se ejecuta dentro del provider porque FilesList se
  // renderiza dentro de <FileUpload.Root> en el JSX abajo.
  const files = FileUpload.useFileUpload((s) => Array.from(s.files.keys()));

  return (
    <FileUpload.List className="space-y-2">
      {files.map((file) => (
        <FileUpload.Item key={file.name} value={file} className="p-3 gap-3">
          <FileUpload.ItemPreview />
          <FileUpload.ItemMetadata />
          <FileUpload.ItemProgress />
          <FileUpload.ItemDelete asChild>
            <Button variant="destructive" size="sm" className="ml-auto">
              Eliminar
            </Button>
          </FileUpload.ItemDelete>
        </FileUpload.Item>
      ))}
    </FileUpload.List>
  );
};

const Uploader: React.FC<UploaderProps> = ({
  onFiles,
  accept = "image/*,video/*",
  maxSize = 10 * 1024 * 1024,
  multiple = true,
}) => {
  return (
    <FileUpload.Root
      className="space-y-4"
      label="Subir archivos"
      accept={accept}
      multiple={multiple}
      maxSize={maxSize}
      onUpload={async (acceptedFiles: any[], { onProgress, onSuccess, onError }: UploadHandlers) => {
        if (onFiles) {
          try {
            const plainFiles: File[] = acceptedFiles.map((f: any) => {
              if (f instanceof File) return f;
              if (f.file instanceof File) return f.file;
              return f;
            });
            await Promise.resolve(onFiles(plainFiles));
            for (const f of plainFiles) onSuccess(f);
          } catch (err: any) {
            for (const f of acceptedFiles) onError(f, err);
            console.error("onFiles callback falló:", err);
          }
        } else {
          await Promise.all(
            acceptedFiles.map((file: any) =>
              uploadSingleFileXHR(file instanceof File ? file : file.file ?? file, { onProgress, onSuccess, onError })
            )
          );
        }
      }}
      onFileReject={(file: any, message: string) => {
        console.warn("Rechazado:", (file as any)?.name ?? file, message);
      }}
    >
      {/* Zona de drop / click */}
      <FileUpload.Dropzone className="h-40 w-full rounded-lg border-2 border-dashed flex items-center justify-center text-sm text-muted-foreground">
        Arrastra y suelta aquí, o haz clic para seleccionar
      </FileUpload.Dropzone>

      {/* Disparador opcional (botón) */}
      <FileUpload.Trigger asChild>
        <Button variant="secondary">Elegir archivos</Button>
      </FileUpload.Trigger>

      {/* Lista de archivos -> usa el hook dentro del provider */}
      <FilesList />

      {/* Limpiar todo */}
      <FileUpload.Clear asChild forceMount>
        <Button variant="outline">Limpiar lista</Button>
      </FileUpload.Clear>
    </FileUpload.Root>
  );
};

export default Uploader;
