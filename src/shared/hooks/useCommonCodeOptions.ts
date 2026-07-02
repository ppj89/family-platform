import { useEffect, useState } from 'react'
import { listCommonCodeOptionValues, listCommonCodeOptions } from '../api/commonCodes'
import type { CommonCodeGroupKey, CommonCodeOption } from '../constants/commonCodes'

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

export function useCommonCodeSelectOptions(groupKey: CommonCodeGroupKey, fallback: readonly CommonCodeOption[]) {
  const [options, setOptions] = useState<CommonCodeOption[]>(() => [...fallback])

  useEffect(() => {
    let alive = true
    setOptions([...fallback])
    listCommonCodeOptions(groupKey, fallback).then((values) => {
      if (alive) setOptions(values)
    })
    return () => {
      alive = false
    }
  }, [fallback, groupKey])

  return options
}
