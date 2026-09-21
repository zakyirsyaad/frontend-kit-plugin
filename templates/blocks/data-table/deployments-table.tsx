"use client"

import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { STATUS_OPTIONS, StatusBadge, type Status } from "./status-badge"

export type Deployment = {
  id: string
  project: string
  branch: string
  status: Status
  updatedAt: Date
}

// Register only the features this table uses (TanStack Table v9 tree-shakes the rest).
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, datetime: sortFn_datetime },
  filterFns: { includesString: filterFn_includesString, equalsString: filterFn_equalsString },
})

const helper = createColumnHelper<typeof features, Deployment>()

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" })

const columns = helper.columns([
  helper.accessor("project", {
    header: "Project",
    sortFn: "alphanumeric",
    filterFn: "includesString",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  helper.accessor("status", {
    header: "Status",
    enableSorting: false,
    filterFn: "equalsString",
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  helper.accessor("branch", {
    header: "Branch",
    enableSorting: false,
    cell: (info) => <code className="font-mono text-xs text-muted-foreground">{info.getValue()}</code>,
  }),
  helper.accessor("updatedAt", {
    header: "Updated",
    sortFn: "datetime",
    cell: (info) => <time dateTime={info.getValue().toISOString()}>{dateFormat.format(info.getValue())}</time>,
  }),
])

const ALL = "all"

export function DeploymentsTable({ data, pageSize = 10 }: { data: Deployment[]; pageSize?: number }) {
  const table = useTable({
    features,
    columns,
    data,
    initialState: {
      sorting: [{ id: "updatedAt", desc: true }],
      pagination: { pageIndex: 0, pageSize },
    },
  })

  const projectColumn = table.getColumn("project")
  const statusColumn = table.getColumn("status")
  const { pageIndex } = table.state.pagination
  const pageCount = Math.max(table.getPageCount(), 1)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Filter by project"
          placeholder="Filter projects…"
          value={(projectColumn?.getFilterValue() as string | undefined) ?? ""}
          onChange={(event) => projectColumn?.setFilterValue(event.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={(statusColumn?.getFilterValue() as string | undefined) ?? ALL}
          onValueChange={(value) => statusColumn?.setFilterValue(value === ALL ? undefined : value)}
        >
          <SelectTrigger aria-label="Filter by status" className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-ml-2"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUpIcon aria-hidden />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon aria-hidden />
                          ) : (
                            <ArrowUpDownIcon aria-hidden className="text-muted-foreground" />
                          )}
                        </Button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No deployments match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Page {pageIndex + 1} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
