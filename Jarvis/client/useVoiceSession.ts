import { useCallback, useState } from 'react'
import type { UiSnapshot } from './uiStore'
import { useUiStore } from './uiStore'
import type { SwarmResponse } from '../shared/uiCommands'

export function useVoiceSession() {
  const applyCommands = useUiStore((state) => state.applyCommands)
  const getUiSnapshot = useUiStore((state) => state.getUiSnapshot)
  const [isThinking, setIsThinking] = useState(false)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')

  const playSpeech = useCallback((text: string) => {
    if ('speechSynthesis' in window && text) window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }, [])

  const sendTranscript = useCallback((transcript: string, snapshot?: UiSnapshot, conversation?: Array<{ role: string; text: string }>) => {
    if (!transcript.trim()) return
    setError('')
    setAnswer('')
    setIsThinking(true)
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: transcript, snapshot: snapshot ?? getUiSnapshot(), conversation: conversation ?? [] }),
    }).then(async (response) => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Jarvis could not answer.')
      const result = body as SwarmResponse
      setAnswer(result.answer)
      applyCommands(result.commands)
      playSpeech(result.speech)
    }).catch((requestError: Error) => {
      setError(requestError.message)
    }).finally(() => setIsThinking(false))
  }, [applyCommands, getUiSnapshot, playSpeech])

  return { sendTranscript, isThinking, answer, error }
}
