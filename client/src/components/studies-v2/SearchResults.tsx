import { Card, CardContent } from '@/components/ui/card';
import { FileText, ArrowRight } from 'lucide-react';

interface SearchResult {
  tabId: string;
  tabName: string;
  tabTags: string[] | null;
  themeId: string;
  themeName: string;
  themeEmoji: string;
  themeColor: string;
}

interface SearchResultsProps {
  results: SearchResult[];
  onSelectResult: (themeId: string, tabId: string) => void;
  searchTerm: string;
}

export function SearchResults({
  results,
  onSelectResult,
  searchTerm,
}: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">
          Nenhum resultado encontrado para &quot;{searchTerm}&quot;
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-3">
        {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado
        {results.length !== 1 ? 's' : ''}
      </p>
      {results.map((result) => (
        <Card
          key={`${result.themeId}-${result.tabId}`}
          className="bg-gray-800 border-gray-700 hover:border-gray-500 transition-all cursor-pointer"
          style={{ borderLeftWidth: '3px', borderLeftColor: result.themeColor }}
          onClick={() => onSelectResult(result.themeId, result.tabId)}
        >
          <CardContent className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg flex-shrink-0">
                {result.themeEmoji || '\uD83D\uDCDA'}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-gray-400">{result.themeName}</span>
                  <ArrowRight className="h-3 w-3 text-gray-600 flex-shrink-0" />
                  <span className="text-white font-medium truncate">
                    {result.tabName}
                  </span>
                </div>
                {result.tabTags && result.tabTags.length > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    {result.tabTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400 text-[10px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
