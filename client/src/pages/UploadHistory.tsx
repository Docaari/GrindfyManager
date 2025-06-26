import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import FileUpload from "@/components/FileUpload";
import { Upload, CheckCircle, AlertCircle, FileText, Database, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UploadHistory {
  id: string;
  filename: string;
  status: "success" | "error" | "processing";
  tournamentsCount: number;
  uploadDate: string;
  errorMessage?: string;
}

export default function UploadHistory() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tournaments } = useQuery({
    queryKey: ["/api/tournaments"],
    queryFn: async () => {
      const response = await fetch("/api/tournaments", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch tournaments");
      return response.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch("/api/upload-history", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setIsUploading(false);
      setUploadProgress(0);
      
      // Add to upload history
      const newHistoryItem: UploadHistory = {
        id: Date.now().toString(),
        filename: data.filename || "Unknown file",
        status: "success",
        tournamentsCount: data.count || 0,
        uploadDate: new Date().toISOString()
      };
      
      setUploadHistory(prev => [newHistoryItem, ...prev]);
      
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tournament-templates"] });
      
      toast({
        title: "Upload Successful",
        description: `Successfully imported ${data.count || 0} tournaments`,
      });
    },
    onError: (error: Error) => {
      setIsUploading(false);
      setUploadProgress(0);
      
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    uploadMutation.mutate(file);
  };

  const handleDeleteHistory = (id: string) => {
    setUploadHistory(prev => prev.filter(item => item.id !== id));
    toast({
      title: "History Deleted",
      description: "Upload history item has been removed",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      case "processing":
        return <div className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />;
      default:
        return <FileText className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-600 text-white">Success</Badge>;
      case "error":
        return <Badge className="bg-red-600 text-white">Error</Badge>;
      case "processing":
        return <Badge className="bg-blue-600 text-white">Processing</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const supportedSites = [
    { name: "PokerStars", icon: "⭐" },
    { name: "PartyPoker", icon: "🎉" },
    { name: "888poker", icon: "🎰" },
    { name: "GGPoker", icon: "🌟" },
    { name: "WPN Network", icon: "🌐" },
    { name: "iPoker Network", icon: "🎯" }
  ];

  return (
    <div className="p-6 text-white">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Upload Tournament History</h2>
        <p className="text-gray-400">Import your tournament data from poker sites</p>
      </div>

      {/* Upload Section */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Upload className="h-5 w-5" />
            File Upload
          </CardTitle>
          <CardDescription className="text-gray-400">
            Upload your tournament history files (.txt, .csv, .xlsx)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileUpload
            onFileSelect={handleFileUpload}
            isUploading={isUploading}
            accept=".txt,.csv,.xlsx,.xls"
          />
          
          {isUploading && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Uploading...</span>
                <span className="text-sm text-white">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supported Sites */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white">Supported Poker Sites</CardTitle>
          <CardDescription className="text-gray-400">
            We support tournament history files from these major poker sites
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {supportedSites.map((site) => (
              <div key={site.name} className="flex flex-col items-center p-3 bg-gray-800 rounded-lg">
                <div className="text-2xl mb-2">{site.icon}</div>
                <span className="text-sm text-white text-center">{site.name}</span>
                <div className="flex items-center mt-1">
                  <CheckCircle className="h-3 w-3 text-green-400 mr-1" />
                  <span className="text-xs text-green-400">Supported</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upload History */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Database className="h-5 w-5" />
            Upload History
          </CardTitle>
          <CardDescription className="text-gray-400">
            Recent file uploads and their processing status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uploadHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No upload history yet</p>
              <p className="text-sm">Upload your first tournament history file above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {uploadHistory.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(item.status)}
                    <div>
                      <p className="text-white font-medium">{item.filename}</p>
                      <p className="text-sm text-gray-400">
                        {new Date(item.uploadDate).toLocaleDateString()} at{" "}
                        {new Date(item.uploadDate).toLocaleTimeString()}
                      </p>
                      {item.errorMessage && (
                        <p className="text-sm text-red-400 mt-1">{item.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {getStatusBadge(item.status)}
                    {item.status === "success" && (
                      <div className="text-right">
                        <p className="text-white font-mono">{item.tournamentsCount.toLocaleString()}</p>
                        <p className="text-xs text-gray-400">tournaments</p>
                      </div>
                    )}
                    <Button
                      onClick={() => handleDeleteHistory(item.id)}
                      variant="ghost"
                      size="sm"
                      className="text-gray-400 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Database Stats */}
      <Card className="bg-poker-surface border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Database Statistics</CardTitle>
          <CardDescription className="text-gray-400">
            Current state of your tournament database
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-poker-gold mb-1">
                {tournaments?.length?.toLocaleString() || 0}
              </div>
              <div className="text-sm text-gray-400">Total Tournaments</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-1">
                {uploadHistory.filter(h => h.status === "success").length}
              </div>
              <div className="text-sm text-gray-400">Successful Uploads</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white mb-1">
                {uploadHistory.reduce((sum, h) => sum + (h.status === "success" ? h.tournamentsCount : 0), 0).toLocaleString()}
              </div>
              <div className="text-sm text-gray-400">Imported Tournaments</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="bg-poker-surface border-gray-700 mt-6">
        <CardHeader>
          <CardTitle className="text-white">Need Help?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-gray-400">
            <p>
              <strong className="text-white">File Formats:</strong> We support .txt, .csv, and Excel files (.xlsx, .xls)
            </p>
            <p>
              <strong className="text-white">PokerStars:</strong> Export from Request My Data or hand history files
            </p>
            <p>
              <strong className="text-white">PartyPoker:</strong> Download tournament summary from account section
            </p>
            <p>
              <strong className="text-white">Other Sites:</strong> Most tournament export formats are supported
            </p>
            <p>
              <strong className="text-white">File Size:</strong> Maximum file size is 50MB per upload
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
