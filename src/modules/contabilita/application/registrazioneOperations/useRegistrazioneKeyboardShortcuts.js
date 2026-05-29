import { useEffect } from 'react'

function isTypingElement(el) {
  if (!el) return false
  const tag = String(el.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'select' || tag === 'textarea'
}

function focusNextFocusable(root, current) {
  if (!root || !current) return false
  const focusables = Array.from(root.querySelectorAll('[data-reg-focusable="true"]')).filter((el) => !el.disabled)
  const index = focusables.indexOf(current)
  const next = index >= 0 ? focusables[index + 1] : null
  if (next && typeof next.focus === 'function') {
    next.focus()
    return true
  }
  return false
}

function focusFocusableByKey(root, key) {
  if (!root || !key) return false
  if (key === '__add_row__') return false
  const next = root.querySelector(`[data-reg-key="${String(key)}"]`)
  if (next && typeof next.focus === 'function') {
    next.focus()
    return true
  }
  return false
}

function focusFirstRegistrazioneField(root) {
  const next = root?.querySelector('[data-reg-focusable="true"]')
  if (next && typeof next.focus === 'function') next.focus()
}

function focusRowStart(root, rowId) {
  if (!root || !rowId) return false
  return focusFocusableByKey(root, `row:${String(rowId)}:conto`)
}

export function useRegistrazioneKeyboardShortcuts({
  rootRef,
  onNewRegistration,
  onSave,
  onAddRow,
  onDeleteRow,
  onAddIvaRow,
  onDeleteIvaRow,
  onOpenAccountPicker,
  onOpenAccountSearch,
  onOpenCounterpartyPicker,
  onOpenCounterpartySearch,
  onApplySbilancio,
  onOpenPartite,
  onCloseActiveOverlay,
  isOverlayOpen = false,
  isEnabled = true,
  canOpenPartite = false,
  focusDataRegistrazione,
  activeCell = null,
  allowedTabs = ['rows'],
  activeTab = 'rows',
  setActiveTab,
} = {}) {
  useEffect(() => {
    const root = rootRef?.current
    if (!root || !isEnabled) return undefined

    const isWithinRegistrazioneRoot = (target) => {
      if (!root) return false
      if (!target || typeof target !== 'object') return false
      if (typeof Node !== 'undefined' && typeof root.contains === 'function' && target instanceof Node) {
        return root.contains(target)
      }
      return Boolean(target?.closest?.('[data-reg-focusable="true"]') || target?.closest?.('[data-reg-row-id]'))
    }

    const stopEvent = (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
    }

    const handleKeyDown = (event) => {
      if (isOverlayOpen && event.key !== 'Escape') return

      const key = event.key
      const altNewRegistration =
        ((event.altKey && !event.ctrlKey && !event.metaKey) || (event.altKey && event.ctrlKey && !event.metaKey)) &&
        String(key || '').toLowerCase() === 'n'

      if (altNewRegistration) {
        stopEvent(event)
        onNewRegistration?.()
        window.requestAnimationFrame(() => focusDataRegistrazione?.() || focusFirstRegistrazioneField(root))
        return
      }

      if (!isWithinRegistrazioneRoot(event.target)) return

      // Alt + Freccia Destra / Sinistra tab switching
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (key === 'ArrowRight') {
          stopEvent(event)
          const currentIndex = allowedTabs.indexOf(activeTab)
          if (currentIndex !== -1 && currentIndex < allowedTabs.length - 1) {
            const nextTab = allowedTabs[currentIndex + 1]
            setActiveTab?.(nextTab)
            window.requestAnimationFrame(() => {
              const nextSection = root.querySelector(`[data-reg-section="${nextTab}"]`)
              const firstFocusable = nextSection?.querySelector('[data-reg-focusable="true"]')
              if (firstFocusable && typeof firstFocusable.focus === 'function') {
                firstFocusable.focus()
              }
            })
          }
          return
        }
        if (key === 'ArrowLeft') {
          stopEvent(event)
          const currentIndex = allowedTabs.indexOf(activeTab)
          if (currentIndex > 0) {
            const prevTab = allowedTabs[currentIndex - 1]
            setActiveTab?.(prevTab)
            window.requestAnimationFrame(() => {
              const prevSection = root.querySelector(`[data-reg-section="${prevTab}"]`)
              const firstFocusable = prevSection?.querySelector('[data-reg-focusable="true"]')
              if (firstFocusable && typeof firstFocusable.focus === 'function') {
                firstFocusable.focus()
              }
            })
          }
          return
        }
      }

      const activeField = String(event.target?.dataset?.regField || event.target?.dataset?.regKey || '')
      const activeRowId = String(event.target?.dataset?.regRowId || activeCell?.rowId || '')
      const nextKey = String(event.target?.dataset?.regNext || '')
      const rowHost = event.target?.closest?.('[data-reg-row-id]')
      const sectionHost = event.target?.closest?.('[data-reg-section]')
      const section = String(sectionHost?.dataset?.regSection || '').trim()
      const typingTarget = isTypingElement(event.target)
      const rowShortcutTarget = Boolean(rowHost && String(rowHost.dataset?.regRowId || '').trim())
      const shouldIgnoreGlobalShortcut = typingTarget && ['F12', 'F8', 'F9'].includes(key)

      if (shouldIgnoreGlobalShortcut) return

      if (key === 'Insert') {
        stopEvent(event)
        onNewRegistration?.()
        window.requestAnimationFrame(() => focusDataRegistrazione?.() || focusFirstRegistrazioneField(root))
        return
      }

      if (section === 'iva' && event.ctrlKey && !event.altKey && !event.metaKey) {
        if (key === '+' || key === '=' || key === 'Add' || event.code === 'NumpadAdd' || event.code === 'Equal') {
          stopEvent(event)
          const rowId = onAddIvaRow?.({ focusAfterAdd: true })
          if (rowId) {
            window.requestAnimationFrame(() => focusFocusableByKey(root, `iva-row:${String(rowId)}:causaleIva`))
          }
          return
        }
        if (key === '-' || key === 'Subtract' || event.code === 'Minus' || event.code === 'NumpadSubtract') {
          stopEvent(event)
          const ivaRowId = String(event.target?.dataset?.regRowId || activeCell?.rowId || '').trim()
          if (ivaRowId) onDeleteIvaRow?.(ivaRowId)
          return
        }
      }

      if (rowShortcutTarget && event.ctrlKey && !event.altKey && !event.metaKey) {
        if (key === '+' || key === '=' || key === 'Add' || event.code === 'NumpadAdd' || event.code === 'Equal') {
          stopEvent(event)
          const rowId = onAddRow?.({ focusAfterAdd: true })
          if (rowId) {
            window.requestAnimationFrame(() => focusRowStart(root, rowId))
          }
          return
        }
        if (key === '-' || key === 'Subtract' || event.code === 'Minus' || event.code === 'NumpadSubtract') {
          stopEvent(event)
          if (activeRowId) onDeleteRow?.(activeRowId)
          return
        }
      }

      if ((key === 'Enter' || key === 'Return') && typingTarget && event.target?.tagName?.toLowerCase() !== 'textarea') {
        if (event.target?.dataset?.hasSuggestions === 'true') {
          // Lascia scorrere l'evento Enter al gestore locale per selezionare il suggerimento
          return
        }
        stopEvent(event)
        if (nextKey === '__add_iva_row__') {
          const rowId = onAddIvaRow?.({ focusAfterAdd: true })
          if (rowId) {
            window.requestAnimationFrame(() => focusFocusableByKey(root, `iva-row:${String(rowId)}:causaleIva`))
          }
          return
        }
        if (nextKey === '__add_row__') {
          const rowId = onAddRow?.({ focusAfterAdd: true })
          if (rowId) {
            window.requestAnimationFrame(() => focusRowStart(root, rowId))
          }
          return
        }
        if (nextKey && focusFocusableByKey(root, nextKey)) return
        focusNextFocusable(root, event.target)
        return
      }

      if (key === 'F12') {
        stopEvent(event)
        onSave?.()
        return
      }

      if (key === 'F2' && activeField === 'conto') {
        stopEvent(event)
        onOpenAccountPicker?.({ rowId: activeRowId })
        return
      }

      if (key === 'F3' && activeField === 'conto') {
        stopEvent(event)
        onOpenAccountSearch?.({ rowId: activeRowId })
        return
      }

      if (key === 'F2' && activeField === 'soggetto') {
        stopEvent(event)
        onOpenCounterpartyPicker?.({ rowId: activeRowId })
        return
      }

      if (key === 'F3' && activeField === 'soggetto') {
        stopEvent(event)
        onOpenCounterpartySearch?.({ rowId: activeRowId })
        return
      }

      if (key === 'F8') {
        stopEvent(event)
        onApplySbilancio?.({ rowId: activeRowId })
        return
      }

      if (key === 'F9' && canOpenPartite) {
        stopEvent(event)
        onOpenPartite?.({ rowId: activeRowId })
        return
      }

      if (key === 'Escape') {
        stopEvent(event)
        onCloseActiveOverlay?.()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [
    activeCell,
    canOpenPartite,
    focusDataRegistrazione,
    isEnabled,
    isOverlayOpen,
    onAddRow,
    onAddIvaRow,
    onApplySbilancio,
    onCloseActiveOverlay,
    onDeleteRow,
    onDeleteIvaRow,
    onNewRegistration,
    onOpenAccountPicker,
    onOpenAccountSearch,
    onOpenCounterpartyPicker,
    onOpenCounterpartySearch,
    onOpenPartite,
    onSave,
    rootRef,
    allowedTabs,
    activeTab,
    setActiveTab,
  ])
}
