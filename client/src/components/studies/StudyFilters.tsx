import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";
import { CATEGORIES } from "./types";

interface StudyFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

export function StudyFilters({ searchQuery, onSearchChange, selectedCategory, onCategoryChange }: StudyFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Buscar estudos..."
          className="pl-10 bg-poker-surface border-gray-600 text-white"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Select value={selectedCategory} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-full sm:w-48 bg-poker-surface border-gray-600 text-white">
          <Filter className="w-4 h-4 mr-2" />
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent className="bg-poker-surface border-gray-600">
          <SelectItem value="all">Todas</SelectItem>
          {CATEGORIES.map(category => (
            <SelectItem key={category} value={category}>
              {category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
