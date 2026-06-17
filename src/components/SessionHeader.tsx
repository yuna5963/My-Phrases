import { useNavigate } from 'react-router-dom'

interface Props {
  pos: number
  total: number
  title: string
}

export default function SessionHeader({ pos, total, title }: Props) {
  const navigate = useNavigate()
  const pct = total > 0 ? Math.min(100, (pos / total) * 100) : 0
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <button onClick={() => navigate('/')} className="text-slate-400">
          ✕ やめる
        </button>
        <span className="font-medium">{title}</span>
        <span className="text-slate-400">
          {Math.min(pos + 1, total)} / {total}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-1.5 rounded-full bg-sky-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
