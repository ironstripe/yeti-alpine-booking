import { useNavigate } from "react-router-dom";
import { BookingPortalLayout } from "@/components/booking-portal/BookingPortalLayout";
import { ProductCard } from "@/components/booking-portal/ProductCard";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Gift, Phone, MapPin } from "lucide-react";
import { useState } from "react";

export default function BookingLanding() {
  const navigate = useNavigate();
  const [voucherCode, setVoucherCode] = useState("");

  return (
    <BookingPortalLayout>
      {/* Hero Section */}
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">🎿 🏔️</div>
        <h1 className="text-2xl font-bold mb-2">Buchen Sie Ihren Skikurs</h1>
        <p className="text-muted-foreground">online & einfach</p>
      </div>

      {/* Product Selection */}
      <div className="space-y-4 mb-8">
        <h2 className="font-semibold text-lg">Was möchten Sie buchen?</h2>

        <ProductCard
          icon="👤"
          title="Privatunterricht"
          description="Individueller Unterricht für 1-4 Personen mit persönlichem Skilehrer."
          price="Ab CHF 95.- / Stunde"
          buttonText="Privatstunde anfragen"
          onClick={() => navigate("/book/private")}
        />

        <ProductCard
          icon="👥"
          title="Gruppenkurs"
          description="Lernen in kleinen Gruppen (max. 8 Teilnehmer) mit Gleichgesinnten."
          price="Ab CHF 65.- / Tag"
          buttonText="Gruppenkurs buchen"
          onClick={() => navigate("/book/group")}
        />

        {/* Voucher Section */}
        <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="text-3xl">
                <Gift className="h-8 w-8 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">Gutschein einlösen</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Sie haben einen Gutschein? Lösen Sie ihn hier ein.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value)}
                    placeholder="Gutscheincode eingeben"
                    className="bg-white"
                  />
                  <Button 
                    variant="outline"
                    onClick={() => {
                      if (voucherCode) {
                        navigate(`/book/private?voucher=${voucherCode}`);
                      }
                    }}
                  >
                    Einlösen
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contact Section */}
      <Card className="bg-muted/50">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Lieber telefonisch?</h3>
          <div className="space-y-3">
            <a 
              href="tel:+41811234567" 
              className="flex items-center gap-3 text-primary hover:underline"
            >
              <Phone className="h-5 w-5" />
              <span className="font-medium">+41 81 123 45 67</span>
            </a>
            <p className="text-sm text-muted-foreground ml-8">Mo-Sa 08:00-18:00</p>
            <div className="flex items-center gap-3 text-muted-foreground">
              <MapPin className="h-5 w-5" />
              <div>
                <p className="font-medium text-foreground">Skischule YETY</p>
                <p className="text-sm">Talstation Malbun</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </BookingPortalLayout>
  );
}
