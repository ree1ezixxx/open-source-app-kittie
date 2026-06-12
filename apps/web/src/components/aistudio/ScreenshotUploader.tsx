import { useRef, useState } from "react";
import type { UploadedImage } from "../../lib/aiService";
import { fileToDataUrl } from "./util";
import { validateUploadFile, MAX_FILE_SIZE, FILE_SIZE_WARN, type ValidationError } from "./validation";
import { IconUpload } from "./icons";
import { IconClose } from "../../icons";

/**
 * Shared screenshot uploader: drag-drop or browse, base64 previews, removable.
 * Built once here so other AI-Studio flows can reuse it.
 */
export function ScreenshotUploader({
  images,
  onChange,
  max = 8,
}: {
  images: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  async function ingest(files: FileList | null) {
    if (!files) return;
    const room = Math.max(0, max - images.length);
    const picked = Array.from(files).slice(0, room);
    const newErrors: ValidationError[] = [];
    const added: UploadedImage[] = [];

    for (const f of picked) {
      const err = validateUploadFile(f);
      if (err) {
        newErrors.push(err);
        continue;
      }
      try {
        const dataUrl = await fileToDataUrl(f);
        added.push({ id: `up-${Date.now()}-${added.length}`, name: f.name, dataUrl });
      } catch (e) {
        newErrors.push({
          code: "read-error",
          message: `Could not read ${f.name}`,
          details: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    if (newErrors.length > 0) {
      setErrors(newErrors);
    } else {
      setErrors([]);
    }

    if (added.length) onChange([...images, ...added]);
  }

  return (
    <div>
      <div
        className={`studio-drop${drag ? " drag" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void ingest(e.dataTransfer.files);
        }}
      >
        <IconUpload />
        <div className="t">Drop screenshots or click to browse</div>
        <div className="s">PNG, JPG, or WebP · up to {max} frames · {images.length}/{max} added</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => {
            void ingest(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {errors.length > 0 && (
        <div className="notice warn" style={{ marginTop: 12 }}>
          <span>
            {errors.length === 1 ? errors[0]!.message : `${errors.length} files couldn't be added`}
            {errors[0]!.details && ` — ${errors[0]!.details}`}
          </span>
        </div>
      )}

      {images.length > 0 && (
        <div className="studio-thumbs">
          {images.map((img) => (
            <div className="studio-thumb" key={img.id} title={img.name}>
              <img src={img.dataUrl} alt={img.name} />
              <button
                className="studio-thumb-x"
                aria-label={`Remove ${img.name}`}
                onClick={() => onChange(images.filter((i) => i.id !== img.id))}
              >
                <IconClose />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
