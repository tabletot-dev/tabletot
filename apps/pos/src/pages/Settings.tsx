import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Store, 
  Printer, 
  Bell, 
  CreditCard, 
  Palette, 
  Save,
  Loader2
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function Settings() {
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    // Restaurant Info
    restaurantName: 'My Restaurant',
    address: '123 Main Street, City',
    phone: '+91 9876543210',
    email: 'contact@restaurant.com',
    gst: '',
    
    // Tax Settings
    enableTax: true,
    taxRate: 5,
    taxName: 'GST',
    
    // Printing
    autoPrintKOT: true,
    autoPrintBill: false,
    printerName: '',
    
    // Notifications
    soundNotifications: true,
    newOrderAlert: true,
    
    // Display
    theme: 'system',
    currency: 'INR',
    language: 'en',
  });

  const handleSave = async () => {
    setSaving(true);
    // Simulate saving
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast({ title: 'Settings Saved', description: 'Your settings have been updated successfully' });
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your application preferences</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">
            <Store className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="tax">
            <CreditCard className="h-4 w-4 mr-2" />
            Tax & Billing
          </TabsTrigger>
          <TabsTrigger value="printing">
            <Printer className="h-4 w-4 mr-2" />
            Printing
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="display">
            <Palette className="h-4 w-4 mr-2" />
            Display
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Restaurant Information</CardTitle>
              <CardDescription>Basic details about your restaurant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Restaurant Name</Label>
                  <Input 
                    value={settings.restaurantName}
                    onChange={(e) => setSettings({...settings, restaurantName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input 
                    value={settings.phone}
                    onChange={(e) => setSettings({...settings, phone: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input 
                  value={settings.address}
                  onChange={(e) => setSettings({...settings, address: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input 
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({...settings, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>GST Number</Label>
                  <Input 
                    value={settings.gst}
                    onChange={(e) => setSettings({...settings, gst: e.target.value})}
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tax Settings */}
        <TabsContent value="tax">
          <Card>
            <CardHeader>
              <CardTitle>Tax Configuration</CardTitle>
              <CardDescription>Configure tax settings for billing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Tax</p>
                  <p className="text-sm text-muted-foreground">Apply tax on all orders</p>
                </div>
                <Switch 
                  checked={settings.enableTax}
                  onCheckedChange={(checked) => setSettings({...settings, enableTax: checked})}
                />
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tax Name</Label>
                  <Input 
                    value={settings.taxName}
                    onChange={(e) => setSettings({...settings, taxName: e.target.value})}
                    disabled={!settings.enableTax}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <Input 
                    type="number"
                    value={settings.taxRate}
                    onChange={(e) => setSettings({...settings, taxRate: parseFloat(e.target.value) || 0})}
                    disabled={!settings.enableTax}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Printing Settings */}
        <TabsContent value="printing">
          <Card>
            <CardHeader>
              <CardTitle>Printer Settings</CardTitle>
              <CardDescription>Configure KOT and bill printing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto Print KOT</p>
                  <p className="text-sm text-muted-foreground">Automatically print KOT when order is placed</p>
                </div>
                <Switch 
                  checked={settings.autoPrintKOT}
                  onCheckedChange={(checked) => setSettings({...settings, autoPrintKOT: checked})}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto Print Bill</p>
                  <p className="text-sm text-muted-foreground">Automatically print bill after payment</p>
                </div>
                <Switch 
                  checked={settings.autoPrintBill}
                  onCheckedChange={(checked) => setSettings({...settings, autoPrintBill: checked})}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Printer Name</Label>
                <Input 
                  value={settings.printerName}
                  onChange={(e) => setSettings({...settings, printerName: e.target.value})}
                  placeholder="Default Printer"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Configure alerts and sounds</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sound Notifications</p>
                  <p className="text-sm text-muted-foreground">Play sounds for important events</p>
                </div>
                <Switch 
                  checked={settings.soundNotifications}
                  onCheckedChange={(checked) => setSettings({...settings, soundNotifications: checked})}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">New Order Alert</p>
                  <p className="text-sm text-muted-foreground">Show notification when new order arrives</p>
                </div>
                <Switch 
                  checked={settings.newOrderAlert}
                  onCheckedChange={(checked) => setSettings({...settings, newOrderAlert: checked})}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Display Settings */}
        <TabsContent value="display">
          <Card>
            <CardHeader>
              <CardTitle>Display Settings</CardTitle>
              <CardDescription>Customize appearance and localization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select 
                    value={settings.theme}
                    onValueChange={(value) => setSettings({...settings, theme: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select 
                    value={settings.currency}
                    onValueChange={(value) => setSettings({...settings, currency: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">Indian Rupee (₹)</SelectItem>
                      <SelectItem value="USD">US Dollar ($)</SelectItem>
                      <SelectItem value="EUR">Euro (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select 
                    value={settings.language}
                    onValueChange={(value) => setSettings({...settings, language: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="ta">Tamil</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
