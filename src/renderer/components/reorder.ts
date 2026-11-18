import type { DragEvent } from 'react'
import { reorderTab } from '../actions'
import { setState } from '../state'

const TAB_TYPE = 'text/hive-tab'
const SESSION_TYPE = 'text/hive-session'

/**
 * Drag props for something that stands for an open tab: a tab in the bar or a card on the left.
 * The tab can be dropped on a pane (it shows there) or on another tab (it moves there).
 * `axis` says where the middle is: the left and right half for tabs, the top and bottom half for cards.
 */
export function reorderProps(id: string, axis: 'x' | 'y') {
  const isAfter = (event: DragEvent): boolean => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    return axis === 'x' ? event.clientX > rect.left + rect.width / 2 : event.clientY > rect.top + rect.height / 2
  }
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.setData(SESSION_TYPE, id)
      event.dataTransfer.setData(TAB_TYPE, id)
      event.dataTransfer.effectAllowed = 'move'
    },
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes(TAB_TYPE)) {
        event.preventDefault()
        event.stopPropagation()
        const after = isAfter(event)
        setState((current) => (current.tabDrop?.id === id && current.tabDrop.after === after ? {} : { tabDrop: { id, after } }))
      }
    },
    onDragLeave: () => setState((current) => (current.tabDrop?.id === id ? { tabDrop: null } : {})),
    onDrop: (event: DragEvent) => {
      const dragged = event.dataTransfer.getData(TAB_TYPE)
      if (dragged) {
        event.preventDefault()
        event.stopPropagation()
        reorderTab(dragged, id, isAfter(event))
      }
    },
    onDragEnd: () => setState({ tabDrop: null })
  }
}

/** Dropping a tab on the free space of the bar moves it to the end. */
export function endOfListProps() {
  return {
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes(TAB_TYPE)) {
        event.preventDefault()
      }
    },
    onDrop: (event: DragEvent) => {
      const dragged = event.dataTransfer.getData(TAB_TYPE)
      if (dragged) {
        event.preventDefault()
        reorderTab(dragged, null, true)
      }
    }
  }
}
