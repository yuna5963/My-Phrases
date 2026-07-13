import { useSettings } from '../store/useSettings'
import { freeTierDailyLimit, todayCountOf, useUsage } from '../lib/usage'

/**
 * Gemini API 無料枠の残り目安（この端末からの日次リクエスト数ベース）。
 * API が残クォータを返さないため、既知モデルは既定の RPD との差分を「約」で示す。
 */
export default function UsageBadge({ className = '' }: { className?: string }) {
  const model = useSettings((s) => s.chatModel)
  const used = useUsage((s) => todayCountOf(s, model))
  const limit = freeTierDailyLimit(model)
  return (
    <p className={`text-xs text-slate-400 ${className}`}>
      {limit !== undefined
        ? `⚡ 無料枠の目安: 残り 約${Math.max(limit - used, 0).toLocaleString()}回（今日 ${used}回使用）`
        : `⚡ AIの使用: 今日 ${used}回`}
    </p>
  )
}
