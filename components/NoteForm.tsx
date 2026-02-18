'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Note, CreateNoteInput } from '@/types/note';

interface NoteFormProps {
  initialData?: Partial<Note>;
  noteId?: string;
}

export default function NoteForm({ initialData, noteId }: NoteFormProps) {
  const router = useRouter();
  const isEdit = !!noteId;

  const [title, setTitle] = useState(initialData?.title ?? '');
  const [content, setContent] = useState(initialData?.content ?? '');
  const [location, setLocation] = useState(initialData?.location ?? '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState('');

  const addTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        setGeoLoading(false);
      },
      () => {
        setError('Unable to retrieve your location.');
        setGeoLoading(false);
      }
    );
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (!title.trim()) { setError('Title is required.'); return; }
      if (!content.trim()) { setError('Content is required.'); return; }

      setSaving(true);
      const body: CreateNoteInput = {
        title: title.trim(),
        content: content.trim(),
        location: location.trim() || undefined,
        tags,
      };

      const url = isEdit ? `/api/notes/${noteId}` : '/api/notes';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
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
    [title, content, location, tags, isEdit, noteId, router]
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
          placeholder="Brief description of your observation"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </div>

      {/* Content */}
      <div>
        <label className="label" htmlFor="content">Notes</label>
        <textarea
          id="content"
          className="input min-h-[160px] resize-y"
          placeholder="Describe what you observed…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        />
      </div>

      {/* Location */}
      <div>
        <label className="label" htmlFor="location">Location</label>
        <div className="flex gap-2">
          <input
            id="location"
            className="input flex-1"
            type="text"
            placeholder="e.g. Site A, or GPS coordinates"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={getLocation}
            disabled={geoLoading}
          >
            {geoLoading ? '…' : '📍 GPS'}
          </button>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="label">Tags</label>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            type="text"
            placeholder="Add a tag and press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addTag(); }
            }}
          />
          <button type="button" className="btn-secondary shrink-0" onClick={addTag}>
            Add
          </button>
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full"
              >
                {tag}
                <button
                  type="button"
                  className="hover:text-red-600 transition-colors"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Note'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          Cancel
        </button>
      </div>
    </form>
  );
}
