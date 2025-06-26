import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TemplateCard from "@/components/TemplateCard";
import { Search, Filter, Plus } from "lucide-react";

export default function TournamentLibrary() {
  const [searchTerm, setSearchTerm] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["/api/tournament-templates"],
    queryFn: async () => {
      const response = await fetch("/api/tournament-templates", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
  });

  const filteredTemplates = templates?.filter((template: any) => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSite = siteFilter === "all" || template.site === siteFilter;
    const matchesFormat = formatFilter === "all" || template.format === formatFilter;
    const matchesCategory = categoryFilter === "all" || template.category === categoryFilter;
    
    return matchesSearch && matchesSite && matchesFormat && matchesCategory;
  }) || [];

  const sites = [...new Set(templates?.map((t: any) => t.site) || [])];
  const formats = [...new Set(templates?.map((t: any) => t.format) || [])];
  const categories = [...new Set(templates?.map((t: any) => t.category) || [])];

  if (isLoading) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Tournament Library</h2>
          <p className="text-gray-400">Loading your tournament templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Tournament Library</h2>
        <p className="text-gray-400">Organize and analyze your tournament templates</p>
      </div>

      {/* Filters */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tournaments..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-800 border-gray-700 text-white"
                />
              </div>
            </div>
            
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="All Sites" />
              </SelectTrigger>
              <SelectContent className="bg-poker-surface border-gray-700">
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site} value={site}>{site}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={formatFilter} onValueChange={setFormatFilter}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="All Formats" />
              </SelectTrigger>
              <SelectContent className="bg-poker-surface border-gray-700">
                <SelectItem value="all">All Formats</SelectItem>
                {formats.map((format) => (
                  <SelectItem key={format} value={format}>{format}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent className="bg-poker-surface border-gray-700">
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="text-gray-400 mb-4">
              <Plus className="h-16 w-16 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Tournament Templates Found</h3>
              <p>Start by uploading your tournament history to automatically create templates.</p>
            </div>
            <Button 
              onClick={() => window.location.href = "/upload"}
              className="bg-poker-green hover:bg-poker-green-light text-white"
            >
              Upload Tournament History
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template: any) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}
