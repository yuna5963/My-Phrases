import type { Phrase } from '../types'
import { isMultiSentence } from '../lib/text'
import ListenPractice from '../components/ListenPractice'

// Module-scoped so the predicate identity is stable across renders.
const isMulti = (p: Phrase) => isMultiSentence(p.en)

export default function Modeling() {
  return (
    <ListenPractice
      title="モデリング"
      hint="お手本を見ながら、続けて音読しよう"
      accent={{ text: 'text-teal-600 dark:text-teal-400', button: 'bg-teal-500' }}
      filter={isMulti}
    />
  )
}
