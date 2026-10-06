export interface WebviewUiState {
  query?: string
  expandedUsageIds?: string[]
}

export const vscode = acquireVsCodeApi<WebviewUiState>()
