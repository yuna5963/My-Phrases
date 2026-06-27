import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useDeck } from './store/useDeck'
import { isTTSAvailable, loadVoices, primeTTS } from './lib/tts'
import BottomNav from './components/BottomNav'
import SupportBanner from './components/SupportBanner'
import Home from './pages/Home'
import Compose from './pages/Compose'
import Modeling from './pages/Modeling'
import Pronounce from './pages/Pronounce'
import LongReading from './pages/LongReading'
import Browse from './pages/Browse'
import Examples from './pages/Examples'
import PhraseDetail from './pages/PhraseDetail'
import Settings from './pages/Settings'

export default function App() {
  const load = useDeck((s) => s.load)
  const loaded = useDeck((s) => s.loaded)
  const error = useDeck((s) => s.error)
  const [ttsUsable, setTtsUsable] = useState(true)

  useEffect(() => {
    load()
    // No usable TTS if the API is missing or the engine exposes no voices
    // (e.g. Firefox for Android).
    loadVoices().then((voices) => setTtsUsable(isTTSAvailable() && voices.length > 0))
    // Unlock iOS audio on the very first user interaction.
    const onFirstGesture = () => primeTTS()
    window.addEventListener('pointerdown', onFirstGesture, { once: true })
    return () => window.removeEventListener('pointerdown', onFirstGesture)
  }, [load])

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <SupportBanner show={!ttsUsable} />
      <main className="safe-top flex-1 overflow-y-auto px-4 pb-24 pt-4">
        {!loaded ? (
          <p className="mt-20 text-center text-slate-400">読み込み中…</p>
        ) : error ? (
          <p className="mt-20 text-center text-rose-500">
            データの読み込みに失敗しました: {error}
          </p>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/compose" element={<Compose />} />
            <Route path="/modeling" element={<Modeling />} />
            <Route path="/pronounce" element={<Pronounce />} />
            <Route path="/long-reading" element={<LongReading />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/examples" element={<Examples />} />
            <Route path="/phrase/:id" element={<PhraseDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
      <BottomNav />
    </div>
  )
}
