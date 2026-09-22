export interface BlogTable {
  caption: string
  columns: string[]
  rows: string[][]
}

export interface BlogPost {
  slug: string
  title: string
  metaTitle?: string
  metaDescription?: string
  excerpt: string
  date: string // YYYY-MM-DD
  updated?: string // YYYY-MM-DD
  content: string // markdown
  tables?: Record<string, BlogTable>
}
