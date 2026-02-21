'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Note, CreateNoteInput } from '@/types/note';
import { NOTE_TAKERS, NoteTaker } from '@/lib/noteTakers';

interface NoteFormProps {
  initialData?: Partial<Note>;
  noteId?: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const w = window as WindowWithSpeechRecognition;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export default function NoteForm({ initialData, noteId }: NoteFormProps) {
  const router = useRouter();
  const isEdit = !!noteId;

  const [title, setTitle] = useState(initialData?.title ?? '');
  const [content, setContent] = useState(initialData?.content ?? '');
  const [noteTaker, setNoteTaker] = useState<NoteTaker | ''>(initialData?.noteTaker ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const SR = getSpeechRecognitionCtor();
    setSpeechSupported(!!SR);
  }, []);

  const toggleRecording = useCallback(() => {
    const SR = getSpeechRecognitionCtor();
    if (!SR) return;

    if (recording) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((r) => r.isFinal)
        .map((r) => r[0]?.transcript ?? '')
        .filter(Boolean)
        .join(' ');
      if (transcript) {
        setContent((prev) => (prev ? prev + ' ' + transcript : transcript));
      }
    };

    recognition.onerror = () => {
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }, [recording]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (!title.trim() && !content.trim()) {
        setError('Please fill in at least a title or some notes.');
        return;
      }

      if (recording) {
        recognitionRef.current?.stop();
      }

      setSaving(true);
      const body: CreateNoteInput = {
        title: title.trim(),
        content: content.trim(),
        tags: [],
        ...(noteTaker ? { noteTaker } : {}),
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
        setError(data.error ?? 'Failed to save note.');
        return;
      }

      const saved = await res.json();
      router.push(`/notes/${saved.id}`);
      router.refresh();
    },
    [title, content, noteTaker, recording, isEdit, noteId, router]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* Title */}
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

      {/* Notes + voice dictation */}
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
        {speechSupported && (
          <button
            type="button"
            onClick={toggleRecording}
            aria-label={recording ? 'Stop recording' : 'Start voice dictation'}
            className={[
              'mt-2 flex w-full items-center justify-center gap-2 rounded-lg',
              'min-h-[48px] text-sm font-semibold transition-colors',
              recording
                ? 'animate-pulse bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300',
            ].join(' ')}
          >
            {recording ? (
              <>
                <MicOffIcon />
                Stop Recording
              </>
            ) : (
              <>
                <MicIcon />
                Dictate
              </>
            )}
          </button>
        )}
      </div>

      <div>
        <label className="label" htmlFor="noteTaker">Note Taker</label>
        <select
          id="noteTaker"
          className="input"
          value={noteTaker}
          onChange={(e) => setNoteTaker(e.target.value as NoteTaker | '')}
          suppressHydrationWarning
        >
          <option value="">General note</option>
          {NOTE_TAKERS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
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
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
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
      <rect x="9" y="2" width="6" height="10" rx="3" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}
