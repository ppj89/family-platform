import { useEffect, useState } from 'react'
import { listCommonCodeOptionValues } from '../api/commonCodes'
import type { CommonCodeGroupKey } from '../constants/commonCodes'

export function useCommonCodeOptions(groupKey: CommonCodeGroupKey, fallback: readonly string[]) {
  const [options, setOptions] = useState<string[]>(() => [...fallback])

  useEffect(() => {
    let alive = true
    setOptions([...fallback])
    listCommonCodeOptionValues(groupKey, fallback).then((values) => {
      if (alive) setOptions(values)
    })
    return () => {
      alive = false
    }
  }, [fallback, groupKey])

  return options
}
