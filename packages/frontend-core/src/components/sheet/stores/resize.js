import { writable, get, derived } from "svelte/store"

export const createResizeStores = context => {
  const { columns, stickyColumn } = context
  const initialState = {
    initialMouseX: null,
    initialWidth: null,
    columnIdx: null,
    width: 0,
    left: 0,
  }
  const resize = writable(initialState)
  const isResizing = derived(resize, $resize => $resize.columnIdx != null)
  const MinColumnWidth = 100

  // Starts resizing a certain column
  const startResizing = (column, e) => {
    // Prevent propagation to stop reordering triggering
    e.stopPropagation()

    resize.set({
      width: column.width,
      left: column.left,
      initialWidth: column.width,
      initialMouseX: e.clientX,
      columnIdx: column.idx,
    })

    // Add mouse event listeners to handle resizing
    document.addEventListener("mousemove", onResizeMouseMove)
    document.addEventListener("mouseup", stopResizing)
  }

  // Handler for moving the mouse to resize columns
  const onResizeMouseMove = e => {
    const { initialMouseX, initialWidth, width, columnIdx } = get(resize)
    const dx = e.clientX - initialMouseX
    const newWidth = Math.round(Math.max(MinColumnWidth, initialWidth + dx))

    // Ignore small changes
    if (Math.abs(width - newWidth) < 5) {
      return
    }

    // Update column state
    if (columnIdx === "sticky") {
      stickyColumn.update(state => ({
        ...state,
        width: newWidth,
      }))
    } else {
      columns.update(state => {
        state[columnIdx].width = newWidth
        let offset = state[columnIdx].left + newWidth
        for (let i = columnIdx + 1; i < state.length; i++) {
          state[i].left = offset
          offset += state[i].width
        }
        return [...state]
      })
    }

    // Update state
    resize.update(state => ({
      ...state,
      width: newWidth,
    }))
  }

  // Stop resizing any columns
  const stopResizing = () => {
    resize.set(initialState)
    document.removeEventListener("mousemove", onResizeMouseMove)
    document.removeEventListener("mouseup", stopResizing)
  }

  return {
    resize: {
      ...resize,
      actions: {
        startResizing,
      },
    },
    isResizing,
  }
}