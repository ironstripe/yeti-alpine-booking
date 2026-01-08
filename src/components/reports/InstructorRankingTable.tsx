import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { InstructorStats } from "@/hooks/useReportsData";

interface InstructorRankingTableProps {
  data: InstructorStats[] | undefined;
  isLoading: boolean;
}

export function InstructorRankingTable({ data, isLoading }: InstructorRankingTableProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Skilehrer-Ranking (nach Stunden)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const totalPrivate = data?.reduce((sum, i) => sum + i.privateHours, 0) || 0;
  const totalGroup = data?.reduce((sum, i) => sum + i.groupHours, 0) || 0;
  const totalHours = data?.reduce((sum, i) => sum + i.totalHours, 0) || 0;
  const avgUtilization = data?.length 
    ? Math.round(data.reduce((sum, i) => sum + i.utilization, 0) / data.length) 
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skilehrer-Ranking (nach Stunden)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Rang</TableHead>
              <TableHead>Skilehrer</TableHead>
              <TableHead className="text-right">Stunden</TableHead>
              <TableHead className="text-right">Privat</TableHead>
              <TableHead className="text-right">Gruppe</TableHead>
              <TableHead className="text-right">Auslastung</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.slice(0, 10).map((instructor, index) => (
              <TableRow 
                key={instructor.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/instructors/${instructor.id}`)}
              >
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>{instructor.name}</TableCell>
                <TableCell className="text-right font-medium">{instructor.totalHours}h</TableCell>
                <TableCell className="text-right">{instructor.privateHours}h</TableCell>
                <TableCell className="text-right">{instructor.groupHours}h</TableCell>
                <TableCell className="text-right">
                  <Badge variant={instructor.utilization >= 70 ? "default" : instructor.utilization >= 50 ? "secondary" : "outline"}>
                    {instructor.utilization}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-bold border-t-2">
              <TableCell></TableCell>
              <TableCell>TOTAL ({data?.length || 0} Lehrer)</TableCell>
              <TableCell className="text-right">{totalHours}h</TableCell>
              <TableCell className="text-right">{totalPrivate}h</TableCell>
              <TableCell className="text-right">{totalGroup}h</TableCell>
              <TableCell className="text-right">
                <Badge variant="outline">{avgUtilization}%</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
