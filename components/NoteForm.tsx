'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Note, CreateNoteInput, NotePhoto } from '@/types/note';
import { useVoiceRecognition } from '@/hooks/useVoiceRecognition';

interface NoteFormProps {
  initialData?: Partial<Note>;
  noteId?: string;
}

export default function NoteForm({ initialData, noteId }: NoteFormProps) {
  const router = useRouter();
  const isEdit = !!noteId;

  const [title, setTitle] = useState(initialData?.title ?? '');
  const [content, setContent] = useState(initialData?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<NotePhoto[]>(initialData?.photos ?? []);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const appendToNotes = useCallback((text: string) => {
    setContent((prev) => (prev ? prev + ' ' + text : text).trim());
  }, []);

  const { isRecording, isTranscribing, isSupported, elapsed, volumeLevel, start, stop } = useVoiceRecognition({
    onResult: (text) => {
      appendToNotes(text);
    },
    onError: (voiceError) => console.error('[voice]', voiceError),
  });

  const compressImage = useCallback(async (file: File, maxWidth = 1200, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = url;
    });
  }, []);

  const handlePhotoCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadingPhoto(true);
      setError('');

      try {
        const compressedDataUrl = await compressImage(file);

        const blob = await (await fetch(compressedDataUrl)).blob();
        const formData = new FormData();
        formData.append('image', blob, 'photo.jpg');

        const res = await fetch('/api/photos/upload', {
          method: 'POST',
          headers: {
            'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
          },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Failed to upload photo');
        }

        const { id, dataUrl } = await res.json();

        const newPhoto: NotePhoto = {
          id,
          dataUrl,
          createdAt: new Date().toISOString(),
        };

        setPhotos((prev) => [...prev, newPhoto]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload photo');
      } finally {
        setUploadingPhoto(false);
        if (e.target) {
          e.target.value = '';
        }
      }
    },
    [compressImage]
  );

  const removePhoto = useCallback((photoId: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (!title.trim() && !content.trim() && photos.length === 0) {
        setError('Please fill in at least a title, some notes, or add a photo.');
        return;
      }

      if (isRecording) {
        stop();
      }
      if (isTranscribing) {
        return;
      }

      setSaving(true);

      const body: CreateNoteInput = {
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(content.trim() ? { content: content.trim() } : {}),
        tags: [],
        photos,
      };

      const url = isEdit ? `/api/notes/${noteId}` : '/api/notes';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
        },
        body: JSON.stringify(body),
      });

      setSaving(false);

      if (!res.ok) {
        const data = await res.json();
        setError(typeof data.error === 'string' ? data.error : 'Failed to save note.');
        return;
      }

      const saved = await res.json();
      router.push(`/notes/${saved.id}`);
      router.refresh();
    },
    [title, content, photos, isRecording, isTranscribing, stop, isEdit, noteId, router]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <div>
        <label className="label" htmlFor="title">Title</label>
        <input
          id="title"
          className="input"
          type="text"
          placeholder="location, job#, floor, building"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          suppressHydrationWarning
        />
      </div>

      <div>
        <label className="label" htmlFor="content">Notes</label>
        <textarea
          id="content"
          className="input min-h-[160px] resize-y"
          placeholder="Description and materials used"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          suppressHydrationWarning
        />
        {isSupported ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={isRecording ? stop : start}
              disabled={isTranscribing}
              aria-label={isRecording ? 'Stop recording' : 'Start voice dictation'}
              className={[
                'flex w-full items-center justify-center gap-3 rounded-xl',
                'min-h-[64px] text-base font-bold transition-all shadow-sm',
                isRecording
                  ? 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 ring-2 ring-red-300'
                  : isTranscribing
                  ? 'bg-yellow-500 text-white cursor-wait'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
              ].join(' ')}
            >
              {isRecording ? (
                <>
                  <span className="relative flex h-5 w-5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-50" />
                    <span className="relative inline-flex rounded-full h-5 w-5 items-center justify-center">
                      <MicOffIcon />
                    </span>
                  </span>
                  <span>Stop Recording</span>
                  <span className="ml-1 tabular-nums font-mono text-sm opacity-90">
                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                  </span>
                </>
              ) : isTranscribing ? (
                <>
                  <SpinnerIcon />
                  <span>Transcribing...</span>
                </>
              ) : (
                <>
                  <MicIcon />
                  <span>Dictate Notes</span>
                </>
              )}
            </button>
            {isRecording && <AudioVisualizer volumeLevel={volumeLevel} />}
            {isTranscribing && (
              <p className="mt-1.5 text-xs text-center text-gray-500">
                Sending audio to Whisper for transcription...
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            Voice dictation not supported on this browser
          </p>
        )}
      </div>

      <div>
        <label className="label">Photos</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 min-h-[48px] text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <CameraIcon />
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 min-h-[48px] text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <ImageIcon />
            Choose from Library
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoCapture}
          className="hidden"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoCapture}
          className="hidden"
        />

        {photos.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700">
              {photos.length} {photos.length === 1 ? 'photo' : 'photos'} attached
            </p>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                <div key={photo.id} className="relative group">
                  <img
                    src={photo.dataUrl}
                    alt="Field photo"
                    className="w-full h-24 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {uploadingPhoto && (
          <p className="mt-2 text-sm text-gray-600">Uploading photo...</p>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary flex-1" disabled={saving} suppressHydrationWarning>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Note'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.back()} suppressHydrationWarning>
          Cancel
        </button>
      </div>
    </form>
  );
}

function MicIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="6" y="2" width="12" height="12" rx="6" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20"
      viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

const BAR_COUNT = 28;
const MIN_BAR_H = 3;
const MAX_BAR_H = 44;

function AudioVisualizer({ volumeLevel }: { volumeLevel: number }) {
  const seeds = useMemo(
    () => Array.from({ length: BAR_COUNT }, () => 0.3 + Math.random() * 0.7),
    [],
  );

  return (
    <div className="mt-3 rounded-lg bg-gray-900 px-4 py-3">
      <div
        className="flex items-center justify-center gap-[2px]"
        style={{ height: `${MAX_BAR_H + 8}px` }}
      >
        {seeds.map((seed, i) => {
          const envelope = Math.sin(((i + 0.5) / BAR_COUNT) * Math.PI);
          const h =
            MIN_BAR_H + (MAX_BAR_H - MIN_BAR_H) * volumeLevel * envelope * seed;
          return (
            <div
              key={i}
              className="w-[3px] rounded-full"
              style={{
                height: `${Math.round(h)}px`,
                backgroundColor:
                  volumeLevel > 0.05
                    ? `hsl(${130 + volumeLevel * 20}, 70%, ${45 + volumeLevel * 15}%)`
                    : '#4b5563',
                transition: 'height 80ms ease-out, background-color 120ms ease',
              }}
            />
          );
        })}
      </div>
      <p className="mt-2 text-xs text-center text-gray-400">
        {volumeLevel > 0.05 ? 'Hearing you...' : 'Listening — start speaking'}
      </p>
    </div>
  );
}
