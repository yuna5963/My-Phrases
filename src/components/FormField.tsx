/** ラベル付きの1行テキスト入力。編集フォーム（教材化プレビュー・チャンク編集）共通。 */
export default function FormField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="t-subtle text-xs">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input mt-0.5 w-full px-2 py-1.5 text-sm"
      />
    </label>
  )
}
