import ListenPractice from '../components/ListenPractice'

export default function Pronounce() {
  return (
    <ListenPractice
      title="発音練習"
      hint="お手本に続けて、声に出して言ってみよう"
      accent={{ text: 'text-violet-600 dark:text-violet-400', button: 'bg-violet-500' }}
    />
  )
}
