import { useEffect, useRef, useState, useCallback } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';

interface NoteEditorProps {
  tabId: string;
  initialContent: any[];
  onSave: (tabId: string, content: any[]) => void;
}

async function compressImage(file: File, maxWidth: number): Promise<File> {
  // Only compress actual images
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Don't upscale small images
      if (img.width <= maxWidth) {
        resolve(file);
        return;
      }

      const ratio = maxWidth / img.width;
      const canvas = document.createElement('canvas');
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * ratio);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(
            new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            })
          );
        },
        file.type,
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = url;
  });
}

export function NoteEditor({ tabId, initialContent, onSave }: NoteEditorProps) {
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTabIdRef = useRef(tabId);

  // Track tabId changes
  useEffect(() => {
    currentTabIdRef.current = tabId;
  }, [tabId]);

  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? initialContent : undefined,
    uploadFile: async (file: File) => {
      const compressed = await compressImage(file, 1920);
      const formData = new FormData();
      formData.append('image', compressed);

      const res = await fetch('/api/study-images', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to upload image');
      }

      const data = await res.json();
      return data.url;
    },
  });

  const handleChange = useCallback(() => {
    setSaveStatus('saving');

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const blocks = editor.document;
      onSave(currentTabIdRef.current, blocks);
      setSaveStatus('saved');
    }, 1000);
  }, [editor, onSave]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Save status indicator */}
      <div className="flex justify-end px-4 py-1">
        <span
          className={`text-xs font-medium ${
            saveStatus === 'saved'
              ? 'text-green-400'
              : saveStatus === 'saving'
              ? 'text-amber-400'
              : 'text-gray-500'
          }`}
        >
          {saveStatus === 'saved'
            ? 'Salvo'
            : saveStatus === 'saving'
            ? 'Salvando...'
            : ''}
        </span>
      </div>

      {/* BlockNote editor */}
      <div className="bn-container flex-1 min-h-[400px]">
        <BlockNoteView
          editor={editor}
          onChange={handleChange}
          theme="dark"
        />
      </div>
    </div>
  );
}
