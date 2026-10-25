import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isValidRegex } from '@shared/routing'
import type { Route, RouteMatch, RouteTarget } from '@shared/schema'
import { ante } from '../ante'
import { Button, Row, Section, Segmented, Select } from '../components/Form'
import { IconButton } from '../components/IconButton'
import { useAppState } from '../store'
import { onUiEvent } from '../uiEvents'
import styles from './Panel.module.css'

const kinds: readonly { value: RouteMatch['kind']; label: string }[] = [
  { value: 'domain', label: 'Domain is' },
  { value: 'contains', label: 'URL contains' },
  { value: 'regex', label: 'URL matches' },
]

const placeholders: Record<RouteMatch['kind'], string> = {
  domain: 'figma.com',
  contains: 'meet.google',
  regex: '^https://.*\\.notion\\.so',
}

const CURRENT = 'current'
const LITTLE = 'little'

function destinationOf(route: Route): string {
  return route.target === 'space' ? route.spaceId : route.target
}

function patchFor(value: string): { target: RouteTarget; spaceId?: string } {
  if (value === CURRENT || value === LITTLE) return { target: value }
  return { target: 'space', spaceId: value }
}

export function RoutesPanel() {
  const routes = useAppState((state) => state.data.routes)
  const spaces = useAppState((state) => state.data.spaces)
  const spaceOrder = useAppState((state) => state.data.spaceOrder)
  const externalLinks = useAppState((state) => state.data.settings.externalLinks)
  const [isDefault, setIsDefault] = useState<boolean | null>(null)
  const spaceOptions = spaceOrder.flatMap((id) => {
    const space = spaces[id]
    return space ? [{ value: id, label: space.name }] : []
  })
  const destinations = [
    ...spaceOptions,
    { value: CURRENT, label: 'Current space' },
    { value: LITTLE, label: 'Little window' },
  ]

  useEffect(() => {
    const off = onUiEvent((event) => {
      if (event.type === 'defaultBrowser') setIsDefault(event.isDefault)
    })
    ante.command({ type: 'browser/checkDefault' })
    return off
  }, [])

  return (
    <>
      <Section title="Links from other apps">
        <Row
          label="Default browser"
          hint={isDefault ? 'Ante opens your links' : 'Links open in another browser'}
        >
          <Button
            tone={isDefault ? 'default' : 'primary'}
            disabled={isDefault === true}
            onClick={() => ante.command({ type: 'browser/setDefault' })}
          >
            {isDefault ? 'Default' : 'Make default'}
          </Button>
        </Row>
        <Row label="When no rule matches">
          <Segmented
            value={externalLinks}
            options={[
              { value: 'little', label: 'Little window' },
              { value: 'space', label: 'Current space' },
            ]}
            onChange={(value) =>
              ante.dispatch({ type: 'settings/update', patch: { externalLinks: value } })
            }
          />
        </Row>
      </Section>

      <Section title="Rules">
        {routes.length === 0 && (
          <p className={styles.empty}>
            Send links from Slack, Mail or anywhere else straight to the right space.
          </p>
        )}
        <div className={styles.list}>
          {routes.map((route) => {
            const invalid = route.match.kind === 'regex' && !isValidRegex(route.match.value)
            return (
              <div key={route.id} className={styles.listItem}>
                <Select
                  label="Match"
                  value={route.match.kind}
                  options={kinds}
                  onChange={(kind) =>
                    ante.dispatch({
                      type: 'route/update',
                      id: route.id,
                      patch: { match: { ...route.match, kind } },
                    })
                  }
                />
                <input
                  className={styles.input}
                  style={{ flex: 1, ...(invalid ? { color: 'var(--danger)' } : {}) }}
                  defaultValue={route.match.value}
                  placeholder={placeholders[route.match.kind]}
                  spellCheck={false}
                  onBlur={(event) =>
                    ante.dispatch({
                      type: 'route/update',
                      id: route.id,
                      patch: { match: { ...route.match, value: event.target.value.trim() } },
                    })
                  }
                />
                <Select
                  label="Open in"
                  value={destinationOf(route)}
                  options={destinations}
                  onChange={(value) =>
                    ante.dispatch({ type: 'route/update', id: route.id, patch: patchFor(value) })
                  }
                />
                <IconButton
                  size="sm"
                  label="Delete rule"
                  onClick={() => ante.dispatch({ type: 'route/delete', id: route.id })}
                >
                  <X size={13} />
                </IconButton>
              </div>
            )
          })}
        </div>
      </Section>

      <div className={styles.actions}>
        <span />
        <Button
          tone="primary"
          disabled={spaceOptions.length === 0}
          onClick={() =>
            ante.dispatch({
              type: 'route/add',
              id: crypto.randomUUID(),
              match: { kind: 'domain', value: '' },
              spaceId: spaceOptions[0]?.value ?? '',
            })
          }
        >
          <Plus size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Add rule
        </Button>
      </div>
    </>
  )
}
