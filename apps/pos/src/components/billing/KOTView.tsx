import { useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Printer, X } from 'lucide-react';

interface KOTViewProps {
  kot: any;
  onClose: () => void;
}

export function KOTView({ kot, onClose }: KOTViewProps) {
  useEffect(() => {
    // Auto-print when modal opens
    setTimeout(() => {
      window.print();
    }, 500);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md print:max-w-full">
        <div className="print:hidden flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">KOT Preview</h2>
          <div className="flex gap-2">
            <Button onClick={handlePrint} size="sm">
              <Printer className="h-4 w-4 mr-2" />
              Print Again
            </Button>
            <Button onClick={onClose} size="sm" variant="outline">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* KOT Ticket - Printable */}
        <div className="kot-ticket border p-6 print:border-0 print:p-0">
          <div className="text-center mb-4">
            <h1 className="text-2xl font-bold">KITCHEN ORDER</h1>
            <p className="text-sm text-muted-foreground">KOT #{kot.kot_number}</p>
          </div>

          <Separator className="my-4" />

          <div className="space-y-2 mb-4">
            <div className="flex justify-between">
              <span className="font-semibold">Table:</span>
              <span>{kot.table_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Time:</span>
              <span>{new Date(kot.printed_at).toLocaleTimeString()}</span>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Items */}
          <div className="space-y-4">
            <h3 className="font-bold text-lg">ITEMS:</h3>
            {kot.items.map((item: any, index: number) => (
              <div key={index} className="border-b pb-3">
                <div className="flex justify-between font-semibold">
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                </div>
                
                {item.variants && item.variants.length > 0 && (
                  <div className="ml-4 mt-1 text-sm">
                    {item.variants.map((v: any, i: number) => (
                      <div key={i} className="text-muted-foreground">
                        • {v.name}
                      </div>
                    ))}
                  </div>
                )}

                {item.addons && item.addons.length > 0 && (
                  <div className="ml-4 mt-1 text-sm">
                    {item.addons.map((a: any, i: number) => (
                      <div key={i} className="text-muted-foreground">
                        + {a.name}
                      </div>
                    ))}
                  </div>
                )}

                {item.notes && (
                  <div className="ml-4 mt-2 text-sm p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                    <span className="font-semibold">Note:</span> {item.notes}
                  </div>
                )}
              </div>
            ))}
          </div>

          {kot.special_notes && (
            <>
              <Separator className="my-4" />
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                <p className="font-semibold mb-1">Special Instructions:</p>
                <p>{kot.special_notes}</p>
              </div>
            </>
          )}

          <Separator className="my-6" />

          <div className="text-center text-sm text-muted-foreground">
            <p>Please prepare items as per specifications</p>
            <p className="mt-1">Thank you!</p>
          </div>
        </div>
      </DialogContent>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .kot-ticket, .kot-ticket * {
            visibility: visible;
          }
          .kot-ticket {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            font-family: 'Courier New', monospace;
          }
        }
      `}</style>
    </Dialog>
  );
}
