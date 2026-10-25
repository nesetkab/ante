import { normalizeDomain } from '../boosts'
import type { Data } from '../schema'
import type { Action } from './actions'

export type BoostAction = Extract<Action, { type: `boost/${string}` | `route/${string}` }>

const MAX_ZAPS = 500

export function reduceBoosts(data: Data, action: BoostAction): void {
  switch (action.type) {
    case 'boost/create': {
      const domain = normalizeDomain(action.domain)
      if (data.boosts[action.id] || !domain) return
      data.boosts[action.id] = {
        id: action.id,
        name: action.name || domain,
        domain,
        enabled: true,
        css: '',
        js: '',
        zaps: [],
        fontFamily: null,
        tintHue: null,
        invert: false,
      }
      return
    }
    case 'boost/update': {
      const boost = data.boosts[action.id]
      if (!boost) return
      const { domain, ...rest } = action.patch
      Object.assign(boost, rest)
      if (domain !== undefined) boost.domain = normalizeDomain(domain)
      return
    }
    case 'boost/delete':
      Reflect.deleteProperty(data.boosts, action.id)
      return
    case 'boost/addZap': {
      const boost = data.boosts[action.id]
      if (!boost || boost.zaps.includes(action.selector) || boost.zaps.length >= MAX_ZAPS) return
      boost.zaps.push(action.selector)
      return
    }
    case 'boost/removeZap': {
      const boost = data.boosts[action.id]
      if (boost) boost.zaps = boost.zaps.filter((selector) => selector !== action.selector)
      return
    }
    case 'route/add': {
      if (data.routes.some((route) => route.id === action.id)) return
      data.routes.push({
        id: action.id,
        match: { ...action.match },
        target: action.target ?? 'space',
        spaceId: action.spaceId,
      })
      return
    }
    case 'route/update': {
      const route = data.routes.find((candidate) => candidate.id === action.id)
      if (!route) return
      if (action.patch.match) route.match = { ...action.patch.match }
      if (action.patch.target) route.target = action.patch.target
      if (action.patch.spaceId) route.spaceId = action.patch.spaceId
      return
    }
    case 'route/delete':
      data.routes = data.routes.filter((route) => route.id !== action.id)
      return
  }
}
