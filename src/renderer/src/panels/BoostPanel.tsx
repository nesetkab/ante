import { Crosshair, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { boostFonts, boostHues } from '@shared/boosts'
import type { BoostPatch } from '@shared/schema'
import { ante } from '../ante'
import { Button, Row, Section, Select, Toggle } from '../components/Form'
import { IconButton } from '../components/IconButton'
import { useAppState } from '../store'
import { onUiEvent } from '../uiEvents'
import styles from './Panel.module.css'
import { useDebouncedCallback } from './useDebounced'

const DEFAULT_FONT = '__default'

export function BoostPanel({ boostId }: { boostId: string }) {
  const boost = useAppState((state) => state.data.boosts[boostId])
  const [zapping, setZapping] = useState(false)
  const update = (patch: BoostPatch) => ante.dispatch({ type: 'boost/update', id: boostId, patch })
  const updateCss = useDebouncedCallback((css: string) => update({ css }), 300)
  const updateJs = useDebouncedCallback((js: string) => update({ js }), 500)

  useEffect(
    () =>
      onUiEvent((event) => {
        if (event.type === 'zap' && event.boostId === boostId) setZapping(event.active)
      }),
    [boostId],
  )

  if (!boost) return <p className={styles.empty}>This boost was deleted.</p>

  return (
    <>
      <Section title={boost.domain}>
        <Row label="Enabled" hint="Apply this boost when you visit the site">
          <Toggle
            label="Enabled"
            checked={boost.enabled}
            onChange={(enabled) => update({ enabled })}
          />
        </Row>
        <Row label="Font">
          <Select
            label="Font"
            value={boost.fontFamily ?? DEFAULT_FONT}
            options={[
              { value: DEFAULT_FONT, label: 'Site default' },
              ...boostFonts.map((font) => ({ value: font, label: font })),
            ]}
            onChange={(value) => update({ fontFamily: value === DEFAULT_FONT ? null : value })}
          />
        </Row>
        <Row label="Tint">
          <div className={styles.swatches}>
            <button
              type="button"
              aria-label="No tint"
              className={[
                styles.swatch,
                styles.swatchNone,
                boost.tintHue === null && styles.swatchOn,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => update({ tintHue: null })}
            >
              <X size={11} />
            </button>
            {boostHues.map((hue) => (
              <button
                key={hue}
                type="button"
                aria-label={`Tint ${hue}`}
                className={[styles.swatch, boost.tintHue === hue && styles.swatchOn]
                  .filter(Boolean)
                  .join(' ')}
                style={{ background: `hsl(${hue} 70% 62%)` }}
                onClick={() => update({ tintHue: hue })}
              />
            ))}
          </div>
        </Row>
        <Row label="Invert colors" hint="A quick dark mode for bright sites">
          <Toggle
            label="Invert colors"
            checked={boost.invert}
            onChange={(invert) => update({ invert })}
          />
        </Row>
      </Section>

      <Section title="Zap">
        <Row
          label={zapping ? 'Click elements on the page to hide them' : 'Hide parts of the page'}
          hint={zapping ? 'Press Escape when you are done' : undefined}
        >
          <Button
            tone={zapping ? 'primary' : 'default'}
            onClick={() =>
              ante.command(zapping ? { type: 'boost/zapStop' } : { type: 'boost/zap', boostId })
            }
          >
            <Crosshair size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {zapping ? 'Done' : 'Zap'}
          </Button>
        </Row>
        {boost.zaps.length > 0 && (
          <div className={styles.list}>
            {boost.zaps.map((selector) => (
              <div key={selector} className={styles.listItem}>
                <span className={styles.mono} title={selector}>
                  {selector}
                </span>
                <IconButton
                  size="sm"
                  label="Show again"
                  onClick={() => ante.dispatch({ type: 'boost/removeZap', id: boostId, selector })}
                >
                  <X size={13} />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="CSS">
        <textarea
          className={styles.code}
          defaultValue={boost.css}
          spellCheck={false}
          placeholder="body { font-size: 17px; }"
          onChange={(event) => updateCss(event.target.value)}
        />
      </Section>

      <Section title="JavaScript">
        <Row label="Runs on every page load" hint="Isolated from the site's own scripts">
          <Button onClick={() => ante.command({ type: 'boost/reloadTabs', boostId })}>
            Reload site
          </Button>
        </Row>
        <textarea
          className={styles.code}
          defaultValue={boost.js}
          spellCheck={false}
          placeholder="document.title = 'Focus'"
          onChange={(event) => updateJs(event.target.value)}
        />
      </Section>

      <div className={styles.actions}>
        <span />
        <Button tone="danger" onClick={() => ante.dispatch({ type: 'boost/delete', id: boostId })}>
          Delete boost
        </Button>
      </div>
    </>
  )
}
