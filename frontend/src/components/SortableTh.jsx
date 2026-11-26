import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react'

export default function SortableTh({
  label,
  sortKey,
  currentSort,
  onSort,
  align = 'left',
  className = '',
  children,
}) {
  const isActive = currentSort?.key === sortKey
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  const justifyClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'

  return (
    <th
      className={`py-2 px-3 ${alignClass} cursor-pointer hover:bg-gray-100 transition-colors select-none group ${className}`}
      onClick={() => onSort(sortKey)}
      title={`Ordenar por ${label || children}`}
    >
      <div className={`flex items-center gap-1 ${justifyClass}`}>
        <span>{children || label}</span>
        {isActive ? (
          currentSort.direction === 'asc' ? (
            <ChevronUp size={14} className="text-gray-700 flex-shrink-0" />
          ) : (
            <ChevronDown size={14} className="text-gray-700 flex-shrink-0" />
          )
        ) : (
          <ArrowUpDown
            size={14}
            className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          />
        )}
      </div>
    </th>
  )
}
