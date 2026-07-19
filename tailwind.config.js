/** @type {import('tailwindcss').Config} */
// デザイントークンはルートの DESIGN.md（IBM Carbon Design System 抽出）に従う。
// フラットな直角ジオメトリ・白＋チャコール＋IBM Blue 単一アクセント・ヘアライン境界。
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'IBM Plex Sans',
          'Hiragino Kaku Gothic ProN',
          'Meiryo',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        carbon: {
          blue: '#0f62fe', // 唯一のブランドアクセント（primary）
          'blue-hover': '#0050e6',
          'blue-60': '#0043ce',
          'blue-80': '#002d9c', // primary pressed
          'blue-40': '#78a9ff', // ダーク面上のリンク・アクセント
          ink: '#161616', // 見出し・本文（ライト面）／ダークのcanvas
          'ink-muted': '#525252',
          'ink-subtle': '#8c8c8c',
          surface: '#f4f4f4', // surface-1: 入力欄・帯
          'surface-2': '#e0e0e0',
          hairline: '#e0e0e0', // 1px 境界（ライト）
          layer: '#262626', // ダークのカード面（inverse-surface-1）
          'line-dark': '#393939', // 1px 境界（ダーク）
          'inverse-muted': '#c6c6c6', // ダーク面の二次テキスト
          success: '#24a148',
          warning: '#f1c21b', // 上に載せる文字は ink（白不可）
          error: '#da1e28',
        },
      },
    },
  },
  plugins: [],
}
