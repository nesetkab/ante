import { useState } from 'react'

export function useRemoteVersion(version: number): {
  fieldsKey: number
  markLocal: (stamp: number) => void
} {
  const [seen, setSeen] = useState(version)
  const [lastLocal, setLastLocal] = useState(0)
  const [fieldsKey, setFieldsKey] = useState(0)
  if (version !== seen) {
    setSeen(version)
    if (version > lastLocal) setFieldsKey((key) => key + 1)
  }
  return { fieldsKey, markLocal: setLastLocal }
}
