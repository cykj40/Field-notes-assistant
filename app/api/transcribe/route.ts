import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey } from '@/lib/apiKey';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const formData = await req.formData();
  const audio = formData.get('audio') as File | null;

  if (!audio) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
  }

  if (audio.size < 1000) {
    return NextResponse.json({ transcript: '' });
  }

  const openaiKey = process.env['OPENAI_API_KEY'];
  if (!openaiKey) {
    return NextResponse.json(
      { error: 'OpenAI API key not configured' },
      { status: 500 }
    );
  }

  const whisperForm = new FormData();
  whisperForm.append('file', audio, 'recording.webm');
  whisperForm.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
    },
    body: whisperForm,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[transcribe] Whisper API error:', error);
    return NextResponse.json(
      { error: 'Transcription failed' },
      { status: 502 }
    );
  }

  const data = await response.json();
  return NextResponse.json({ transcript: data.text ?? '' });
}
