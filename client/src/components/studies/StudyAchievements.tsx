import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from "lucide-react";
import { type Achievement } from "./types";

interface StudyAchievementsProps {
  achievements: Achievement[];
}

export function StudyAchievements({ achievements }: StudyAchievementsProps) {
  if (achievements.length === 0) return null;

  return (
    <Card className="bg-poker-surface border-gray-700 mb-6">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-poker-accent" />
          Conquistas Desbloqueadas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {achievements.map((achievement, index) => (
            <div key={index} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
              <div className="text-2xl">{achievement.icon}</div>
              <div>
                <p className={`font-semibold ${achievement.color}`}>
                  {achievement.title}
                </p>
                <p className="text-sm text-gray-400">
                  {achievement.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
