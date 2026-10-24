import { describe, expect, it } from 'vitest'
import { restartBudget } from '../src/main/surfaces'

describe('restartBudget', () => {
  it('allows a few restarts a minute', () => {
    let recent: number[] | null = []
    for (const now of [0, 1000, 2000]) {
      recent = restartBudget(recent ?? [], now)
      expect(recent).not.toBeNull()
    }
    expect(restartBudget(recent ?? [], 3000)).toBeNull()
  })

  it('forgets restarts older than a minute', () => {
    expect(restartBudget([0, 1000, 2000], 60_500)).toEqual([1000, 2000, 60_500])
  })
})
