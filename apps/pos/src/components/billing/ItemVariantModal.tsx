import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Minus, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Variant {
  id: string;
  variant_type: string;
  variant_name: string;
  price_modifier: number;
}

interface Addon {
  id: string;
  addon_name: string;
  price: number;
}

interface ItemVariantModalProps {
  item: any;
  onClose: () => void;
  onAdd: (item: any) => void;
}

export function ItemVariantModal({ item, onClose, onAdd }: ItemVariantModalProps) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, Variant>>({});
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVariantsAndAddons();
  }, [item.id]);

  const fetchVariantsAndAddons = async () => {
    const [variantsRes, addonsRes] = await Promise.all([
      supabase.from('item_variants').select('*').eq('menu_item_id', item.id),
      supabase.from('item_addons').select('*').eq('menu_item_id', item.id).eq('is_available', true),
    ]);

    if (variantsRes.error) {
      toast({ title: 'Error', description: variantsRes.error.message, variant: 'destructive' });
    } else {
      setVariants(variantsRes.data || []);
      
      // Group variants by type and set defaults
      const variantTypes = [...new Set(variantsRes.data?.map((v) => v.variant_type) || [])];
      const defaults: Record<string, Variant> = {};
      variantTypes.forEach((type) => {
        const defaultVariant = variantsRes.data?.find(
          (v) => v.variant_type === type && v.is_default
        );
        if (defaultVariant) {
          defaults[type] = defaultVariant;
        }
      });
      setSelectedVariants(defaults);
    }

    if (addonsRes.error) {
      toast({ title: 'Error', description: addonsRes.error.message, variant: 'destructive' });
    } else {
      setAddons(addonsRes.data || []);
    }

    setLoading(false);
  };

  const variantTypes = [...new Set(variants.map((v) => v.variant_type))];

  const calculateTotal = () => {
    let total = item.price;
    
    // Add variant modifiers
    Object.values(selectedVariants).forEach((variant) => {
      total += parseFloat(variant.price_modifier.toString());
    });
    
    // Add addon prices
    selectedAddons.forEach((addonId) => {
      const addon = addons.find((a) => a.id === addonId);
      if (addon) {
        total += parseFloat(addon.price.toString());
      }
    });
    
    return total * quantity;
  };

  const handleAdd = () => {
    const selectedVariantsList = Object.values(selectedVariants).map((v) => ({
      type: v.variant_type,
      name: v.variant_name,
      price: parseFloat(v.price_modifier.toString()),
    }));

    const selectedAddonsList = Array.from(selectedAddons)
      .map((id) => {
        const addon = addons.find((a) => a.id === id);
        return addon ? { name: addon.addon_name, price: parseFloat(addon.price.toString()) } : null;
      })
      .filter(Boolean);

    onAdd({
      menu_item_id: item.id,
      name: item.name,
      price: item.price,
      quantity,
      variants: selectedVariantsList,
      addons: selectedAddonsList,
      notes,
      total: calculateTotal(),
    });

    toast({ title: 'Added to cart', description: `${item.name} added successfully` });
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Variants */}
          {variantTypes.map((type) => {
            const typeVariants = variants.filter((v) => v.variant_type === type);
            return (
              <div key={type} className="space-y-3">
                <Label className="text-base capitalize">{type.replace('_', ' ')}</Label>
                <RadioGroup
                  value={selectedVariants[type]?.id}
                  onValueChange={(value) => {
                    const variant = typeVariants.find((v) => v.id === value);
                    if (variant) {
                      setSelectedVariants((prev) => ({ ...prev, [type]: variant }));
                    }
                  }}
                >
                  {typeVariants.map((variant) => (
                    <div key={variant.id} className="flex items-center justify-between space-x-2 p-3 border rounded-lg">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value={variant.id} id={variant.id} />
                        <label htmlFor={variant.id} className="cursor-pointer">
                          {variant.variant_name}
                        </label>
                      </div>
                      {variant.price_modifier !== 0 && (
                        <Badge variant="secondary">
                          +₹{variant.price_modifier}
                        </Badge>
                      )}
                    </div>
                  ))}
                </RadioGroup>
              </div>
            );
          })}

          {/* Addons */}
          {addons.length > 0 && (
            <div className="space-y-3">
              <Label className="text-base">Add-ons</Label>
              <div className="space-y-2">
                {addons.map((addon) => (
                  <div key={addon.id} className="flex items-center justify-between space-x-2 p-3 border rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={addon.id}
                        checked={selectedAddons.has(addon.id)}
                        onCheckedChange={(checked) => {
                          setSelectedAddons((prev) => {
                            const newSet = new Set(prev);
                            if (checked) {
                              newSet.add(addon.id);
                            } else {
                              newSet.delete(addon.id);
                            }
                            return newSet;
                          });
                        }}
                      />
                      <label htmlFor={addon.id} className="cursor-pointer">
                        {addon.addon_name}
                      </label>
                    </div>
                    <Badge variant="secondary">+₹{addon.price}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Special Notes */}
          <div className="space-y-3">
            <Label htmlFor="notes">Special Instructions</Label>
            <Textarea
              id="notes"
              placeholder="e.g., Less Spicy, No Onions"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Quantity */}
          <div className="space-y-3">
            <Label>Quantity</Label>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="text-2xl font-bold w-12 text-center">{quantity}</span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-2xl font-bold">₹{calculateTotal().toFixed(2)}</div>
          <Button onClick={handleAdd} size="lg">
            Add to Cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
