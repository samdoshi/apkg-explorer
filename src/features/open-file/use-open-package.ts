import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { usePackage } from '@/features/package/package-context'

/** Opens a file and, if it worked, shows its notes. */
export function useOpenPackage() {
  const { open } = usePackage()
  const navigate = useNavigate()
  return useCallback(
    async (file: File) => {
      if (await open(file)) await navigate('/notes')
    },
    [open, navigate],
  )
}
