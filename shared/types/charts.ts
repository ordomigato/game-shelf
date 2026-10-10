/**
 * A chart on a collection's dashboard. Charts only read the collection's
 * own games, and point at fields by id, so renaming a field just works.
 */
export type ChartKind = 'number' | 'bar' | 'pie' | 'line'

/** Small, medium and wide take 1, 2 and 3 of the dashboard's columns. */
export type ChartSize = 'small' | 'medium' | 'large'

/**
 * What a chart measures for a set of games: how many there are, or a sum,
 * average, lowest or highest of a number-like field, or the share of games
 * with a checkbox ticked.
 */
export type ChartMeasure =
  | { op: 'count' }
  | { op: 'sum' | 'average' | 'min' | 'max'; fieldId: string }
  | { op: 'percent'; fieldId: string }

/** Over time: by when games were added, or by a date field. */
export interface ChartTimeline {
  /** `addedAt`, or a date field's id. */
  source: 'addedAt' | string
  bucket: 'month' | 'year'
  /** A running total instead of each month or year on its own. */
  cumulative: boolean
}

export interface ChartWidget {
  id: string
  kind: ChartKind
  /** Shown above the chart. Empty for one made from the settings. */
  title: string
  size: ChartSize
  measure: ChartMeasure
  /** Bar and pie: the field whose values split the games into groups. */
  groupBy?: string
  /** Line: how the games spread over time. */
  timeline?: ChartTimeline
}
