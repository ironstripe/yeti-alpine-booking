import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Info } from "lucide-react";
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
import { Product, useCreateProduct, useUpdateProduct } from "@/hooks/useProducts";
import { useEffect } from "react";

const formSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  type: z.enum(["private", "group", "addon"]),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Preis muss positiv sein"),
  duration_minutes: z.coerce.number().min(0).optional(),
  is_active: z.boolean(),
  is_training_product: z.boolean(),
});

type FormData = z.infer<typeof formSchema>;

interface ProductFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
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
      price: 0,
      duration_minutes: 60,
      is_active: true,
      is_training_product: false,
    },
  });

  const productType = form.watch("type");

  useEffect(() => {
    if (product) {
      form.reset({
        name: product.name,
        type: product.type as "private" | "group" | "addon",
        description: product.description || "",
        price: product.price,
        duration_minutes: product.duration_minutes || 60,
        is_active: product.is_active ?? true,
        is_training_product: (product as any).is_training_product ?? false,
      });
    } else {
      form.reset({
        name: "",
        type: "private",
        description: "",
        price: 0,
        duration_minutes: 60,
        is_active: true,
        is_training_product: false,
      });
    }
  }, [product, form]);

  // Auto-suggest training product for group types
  useEffect(() => {
    if (!isEditing && productType === "group") {
      form.setValue("is_training_product", true);
    }
  }, [productType, isEditing, form]);

  const onSubmit = (data: FormData) => {
    const payload = {
      name: data.name,
      type: data.type,
      description: data.description || null,
      price: data.price,
      duration_minutes: data.duration_minutes || null,
      is_active: data.is_active,
      is_training_product: data.is_training_product,
    };

    if (isEditing) {
      updateProduct.mutate(
        { id: product.id, ...payload } as any,
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      createProduct.mutate(
        payload as any,
        { onSuccess: () => onOpenChange(false) }
      );
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Produkt bearbeiten" : "Neues Produkt"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Privatstunde Ski" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preis (CHF) *</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={0} step={0.01} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
            </div>

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

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEditing ? "Speichern" : "Erstellen"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}