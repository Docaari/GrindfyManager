export function LoadingScreen() {
  return (
    <div className="w-full px-6 py-6">
      {/* Header skeleton */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="h-8 w-32 bg-gray-700 rounded animate-pulse mb-2" />
          <div className="h-4 w-48 bg-gray-700/60 rounded animate-pulse" />
        </div>
        <div className="h-8 w-8 bg-gray-700 rounded animate-pulse" />
      </div>

      {/* Summary bar skeleton */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg px-6 py-3 mb-4">
        <div className="flex gap-1 mb-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-14 bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="bg-gray-800/50 rounded-lg p-3 text-center">
              <div className="h-3 w-16 bg-gray-700/60 rounded animate-pulse mx-auto mb-2" />
              <div className="h-6 w-12 bg-gray-700 rounded animate-pulse mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="w-20 bg-gray-900 border border-gray-700 p-2">
                  <div className="h-4 w-10 bg-gray-700 rounded animate-pulse mx-auto" />
                </th>
                {Array.from({ length: 7 }).map((_, i) => (
                  <th key={i} className="bg-gray-900 border border-gray-700 p-2">
                    <div className="h-5 w-8 bg-gray-700 rounded animate-pulse mx-auto mb-1" />
                    <div className="flex justify-center gap-1">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <div key={j} className="w-9 h-7 bg-gray-700 rounded animate-pulse" />
                      ))}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, row) => (
                <tr key={row}>
                  <td className="bg-gray-900 border border-gray-700 p-1 w-20">
                    <div className="h-4 w-12 bg-gray-700/60 rounded animate-pulse mx-auto" />
                  </td>
                  {Array.from({ length: 7 }).map((_, col) => (
                    <td key={col} className="border border-gray-700/70 p-2 bg-gray-800">
                      <div className="h-8 bg-gray-700 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
