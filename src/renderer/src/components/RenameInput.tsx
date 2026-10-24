import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { onUiEvent } from '../uiEvents'

export function useRenameEvent(id: string): [boolean, (editing: boolean) => void] {
  const [editing, setEditing] = useState(false)
  useEffect(
    () =>
      onUiEvent((event) => {
        if (event.type === 'rename' && event.id === id) setEditing(true)
      }),
    [id],
  )
  return [editing, setEditing]
}

interface RenameInputProps {
  value: string
  className?: string
  onCommit: (value: string) => void
  onCancel: () => void
}

export function RenameInput({ value, className, onCommit, onCancel }: RenameInputProps) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.select()
  }, [])
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') onCommit(event.currentTarget.value.trim())
    if (event.key === 'Escape') onCancel()
  }
  return (
    <input
      ref={ref}
      className={className}
      defaultValue={value}
      spellCheck={false}
      onBlur={(event) => onCommit(event.currentTarget.value.trim())}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    />
  )
}
