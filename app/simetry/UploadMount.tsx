"use client";

import * as FileUpload from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";

// Versión simple (sin llamada al backend). Si ya tienes `Uploader.tsx` con `onUpload`,
// puedes usarlo en lugar de este componente.
export default function UploadMount() {
  const files = FileUpload.useFileUpload((s) => Array.from(s.files.keys()));

  return (
    <FileUpload.Root className="space-y-4" accept="image/*,video/*" multiple>
      <FileUpload.Dropzone className="h-40 w-full rounded-lg border-2 border-dashed flex items-center justify-center text-sm text-muted-foreground">
        Arrastra y suelta aquí, o haz clic para seleccionar
      </FileUpload.Dropzone>

      <FileUpload.Trigger asChild>
        <Button variant="secondary">Elegir archivos</Button>
      </FileUpload.Trigger>

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

      <FileUpload.Clear asChild forceMount>
        <Button variant="outline">Limpiar lista</Button>
      </FileUpload.Clear>
    </FileUpload.Root>
  );
}
