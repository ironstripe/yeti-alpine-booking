import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

const BookingDetail = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <>
      <PageHeader
        title="Buchungsdetails"
        description={`Ticket-ID: ${id}`}
      />

      <Card className="bg-card">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold font-display mb-2">
              Buchungsdetails
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              Die Detailansicht für Buchungen wird in Kürze implementiert.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default BookingDetail;
