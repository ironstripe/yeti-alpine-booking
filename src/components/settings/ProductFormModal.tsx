import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Info, TrendingDown, ChevronUp, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ProductWithTiers, useCreateProduct, useUpdateProduct } from "@/hooks/useProducts";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { calculateSavingsPercent, formatPriceCHF, getDefaultPriceTiers } from "@/lib/pricing-utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const priceTierSchema = z.object({
  day_count: z.number().min(1).max(7),
  cumulative_price: z.number().min(0),
});

const formSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  type: z.enum(["private", "group", "addon"]),
  description: z.string().optional(),
  pricing_type: z.enum(["fixed", "tiered", "hourly"]),
  price: z.coerce.number().min(0, "Preis muss positiv sein").optional(),
  duration_minutes: z.coerce.number().min(0).optional(),
  min_age: z.coerce.number().min(0).optional().nullable(),
  max_age: z.coerce.number().min(0).optional().nullable(),
  is_active: z.boolean(),
  is_training_product: z.boolean(),
  price_tiers: z.array(priceTierSchema),
});

type FormData = z.infer<typeof formSchema>;

interface ProductFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithTiers | null;
}

export function ProductFormModal({ open, onOpenChange, product }: ProductFormModalProps) {
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const isEditing = !!product;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "private",
      description: "",
      pricing_type: "fixed",
      price: 0,
      duration_minutes: 60,
      min_age: null,
      max_age: null,
      is_active: true,
      is_training_product: false,
      price_tiers: getDefaultPriceTiers(),
    },
  });

  const productType = form.watch("type");
  const pricingType = form.watch("pricing_type");
  const priceTiers = form.watch("price_tiers") || [];

  useEffect(() => {
    if (product) {
      const existingTiers = product.price_tiers?.length 
        ? product.price_tiers.map(t => ({
            day_count: t.day_count,
            cumulative_price: Number(t.cumulative_price),
          }))
        : getDefaultPriceTiers();
      
      // Ensure all 5 tiers exist
      const fullTiers = getDefaultPriceTiers().map(defaultTier => {
        const existing = existingTiers.find(t => t.day_count === defaultTier.day_count);
        return existing || defaultTier;
      });

      form.reset({
        name: product.name,
        type: product.type as "private" | "group" | "addon",
        description: product.description || "",
        pricing_type: (product.pricing_type as "fixed" | "tiered" | "hourly") || "fixed",
        price: product.price,
        duration_minutes: product.duration_minutes || 60,
        min_age: product.min_age ?? null,
        max_age: product.max_age ?? null,
        is_active: product.is_active ?? true,
        is_training_product: product.is_training_product ?? false,
        price_tiers: fullTiers,
      });
    } else {
      form.reset({
        name: "",
        type: "private",
        description: "",
        pricing_type: "fixed",
        price: 0,
        duration_minutes: 60,
        min_age: null,
        max_age: null,
        is_active: true,
        is_training_product: false,
        price_tiers: getDefaultPriceTiers(),
      });
    }
  }, [product, form, open]);

  // Auto-suggest tiered pricing for group types
  useEffect(() => {
    if (!isEditing && productType === "group") {
      form.setValue("pricing_type", "tiered");
      form.setValue("is_training_product", true);
    }
  }, [productType, isEditing, form]);

  // Calculate tiers with day price for display
  const tiersWithDayPrice = useMemo(() => {
    return priceTiers.map((tier, index) => {
      const prevPrice = index > 0 ? priceTiers[index - 1]?.cumulative_price || 0 : 0;
      const dayPrice = tier.cumulative_price - prevPrice;
      return { ...tier, dayPrice };
    });
  }, [priceTiers]);

  const updateTierPrice = (index: number, price: number) => {
    const newTiers = [...priceTiers];
    newTiers[index] = { ...newTiers[index], cumulative_price: price };
    form.setValue("price_tiers", newTiers);
  };

  const onSubmit = (data: FormData) => {
    const payload: any = {
      name: data.name,
      type: data.type,
      description: data.description || null,
      pricing_type: data.pricing_type,
      price: data.pricing_type === "tiered" ? 0 : (data.price || 0),
      duration_minutes: data.duration_minutes || null,
      min_age: data.min_age || null,
      max_age: data.max_age || null,
      is_active: data.is_active,
      is_training_product: data.is_training_product,
    };

    if (data.pricing_type === "tiered") {
      payload.price_tiers = data.price_tiers.filter(t => t.cumulative_price > 0);
    }

    if (isEditing) {
      updateProduct.mutate(
        { id: product.id, ...payload },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createProduct.mutate(
        payload,
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Produkt bearbeiten" : "Neues Produkt"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-4">
              {/* Product Type */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Produkttyp *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="private">🎿 Privatstunde</SelectItem>
                        <SelectItem value="group">👥 Gruppenkurs</SelectItem>
                        <SelectItem value="addon">🍽️ Zusatzleistung</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="z.B. Gruppenkurs" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beschreibung</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Kurze Beschreibung des Produkts" rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Age constraints for group courses */}
              {productType === "group" && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="min_age"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mindestalter</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            min={0}
                            value={field.value ?? ""} 
                            onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                            placeholder="z.B. 3" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="max_age"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Höchstalter</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            min={0}
                            value={field.value ?? ""} 
                            onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                            placeholder="z.B. 4" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Pricing Type Selection */}
              <div className="space-y-3">
                <FormLabel className="text-base font-medium">Preismodell *</FormLabel>
                <FormField
                  control={form.control}
                  name="pricing_type"
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-3 gap-3"
                    >
                      <label className={cn(
                        "flex flex-col items-center p-4 border rounded-lg cursor-pointer transition-colors",
                        "hover:bg-muted/50",
                        field.value === "fixed" && "border-primary bg-primary/5"
                      )}>
                        <RadioGroupItem value="fixed" className="sr-only" />
                        <span className="text-2xl mb-1">💰</span>
                        <span className="font-medium text-sm">Fixpreis</span>
                        <span className="text-xs text-muted-foreground text-center mt-1">
                          Gleicher Preis pro Tag
                        </span>
                      </label>

                      <label className={cn(
                        "flex flex-col items-center p-4 border rounded-lg cursor-pointer transition-colors relative",
                        "hover:bg-muted/50",
                        field.value === "tiered" && "border-primary bg-primary/5",
                        productType === "group" && field.value !== "tiered" && "ring-2 ring-blue-200"
                      )}>
                        <RadioGroupItem value="tiered" className="sr-only" />
                        <span className="text-2xl mb-1">📊</span>
                        <span className="font-medium text-sm">Staffelpreis</span>
                        <span className="text-xs text-muted-foreground text-center mt-1">
                          Rabatt bei mehr Tagen
                        </span>
                        {productType === "group" && field.value !== "tiered" && (
                          <Badge variant="secondary" className="absolute -top-2 -right-2 text-xs">
                            Empfohlen
                          </Badge>
                        )}
                      </label>

                      <label className={cn(
                        "flex flex-col items-center p-4 border rounded-lg cursor-pointer transition-colors",
                        "hover:bg-muted/50",
                        field.value === "hourly" && "border-primary bg-primary/5"
                      )}>
                        <RadioGroupItem value="hourly" className="sr-only" />
                        <span className="text-2xl mb-1">⏱️</span>
                        <span className="font-medium text-sm">Stundenpreis</span>
                        <span className="text-xs text-muted-foreground text-center mt-1">
                          Preis pro Stunde
                        </span>
                      </label>
                    </RadioGroup>
                  )}
                />
              </div>

              {/* Fixed/Hourly Price Input */}
              {(pricingType === "fixed" || pricingType === "hourly") && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {pricingType === "hourly" ? "Preis pro Stunde (CHF) *" : "Preis (CHF) *"}
                        </FormLabel>
                        <FormControl>
                          <Input {...field} type="number" min={0} step={0.01} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {pricingType === "fixed" && (
                    <FormField
                      control={form.control}
                      name="duration_minutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Dauer (Min.)</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" min={0} step={15} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}

              {/* Tiered Pricing Editor */}
              {pricingType === "tiered" && (
                <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Gib den <strong>Gesamtpreis</strong> für die jeweilige Anzahl Tage ein.
                      Die Ersparnis gegenüber dem Tagespreis wird automatisch berechnet.
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground px-2">
                      <div className="col-span-2">Tage</div>
                      <div className="col-span-4">Gesamtpreis</div>
                      <div className="col-span-3">Pro Tag</div>
                      <div className="col-span-3">Ersparnis</div>
                    </div>

                    {/* Tier Rows */}
                    {tiersWithDayPrice.map((tier, index) => {
                      const validTiers = priceTiers
                        .filter((t): t is { day_count: number; cumulative_price: number } => 
                          typeof t.day_count === 'number' && typeof t.cumulative_price === 'number'
                        );
                      const savings = calculateSavingsPercent(validTiers, tier.day_count);
                      
                      return (
                        <div 
                          key={tier.day_count}
                          className="grid grid-cols-12 gap-2 items-center"
                        >
                          {/* Day Count */}
                          <div className="col-span-2 flex items-center gap-1 px-2">
                            <span className="text-lg font-semibold">{tier.day_count}</span>
                            <span className="text-sm text-muted-foreground">
                              {tier.day_count === 1 ? "Tag" : "Tage"}
                            </span>
                          </div>

                          {/* Cumulative Price Input */}
                          <div className="col-span-4">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                CHF
                              </span>
                              <Input
                                type="number"
                                step="0.05"
                                className="pl-12"
                                value={tier.cumulative_price || ""}
                                onChange={(e) => updateTierPrice(index, parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                              />
                            </div>
                          </div>

                          {/* Per-Day Price (calculated) */}
                          <div className="col-span-3 px-2">
                            {tier.cumulative_price > 0 && (
                              <span className="text-sm text-muted-foreground">
                                {index === 0 ? (
                                  formatPriceCHF(tier.dayPrice)
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <span>+</span>
                                    <span>{formatPriceCHF(tier.dayPrice)}</span>
                                  </span>
                                )}
                              </span>
                            )}
                          </div>

                          {/* Savings Badge */}
                          <div className="col-span-3 px-2">
                            {savings > 0 && (
                              <Badge 
                                variant="secondary" 
                                className="bg-green-100 text-green-800 flex items-center gap-1 w-fit"
                              >
                                <TrendingDown className="h-3 w-3" />
                                {savings}% gespart
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Preview Card */}
                  {priceTiers.some(t => t.cumulative_price > 0) && (
                    <div className="mt-4 p-4 bg-background rounded-lg border">
                      <div className="text-sm font-medium mb-3">Kundenansicht (Vorschau):</div>
                      <div className="grid grid-cols-5 gap-2">
                        {tiersWithDayPrice
                          .filter(t => t.cumulative_price > 0)
                          .map(tier => {
                            const validTiers = priceTiers
                              .filter((t): t is { day_count: number; cumulative_price: number } => 
                                typeof t.day_count === 'number' && typeof t.cumulative_price === 'number'
                              );
                            const savings = calculateSavingsPercent(validTiers, tier.day_count);
                            return (
                              <div 
                                key={tier.day_count}
                                className="p-3 bg-muted rounded-lg text-center"
                              >
                                <div className="text-xs text-muted-foreground mb-1">
                                  {tier.day_count} {tier.day_count === 1 ? "Tag" : "Tage"}
                                </div>
                                <div className="font-semibold">
                                  CHF {tier.cumulative_price.toFixed(0)}
                                </div>
                                {savings > 0 && (
                                  <div className="text-xs text-green-600 mt-1">
                                    -{savings}%
                                  </div>
                                )}
                              </div>
                            );
                          })
                        }
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Training Product Toggle */}
              <FormField
                control={form.control}
                name="is_training_product"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base flex items-center gap-2">
                        🔗 Für Trainings verfügbar
                      </FormLabel>
                      <FormDescription>
                        Dieses Produkt kann mit Trainings verknüpft werden
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {form.watch("is_training_product") && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Wenn dieses Produkt mit Trainings verknüpft ist, wird der hier definierte Preis 
                    automatisch für alle verknüpften Trainings verwendet.
                  </span>
                </div>
              )}

              {/* Active Toggle */}
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Aktiv</FormLabel>
                      <FormDescription>
                        Produkt kann gebucht werden
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </ScrollArea>
        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Speichern" : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
