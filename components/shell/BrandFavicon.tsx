'use client'

import { useEffect } from 'react'

export function BrandFavicon({ href }: { href: string | null }) {
  useEffect(() => {
    if (!href) return

    document.head
      .querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
      .forEach((node) => {
        if (node.dataset.brandFavicon !== 'true') node.remove()
      })

    const existing = document.head.querySelector<HTMLLinkElement>('link[rel="icon"][data-brand-favicon="true"]')
    const link = existing ?? document.createElement('link')

    link.rel = 'icon'
    link.href = href
    link.dataset.brandFavicon = 'true'

    if (!existing) document.head.appendChild(link)
  }, [href])

  return null
}
