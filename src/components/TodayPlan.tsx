// ホームの「今日のプラン」。開始摩擦をなくすフェーズ1の入口。
// 体調3択 → 当日メニューを提案（強制しない）。実施済み項目は当日ログから自動チェック。
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeck } from '../store/useDeck'
import { useSettings } from '../store/useSettings'
import { computeStats } from '../lib/session'
import { eventsOn } from '../lib/kpi'
import { todayStr } from '../lib/srs'
import { ENERGIES, buildPlan, planItemDone, type Energy } from '../lib/planEngine'

function EnergyPicker({ onPick }: { onPick: (e: Energy) => void }) {
  return (
    <section className="tile p-4">
      <h2 className="text-sm font-semibold">今日のプラン</h2>
      <p className="t-muted mt-1 text-sm">今日の調子は？ 選ぶと今日のメニューを組みます。</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {ENERGIES.map((e) => (
          <button
            key={e.id}
            onClick={() => onPick(e.id)}
            className="tile-muted flex flex-col items-center gap-1 py-3 active:opacity-90"
          >
            <span className="text-2xl">{e.icon}</span>
            <span className="text-xs font-medium">{e.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function TodayPlan() {
  const navigate = useNavigate()
  const phrases = useDeck((s) => s.phrases)
  const progress = useDeck((s) => s.progress)
  const events = useDeck((s) => s.events)
  const planEnergy = useDeck((s) => s.planEnergy)
  const setPlanEnergy = useDeck((s) => s.setPlanEnergy)
  const clearPlanEnergy = useDeck((s) => s.clearPlanEnergy)
  const includeStatuses = useSettings((s) => s.includeStatuses)
  const hasChatKey = useSettings((s) => s.chatApiKey.trim().length > 0)

  const due = useMemo(
    () => computeStats(phrases, progress, includeStatuses).due,
    [phrases, progress, includeStatuses],
  )
  const todayEvents = useMemo(() => eventsOn(events, todayStr()), [events])

  if (!planEnergy) return <EnergyPicker onPick={setPlanEnergy} />

  const plan = buildPlan(planEnergy, { due, hasChatKey })
  const label = ENERGIES.find((e) => e.id === planEnergy)?.label ?? ''
  const allDone = plan.items.every((it) => planItemDone(it.kind, todayEvents))

  return (
    <section className="tile p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">今日のプラン</h2>
        <button onClick={clearPlanEnergy} className="link text-xs">
          気分を変える
        </button>
      </div>
      <p className="t-muted mt-1 text-xs">
        {ENERGIES.find((e) => e.id === planEnergy)?.icon} {label} ／ {plan.note}
      </p>

      <ul className="mt-3 space-y-2">
        {plan.items.map((it) => {
          const done = planItemDone(it.kind, todayEvents)
          return (
            <li key={it.id}>
              <button
                onClick={() => navigate(it.route)}
                className="tile-muted flex w-full items-center gap-3 px-3 py-3 text-left active:opacity-90"
              >
                <span className="text-xl">{done ? '✅' : it.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${done ? 't-subtle line-through' : ''}`}>
                    {it.label}
                  </span>
                  <span className="t-muted block text-xs">{it.detail}</span>
                </span>
                <span className="link shrink-0">→</span>
              </button>
            </li>
          )
        })}
      </ul>

      {allDone && (
        <p className="mt-3 text-center text-sm text-carbon-success">
          今日のプランは完了！ お疲れさまでした 🎉
        </p>
      )}
    </section>
  )
}
