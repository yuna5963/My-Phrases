import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useDeck } from './store/useDeck'
import { isTTSAvailable, loadVoices, primeTTS } from './lib/tts'
import { isNativeApp } from './lib/platform'
import BottomNav from './components/BottomNav'
import SupportBanner from './components/SupportBanner'
import Home from './pages/Home'
import Daily from './pages/Daily'
import Compose from './pages/Compose'
import StructureDrill from './pages/StructureDrill'
import MessageDrill from './pages/MessageDrill'
import LongReading from './pages/LongReading'
import LongReadingCreate from './pages/LongReadingCreate'
import Cloze from './pages/Cloze'
import ChatPractice from './pages/ChatPractice'
import ExpressionStock from './pages/ExpressionStock'
import StockEnrich from './pages/StockEnrich'
import Browse from './pages/Browse'
import Examples from './pages/Examples'
import ExampleDetail from './pages/ExampleDetail'
import ChunkDetail from './pages/ChunkDetail'
import ChunkEdit from './pages/ChunkEdit'
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

  // 【ネイティブ】Androidの戻るボタンを明示制御する。既定挙動だと履歴が無い画面で
  // アプリが終了してしまうため、ホーム以外なら「戻る（無ければホームへ）」、
  // ホームでは終了ではなく最小化（バックグラウンドへ。次回起動が速い）にする。
  useEffect(() => {
    if (!isNativeApp) return
    let cleanup: (() => void) | undefined
    void import('@capacitor/app').then(({ App: CapApp }) => {
      const sub = CapApp.addListener('backButton', ({ canGoBack }) => {
        const atHome =
          window.location.hash === '' ||
          window.location.hash === '#' ||
          window.location.hash === '#/'
        if (atHome) {
          void CapApp.minimizeApp()
        } else if (canGoBack) {
          window.history.back()
        } else {
          window.location.hash = '#/'
        }
      })
      cleanup = () => {
        void sub.then((s) => s.remove())
      }
    })
    return () => cleanup?.()
  }, [])

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <SupportBanner show={!ttsUsable} />
      {/* pb はナビの高さ＋余裕。ネイティブアプリでは端末のフォントサイズ設定で
          ナビが高くなるため、最後のボタンが隠れない余白を確保する。 */}
      <main className="safe-top flex-1 overflow-y-auto px-4 pb-32 pt-4">
        {!loaded ? (
          <p className="t-subtle mt-20 text-center">読み込み中…</p>
        ) : error ? (
          <p className="mt-20 text-center text-carbon-error">
            データの読み込みに失敗しました: {error}
          </p>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/daily" element={<Daily />} />
            <Route path="/compose" element={<Compose />} />
            <Route path="/structure" element={<StructureDrill />} />
            <Route path="/message" element={<MessageDrill />} />
            <Route path="/long-reading" element={<LongReading />} />
            <Route path="/long-reading/new" element={<LongReadingCreate />} />
            <Route path="/cloze" element={<Cloze />} />
            <Route path="/chat" element={<ChatPractice />} />
            <Route path="/stock" element={<ExpressionStock />} />
            <Route path="/stock/enrich" element={<StockEnrich />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/examples" element={<Examples />} />
            <Route path="/example/:phraseId/:index" element={<ExampleDetail />} />
            <Route path="/chunk/new" element={<ChunkEdit />} />
            <Route path="/chunk/:id/edit" element={<ChunkEdit />} />
            <Route path="/chunk/:id" element={<ChunkDetail />} />
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
