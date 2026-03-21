'use client';

import { useRef, useState, useCallback } from 'react';

interface UseVoiceRecognitionOptions {
  lang: 'en-US' | 'es-MX';
  onResult: (text: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceRecognition({ lang, onResult, onError }: UseVoiceRecognitionOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);

  const getRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = lang;
      return recognitionRef.current;
    }

    const SR =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SR) {
      setIsSupported(false);
      return null;
    }

    const recognition = new SR();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      if (!isRecordingRef.current) return;
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) {
        onResult(transcript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      console.error('[voice] error:', event.error);
      if (event.error === 'not-allowed') {
        setIsSupported(false);
        onError?.('Microphone permission denied');
        setIsRecording(false);
        isRecordingRef.current = false;
        return;
      }

      if (isRecordingRef.current) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch {}
        }, 300);
      }
    };

    recognition.onend = () => {
      if (isRecordingRef.current) {
        setTimeout(() => {
          try {
            recognition.lang = lang;
            recognition.start();
          } catch {}
        }, 100);
      } else {
        setIsRecording(false);
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, [lang, onResult, onError]);

  const start = useCallback(() => {
    const recognition = getRecognition();
    if (!recognition) return;

    recognition.lang = lang;
    isRecordingRef.current = true;
    setIsRecording(true);

    try {
      recognition.start();
    } catch (e) {
      console.error('[voice] start failed:', e);
    }
  }, [getRecognition, lang]);

  const stop = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    try {
      recognitionRef.current?.stop();
    } catch {}
  }, []);

  return { isRecording, isSupported, start, stop };
}
