import { describe, expect, it } from 'vitest'
import { clusterByTypeCategory } from './session'
import type { Phrase } from '../types'

function p(id: string, type: string, category: string): Phrase {
  return {
    id,
    en: id,
    ja: '訳',
    examples: [],
    type,
    category,
    level: '',
    priority: '',
    note: '',
    status: '未着手',
    createdTime: '',
  }
}

describe('clusterByTypeCategory', () => {
  it('同じType・同じCategoryが続けて出るようにまとめ直す', () => {
    const list = [
      p('a', 'Nuance', 'Health'),
      p('b', 'Pattern', 'Work'),
      p('c', 'Nuance', 'Health'),
      p('d', 'Nuance', 'Work'),
      p('e', 'Pattern', 'Work'),
    ]
    expect(clusterByTypeCategory(list).map((x) => x.id)).toEqual([
      'a', 'c', // Nuance/Health（先頭カードの群を最優先）
      'd', // Nuance/Work（同じTypeを先に消化）
      'b', 'e', // Pattern/Work
    ])
  })

  it('群の順序は初出順・群内は元の並び（弱い順）を保つ', () => {
    const list = [p('x', 'A', '1'), p('y', 'B', '1'), p('z', 'A', '1')]
    expect(clusterByTypeCategory(list).map((q) => q.id)).toEqual(['x', 'z', 'y'])
  })

  it('空リストはそのまま', () => {
    expect(clusterByTypeCategory([])).toEqual([])
  })
})
