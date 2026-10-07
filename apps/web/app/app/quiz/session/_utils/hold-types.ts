/** Asked once a call settled: 'retry' resends the SAME call in the SAME queue slot. */
export type Hold<T> = (
  outcome: { kind: 'value'; value: T } | { kind: 'thrown' },
) => Promise<'retry' | 'done'>
