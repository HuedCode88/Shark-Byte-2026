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
      if (!body.jobId) throw new Error('Jarvis did not create a chat job.')

      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        const jobResponse = await fetch(`/api/chat/${body.jobId}`)
        const job = await jobResponse.json()
        if (!jobResponse.ok) throw new Error(job.error || 'The chat job could not be found.')
        if (job.status === 'failed') throw new Error(job.error || 'Jarvis could not finish.')
        if (job.status !== 'complete') continue

        const result = job as SwarmResponse
        setAnswer(result.answer)
        applyCommands(result.commands)
        playSpeech(result.speech)
        return
      }
      throw new Error('Jarvis took too long to respond.')
    }).catch((requestError: Error) => {
      setError(requestError.message)
    }).finally(() => setIsThinking(false))
  }, [applyCommands, getUiSnapshot, playSpeech])

  return { sendTranscript, isThinking, answer, error }
}
