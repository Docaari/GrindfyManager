import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TemplateCard from "@/components/TemplateCard";
import { Search, Filter, Plus, Calendar, Clock, Trophy, Target, Users, TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function TournamentLibrary() {
  const [searchTerm, setSearchTerm] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [speedFilter, setSpeedFilter] = useState("all");
  const [buyinRangeFilter, setBuyinRangeFilter] = useState("all");
  const [roiFilter, setRoiFilter] = useState("all");
  const [sortBy, setSortBy] = useState("roi");
  const [sortOrder, setSortOrder] = useState("desc");
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ["/api/tournament-templates"],
  });

  const { data: customGroups } = useQuery({
    queryKey: ["/api/custom-groups"],
  });

  // Advanced filtering and sorting logic
  const filteredTemplates = (templates || []).filter((template: any) => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSite = siteFilter === "all" || template.site === siteFilter;
    const matchesFormat = formatFilter === "all" || template.format === formatFilter;
    const matchesCategory = categoryFilter === "all" || template.category === categoryFilter;
    const matchesSpeed = speedFilter === "all" || template.speed === speedFilter;
    
    // Buy-in range filtering
    const buyinRange = getBuyinRange(template.avgBuyIn);
    const matchesBuyinRange = buyinRangeFilter === "all" || buyinRange === buyinRangeFilter;
    
    // ROI filtering
    const roiValue = parseFloat(template.avgRoi) || 0;
    const matchesRoi = roiFilter === "all" || 
      (roiFilter === "positive" && roiValue > 0) ||
      (roiFilter === "negative" && roiValue < 0) ||
      (roiFilter === "high" && roiValue > 20) ||
      (roiFilter === "medium" && roiValue >= 0 && roiValue <= 20);
    
    return matchesSearch && matchesSite && matchesFormat && matchesCategory && 
           matchesSpeed && matchesBuyinRange && matchesRoi;
  }).sort((a: any, b: any) => {
    const aValue = getSortValue(a, sortBy);
    const bValue = getSortValue(b, sortBy);
    return sortOrder === "desc" ? bValue - aValue : aValue - bValue;
  });

  // Helper functions for filtering
  const getBuyinRange = (buyin: number) => {
    if (buyin <= 5) return "micro";
    if (buyin <= 25) return "low";
    if (buyin <= 100) return "mid";
    if (buyin <= 500) return "high";
    return "premium";
  };

  const getSortValue = (template: any, sortField: string) => {
    switch (sortField) {
      case "roi": return parseFloat(template.avgRoi) || 0;
      case "profit": return parseFloat(template.totalProfit) || 0;
      case "volume": return template.totalPlayed || 0;
      case "buyin": return template.avgBuyIn || 0;
      default: return 0;
    }
  };

  const sites = Array.from(new Set((templates || []).map((t: any) => t.site)));
  const formats = Array.from(new Set((templates || []).map((t: any) => t.format)));
  const categories = Array.from(new Set((templates || []).map((t: any) => t.category)));

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
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Tournament Library</h2>
            <p className="text-gray-400">Organize and analyze your tournament templates</p>
            <div className="flex gap-4 mt-3">
              <Badge variant="outline" className="text-green-400 border-green-400">
                <Trophy className="w-3 h-3 mr-1" />
                {filteredTemplates.length} Templates
              </Badge>
              {filteredTemplates.length > 0 && (
                <Badge variant="outline" className="text-blue-400 border-blue-400">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Avg ROI: {(filteredTemplates.reduce((sum: number, t: any) => sum + (parseFloat(t.avgRoi) || 0), 0) / filteredTemplates.length).toFixed(1)}%
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Users className="w-4 h-4 mr-2" />
                  Create Group
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Create Custom Group</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Group similar tournaments for better analysis
                  </DialogDescription>
                </DialogHeader>
                {/* Group creation form will be added */}
              </DialogContent>
            </Dialog>
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Advanced Filters & Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="filters" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-800">
              <TabsTrigger value="filters" className="data-[state=active]:bg-green-600">
                Filters
              </TabsTrigger>
              <TabsTrigger value="performance" className="data-[state=active]:bg-green-600">
                Performance
              </TabsTrigger>
              <TabsTrigger value="groups" className="data-[state=active]:bg-green-600">
                Custom Groups
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="filters" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                <div className="lg:col-span-2">
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
                    {sites.map((site: string) => (
                      <SelectItem key={site} value={site}>{site}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent className="bg-poker-surface border-gray-700">
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category: string) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={buyinRangeFilter} onValueChange={setBuyinRangeFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Buy-in Range" />
                  </SelectTrigger>
                  <SelectContent className="bg-poker-surface border-gray-700">
                    <SelectItem value="all">All Stakes</SelectItem>
                    <SelectItem value="micro">Micro ($0-$5)</SelectItem>
                    <SelectItem value="low">Low ($5-$25)</SelectItem>
                    <SelectItem value="mid">Mid ($25-$100)</SelectItem>
                    <SelectItem value="high">High ($100-$500)</SelectItem>
                    <SelectItem value="premium">Premium ($500+)</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={roiFilter} onValueChange={setRoiFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="ROI Filter" />
                  </SelectTrigger>
                  <SelectContent className="bg-poker-surface border-gray-700">
                    <SelectItem value="all">All ROI</SelectItem>
                    <SelectItem value="positive">Positive ROI</SelectItem>
                    <SelectItem value="negative">Negative ROI</SelectItem>
                    <SelectItem value="high">High ROI (&gt;20%)</SelectItem>
                    <SelectItem value="medium">Medium ROI (0-20%)</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={speedFilter} onValueChange={setSpeedFilter}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Speed" />
                  </SelectTrigger>
                  <SelectContent className="bg-poker-surface border-gray-700">
                    <SelectItem value="all">All Speeds</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Turbo">Turbo</SelectItem>
                    <SelectItem value="Hyper">Hyper</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-gray-700">
                <div className="flex gap-2 items-center">
                  <span className="text-sm text-gray-400">Sort by:</span>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-poker-surface border-gray-700">
                      <SelectItem value="roi">ROI</SelectItem>
                      <SelectItem value="profit">Total Profit</SelectItem>
                      <SelectItem value="volume">Volume</SelectItem>
                      <SelectItem value="buyin">Buy-in</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                    className="border-gray-700"
                  >
                    {sortOrder === "desc" ? "↓" : "↑"}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="h-4 w-4 text-yellow-400" />
                      <span className="text-sm text-gray-400">Best ROI Templates</span>
                    </div>
                    <div className="text-lg font-bold text-white">
                      {filteredTemplates.length > 0 ? 
                        Math.max(...filteredTemplates.map((t: any) => parseFloat(t.avgRoi) || 0)).toFixed(1) + '%'
                        : '0%'
                      }
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-green-400" />
                      <span className="text-sm text-gray-400">Total Templates</span>
                    </div>
                    <div className="text-lg font-bold text-white">{filteredTemplates.length}</div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-800 border-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-blue-400" />
                      <span className="text-sm text-gray-400">Most Played</span>
                    </div>
                    <div className="text-lg font-bold text-white">
                      {filteredTemplates.length > 0 ? 
                        Math.max(...filteredTemplates.map((t: any) => t.totalPlayed || 0)) + ' times'
                        : '0 times'
                      }
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="groups" className="space-y-4">
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Custom Groups</h3>
                <p className="text-gray-400 mb-4">Create custom groups to organize tournaments by your criteria</p>
                <Button className="bg-green-600 hover:bg-green-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Group
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="text-gray-400 mb-4">
              <Trophy className="h-16 w-16 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Tournament Templates Found</h3>
              <p>Start by uploading your tournament history to automatically create templates.</p>
            </div>
            <Button 
              onClick={() => window.location.href = "/upload"}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              Upload Tournament History
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template: any) => (
            <TemplateCard 
              key={template.id} 
              template={template}
              onEdit={(template) => console.log('Edit template:', template)}
              onAddToPlan={(template) => console.log('Add to plan:', template)}
            />
          ))}
        </div>
      )}
    </div>
  );
}