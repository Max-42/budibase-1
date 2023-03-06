import { writable, derived, get } from "svelte/store"
import { buildLuceneQuery } from "../../../utils/lucene"
import { fetchData } from "../../../fetch/fetchData"
import { notifications } from "@budibase/bbui"

export const createRowsStore = context => {
  const { config, API } = context
  const tableId = derived(config, $config => $config.tableId)
  const filter = derived(config, $config => $config.filter)

  // Flag for whether this is the first time loading our fetch
  let loaded = false

  // Local cache of row IDs to speed up checking if a row exists
  let rowCacheMap = {}

  // Exported stores
  const rows = writable([])
  const schema = writable({})

  // Local stores for managing fetching data
  const query = derived(filter, $filter => buildLuceneQuery($filter))
  const fetch = derived([tableId, query], ([$tableId, $query]) => {
    if (!$tableId) {
      return null
    }
    // Wipe state and fully hydrate next time our fetch returns data
    loaded = false

    // Create fetch and load initial data
    return fetchData({
      API,
      datasource: {
        type: "table",
        tableId: $tableId,
      },
      options: {
        sortColumn: null,
        sortOrder: null,
        query: $query,
        limit: 100,
        paginate: true,
      },
    })
  })

  // Observe each data fetch and extract some data
  fetch.subscribe($fetch => {
    if (!$fetch) {
      return
    }
    $fetch.subscribe($$fetch => {
      if ($$fetch.loaded) {
        if (!loaded) {
          // Hydrate initial data
          loaded = true
          rowCacheMap = {}
          rows.set([])

          // Enrich primary display into schema
          let newSchema = $$fetch.schema
          const primaryDisplay = $$fetch.definition?.primaryDisplay
          if (primaryDisplay && newSchema[primaryDisplay]) {
            newSchema[primaryDisplay].primaryDisplay = true
          }
          schema.set(newSchema)
        }

        // Process new rows
        handleNewRows($$fetch.rows)
      }
    })
  })

  // Adds a new empty row
  const addRow = async () => {
    try {
      // Create row
      let newRow = await API.saveRow({ tableId: get(tableId) })

      // Use search endpoint to fetch the row again, ensuring relationships are
      // properly enriched
      const res = await API.searchTable({
        tableId: get(tableId),
        limit: 1,
        query: {
          equal: {
            _id: newRow._id,
          },
        },
        paginate: false,
      })
      if (res?.rows?.[0]) {
        newRow = res.rows[0]
      }

      // Update state
      handleNewRows([newRow])
      return newRow
    } catch (error) {
      notifications.error(`Error adding row: ${error?.message}`)
    }
  }

  // Refreshes a specific row, handling updates, addition or deletion
  const refreshRow = async id => {
    // Get index of row to check if it exists
    const $rows = get(rows)
    const index = $rows.findIndex(row => row._id === id)

    // Fetch row from the server again
    const res = await API.searchTable({
      tableId: get(tableId),
      limit: 1,
      query: {
        equal: {
          _id: id,
        },
      },
      paginate: false,
    })
    let newRow = res?.rows?.[0]

    // Process as either an update, addition or deletion
    if (newRow) {
      if (index !== -1) {
        // An existing row was updated
        rows.update(state => {
          state[index] = { ...newRow, __idx: index }
          return state
        })
      } else {
        // A new row was created
        handleNewRows([newRow])
      }
    } else if (index !== -1) {
      // A row was removed
      handleRemoveRows([$rows[index]])
    }
  }

  // Updates a value of a row
  const updateRow = async (rowId, column, value) => {
    const $rows = get(rows)
    const index = $rows.findIndex(x => x._id === rowId)
    const row = $rows[index]
    if (index === -1 || row?.[column.name] === value) {
      return
    }

    // Immediately update state so that the change is reflected
    let newRow = { ...row, [column.name]: value }
    rows.update(state => {
      state[index] = { ...newRow }
      return state
    })

    // Save change
    delete newRow.__idx
    try {
      await API.saveRow(newRow)
    } catch (error) {
      notifications.error(`Error saving row: ${error?.message}`)
    }

    return await refreshRow(row._id)
  }

  // Deletes an array of rows
  const deleteRows = async rowsToDelete => {
    // Actually delete rows
    rowsToDelete.forEach(row => {
      delete row.__idx
    })
    await API.deleteRows({
      tableId: get(tableId),
      rows: rowsToDelete,
    })

    // Update state
    handleRemoveRows(rowsToDelete)
  }

  // Local handler to process new rows inside the fetch, and append any new
  // rows to state that we haven't encountered before
  const handleNewRows = newRows => {
    let rowsToAppend = []
    let newRow
    for (let i = 0; i < newRows.length; i++) {
      newRow = newRows[i]
      if (!rowCacheMap[newRow._id]) {
        rowCacheMap[newRow._id] = true
        rowsToAppend.push(newRow)
      }
    }
    if (rowsToAppend.length) {
      rows.update($rows => {
        return [
          ...$rows,
          ...rowsToAppend.map((row, idx) => ({
            ...row,
            __idx: $rows.length + idx,
          })),
        ]
      })
    }
  }

  // Local handler to remove rows from state
  const handleRemoveRows = rowsToRemove => {
    const deletedIds = rowsToRemove.map(row => row._id)

    // We deliberately do not remove IDs from the cache map as the data may
    // still exist inside the fetch, but we don't want to add it again
    rows.update(state => {
      return state
        .filter(row => !deletedIds.includes(row._id))
        .map((row, idx) => ({ ...row, __idx: idx }))
    })

    // If we ended up with no rows, try getting the next page
    if (!get(rows).length) {
      loadNextPage()
    }
  }

  // Loads the next page of data if available
  const loadNextPage = () => {
    get(fetch)?.nextPage()
  }

  return {
    rows: {
      ...rows,
      actions: {
        addRow,
        updateRow,
        deleteRows,
        loadNextPage,
        refreshRow,
      },
    },
    schema,
  }
}