'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface UseVoiceRecognitionOptions {
  onResult: (text: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceRecognition({ onResult, onError }: UseVoiceRecognitionOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const start = useCallback(async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setIsSupported(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        chunksRef.current = [];

        if (blob.size < 1000) return;

        setIsTranscribing(true);
        try {
          const form = new FormData();
          form.append('audio', blob, 'recording.webm');

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: {
              'x-api-key': process.env['NEXT_PUBLIC_FIELD_NOTES_API_KEY'] ?? '',
            },
            body: form,
          });

          if (!res.ok) {
            const data = await res.json();
            onErrorRef.current?.(data.error ?? 'Transcription failed');
            return;
          }

          const data = await res.json();
          if (data.transcript?.trim()) {
            onResultRef.current(data.transcript.trim());
          }
        } catch (err) {
          console.error('[voice] transcription fetch error:', err);
          onErrorRef.current?.('Transcription failed');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('[voice] getUserMedia error:', err);
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError'
      ) {
        setIsSupported(false);
        onErrorRef.current?.('Microphone permission denied');
      } else {
        onErrorRef.current?.('Could not start recording');
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  return { isRecording, isTranscribing, isSupported, elapsed, start, stop };
}
