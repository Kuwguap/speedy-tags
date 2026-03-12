import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type ServiceRecord, type OrderRecord, type AdminStats, type TelegramDispatcher } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Car,
  LayoutGrid,
  ShoppingCart,
  Trash2,
  Plus,
  ArrowLeft,
  BarChart3,
  DollarSign,
  Database,
  Send,
  LogOut,
  CheckCircle2,
  XCircle,
  Settings as SettingsIcon,
} from "lucide-react";
import AdminLogin from "./AdminLogin";

export default function Admin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<"services" | "orders" | "analytics" | "settings">("analytics");
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [form, setForm] = useState({ title: "", description: "", price: "", image: "" });
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<{
    tagPrice: number;
    insuranceMonthlyPrice: number;
    insuranceYearlyPrice: number;
    overnightFedexFee: number;
    testMode: boolean;
    telegramDispatchers: TelegramDispatcher[];
    fallbackClaimTimeoutMs: number;
  } | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;

  const reload = async () => {
    const t = localStorage.getItem("admin_token");
    if (!t) return;
    setLoading(true);
    try {
      const [svc, ord, st, sett] = await Promise.all([
        api.getServicesAdmin(),
        api.getOrders(),
        api.getStats(),
        api.getSettings(),
      ]);
      setServices(svc);
      setOrders(ord);
      setStats(st);
      setSettings(sett);
      setIsAuthenticated(true);
    } catch (err) {
      if (err instanceof Error && (err.message.includes("401") || err.message.includes("Unauthorized"))) {
        localStorage.removeItem("admin_token");
        setIsAuthenticated(false);
      } else {
        toast({ title: "Failed to load data", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = localStorage.getItem("admin_token");
    if (t) {
      reload().finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setIsAuthenticated(false);
    navigate("/admin");
  };

  const handleAdd = async () => {
    if (!form.title || !form.description || !form.price) {
      toast({ title: "Missing fields", description: "Please fill in title, description, and price.", variant: "destructive" });
      return;
    }
    try {
      await api.addService({
        title: form.title,
        description: form.description,
        price: parseFloat(form.price),
        image: form.image,
      });
      setForm({ title: "", description: "", price: "", image: "" });
      reload();
      toast({ title: "Service added!" });
    } catch {
      toast({ title: "Failed to add service", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteService(id);
      reload();
      toast({ title: "Service deleted." });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSettingsSaving(true);
    try {
      const updated = await api.updateSettings({
        insuranceMonthlyPrice: settings.insuranceMonthlyPrice,
        insuranceYearlyPrice: settings.insuranceYearlyPrice,
        overnightFedexFee: settings.overnightFedexFee ?? 50,
        testMode: settings.testMode,
        telegramDispatchers: settings.telegramDispatchers ?? [],
        fallbackClaimTimeoutMs: settings.fallbackClaimTimeoutMs ?? 45000,
      });
      setSettings(updated);
      toast({ title: "Settings saved!" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSettingsSaving(false);
    }
  };

  const addDispatcher = () => {
    setSettings((s) =>
      s ? { ...s, telegramDispatchers: [...(s.telegramDispatchers ?? []), { dispatcherId: "", groupId: "", groupName: "" }] } : s
    );
  };

  const updateDispatcher = (index: number, field: keyof TelegramDispatcher, value: string) => {
    setSettings((s) => {
      if (!s?.telegramDispatchers) return s;
      const next = [...s.telegramDispatchers];
      next[index] = { ...next[index], [field]: value };
      return { ...s, telegramDispatchers: next };
    });
  };

  const removeDispatcher = (index: number) => {
    setSettings((s) => {
      if (!s?.telegramDispatchers) return s;
      return { ...s, telegramDispatchers: s.telegramDispatchers.filter((_, i) => i !== index) };
    });
  };

  const navItems = [
    { key: "analytics" as const, label: "Analytics", icon: BarChart3 },
    { key: "orders" as const, label: "Orders", icon: ShoppingCart },
    { key: "services" as const, label: "Services", icon: LayoutGrid },
    { key: "settings" as const, label: "Settings", icon: SettingsIcon },
  ];

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AdminLogin
        onSuccess={() => {
          setIsAuthenticated(true);
          reload();
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
        <div className="p-5 border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-sidebar-primary">
              <Car className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold text-sidebar-primary-foreground">TriStateTags</span>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                view === item.key
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive">
            <LogOut className="h-4 w-4 mr-2" /> Log out
          </Button>
          <Button variant="ghost" size="sm" asChild className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground">
            <Link to="/" className="gap-2"><ArrowLeft className="h-4 w-4" /> Back to Site</Link>
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 bg-background p-6 md:p-10 overflow-auto">
        {view === "analytics" && (
          <div className="space-y-8 max-w-5xl">
            <h1 className="font-display text-2xl font-bold text-foreground">Analytics</h1>

            {stats && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Database className="h-4 w-4" /> Data in site
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-display font-bold">{stats.ordersCount}</p>
                      <p className="text-sm text-muted-foreground">Total orders stored</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <DollarSign className="h-4 w-4" /> Payments
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-3xl font-display font-bold">${stats.totalPayments.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">Total revenue</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Send className="h-4 w-4" /> Telegram
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-lg font-display font-semibold">
                        {stats.telegramConfigured ? (
                          <span className="text-success">Configured</span>
                        ) : (
                          <span className="text-destructive">Not configured</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {stats.telegramRecipients?.length || 0} recipient(s)
                      </p>
                      {stats.telegramRecipients?.length ? (
                        <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                          {stats.telegramRecipients.join(", ")}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border/50 overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-lg">Telegram delivery status by order</CardTitle>
                    <p className="text-sm text-muted-foreground">Which orders were sent to Telegram and to whom</p>
                  </CardHeader>
                  <CardContent className="p-0">
                    {stats.ordersWithTelegramStatus?.length === 0 ? (
                      <p className="p-6 text-muted-foreground">No orders yet.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Order</TableHead>
                              <TableHead>Service</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Sent to Telegram</TableHead>
                              <TableHead>Recipients</TableHead>
                              <TableHead>Errors</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.ordersWithTelegramStatus?.map((o) => (
                              <TableRow key={o.id}>
                                <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}…</TableCell>
                                <TableCell>{o.serviceTitle}</TableCell>
                                <TableCell>${o.price.toFixed(2)}</TableCell>
                                <TableCell className="text-sm">{new Date(o.createdAt).toLocaleString()}</TableCell>
                                <TableCell>
                                  {o.telegramSent ? (
                                    <Badge variant="secondary" className="bg-success/10 text-success">
                                      <CheckCircle2 className="h-3 w-3 mr-1" /> Yes
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                                      <XCircle className="h-3 w-3 mr-1" /> No
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs font-mono">
                                  {o.telegramRecipients?.length ? o.telegramRecipients.join(", ") : "—"}
                                </TableCell>
                                <TableCell className="text-xs text-destructive">
                                  {o.telegramErrors?.length
                                    ? o.telegramErrors.map((e) => `${e.chatId}: ${e.error}`).join("; ")
                                    : "—"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Data in (incoming)</CardTitle>
                    <p className="text-sm text-muted-foreground">Records of data received into the site</p>
                  </CardHeader>
                  <CardContent>
                    {stats.dataIn?.length === 0 ? (
                      <p className="text-muted-foreground">No records.</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {(stats.dataIn || []).slice(-20).reverse().map((e, i) => (
                          <li key={i} className="flex justify-between py-1 border-b border-border/40 last:border-0">
                            <span>{e.type} {e.orderId && `#${e.orderId.slice(0, 8)}`}</span>
                            <span className="text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Data out (exports / changes)</CardTitle>
                    <p className="text-sm text-muted-foreground">Records of data sent out or modified</p>
                  </CardHeader>
                  <CardContent>
                    {stats.dataOut?.length === 0 ? (
                      <p className="text-muted-foreground">No records.</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {(stats.dataOut || []).slice(-20).reverse().map((e, i) => (
                          <li key={i} className="flex justify-between py-1 border-b border-border/40 last:border-0">
                            <span>{e.type}</span>
                            <span className="text-muted-foreground">{new Date(e.at).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {view === "services" && (
          <div className="max-w-4xl space-y-8">
            <h1 className="font-display text-2xl font-bold text-foreground">Manage Services</h1>

            <Card className="shadow-card border-border/50">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Plus className="h-4 w-4" /> Add New Service</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Title</Label>
                    <Input placeholder="e.g. 90-Day Tag" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Price ($)</Label>
                    <Input type="number" step="0.01" placeholder="39.99" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea placeholder="Service description..." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <Label>Image</Label>
                  <Input type="file" accept="image/*" onChange={handleImageUpload} />
                </div>
                <Button onClick={handleAdd}>Add Service</Button>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {services.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-4 rounded-lg bg-card border border-border/50 shadow-card">
                  <div>
                    <h3 className="font-semibold text-foreground">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">${s.price.toFixed(2)}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "settings" && (
          <div className="max-w-2xl space-y-6">
            <h1 className="font-display text-2xl font-bold text-foreground">Settings</h1>
            <Card className="shadow-card border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Checkout & Pricing</CardTitle>
                <p className="text-sm text-muted-foreground">Tag price comes from the first service. Configure insurance options and test mode.</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {settings && (
                  <>
                    <p className="text-sm text-muted-foreground">Tag price: ${settings.tagPrice.toFixed(2)} (from first service in Services)</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>Insurance Monthly ($/month)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={settings.insuranceMonthlyPrice}
                          onChange={(e) => setSettings((s) => s ? { ...s, insuranceMonthlyPrice: parseFloat(e.target.value) || 0 } : null)}
                        />
                      </div>
                      <div>
                        <Label>Insurance Yearly ($/year)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={settings.insuranceYearlyPrice}
                          onChange={(e) => setSettings((s) => s ? { ...s, insuranceYearlyPrice: parseFloat(e.target.value) || 0 } : null)}
                        />
                      </div>
                      <div>
                        <Label>FedEx Delivery Fee ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={settings.overnightFedexFee ?? 50}
                          onChange={(e) => setSettings((s) => s ? { ...s, overnightFedexFee: parseFloat(e.target.value) || 0 } : null)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border/50">
                      <div>
                        <Label className="text-base">Test Mode</Label>
                        <p className="text-sm text-muted-foreground">Skip real Stripe payment and simulate checkout flow</p>
                      </div>
                      <Switch
                        checked={settings.testMode}
                        onCheckedChange={(checked) => setSettings((s) => s ? { ...s, testMode: checked } : null)}
                      />
                    </div>
                    <div>
                      <Label>Fallback claim timeout (ms)</Label>
                      <Input
                        type="number"
                        min="1000"
                        step="1000"
                        value={settings.fallbackClaimTimeoutMs ?? 45000}
                        onChange={(e) =>
                          setSettings((s) =>
                            s
                              ? {
                                  ...s,
                                  fallbackClaimTimeoutMs: parseInt(e.target.value || "0", 10) || 45000,
                                }
                              : null
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Time before leads auto-assign to fallback team (default 45000 ms = 45 seconds).
                      </p>
                    </div>
                    <Button onClick={handleSaveSettings} disabled={settingsSaving}>
                      {settingsSaving ? "Saving..." : "Save Settings"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Send className="h-4 w-4" /> Telegram Dispatchers
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  First-to-accept mode: each dispatcher receives claim messages. First to accept gets full details in their group. Requires webhook.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {(settings?.telegramDispatchers ?? []).map((d, i) => (
                  <div key={i} className="flex flex-wrap gap-3 items-end p-4 rounded-lg bg-muted/40 border border-border/50">
                    <div className="flex-1 min-w-[140px]">
                      <Label className="text-xs">Dispatcher ID (Telegram chat)</Label>
                      <Input
                        placeholder="-123456789"
                        value={d.dispatcherId}
                        onChange={(e) => updateDispatcher(i, "dispatcherId", e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <Label className="text-xs">Group ID</Label>
                      <Input
                        placeholder="-1001234567890"
                        value={d.groupId}
                        onChange={(e) => updateDispatcher(i, "groupId", e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <Label className="text-xs">Group name (for identification)</Label>
                      <Input
                        placeholder="Bronx Dispatch"
                        value={d.groupName}
                        onChange={(e) => updateDispatcher(i, "groupName", e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDispatcher(i)}
                      className="text-destructive hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addDispatcher} className="gap-2">
                  <Plus className="h-4 w-4" /> Add dispatcher
                </Button>
                {settings && (settings.telegramDispatchers?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Save Settings above to persist dispatchers. When any dispatchers are configured, new orders use first-to-accept flow instead of TELEGRAM_CHAT_IDS.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {view === "orders" && (
          <div className="space-y-6">
            <h1 className="font-display text-2xl font-bold text-foreground">Orders</h1>
            {orders.length === 0 ? (
              <p className="text-muted-foreground">No orders yet.</p>
            ) : (
              <Card className="shadow-card border-border/50 overflow-hidden">
                <div className="overflow-x-auto">
                    <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Delivery</TableHead>
                        <TableHead>VIN</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Color</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead>Telegram</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="text-sm">{new Date(o.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium">{o.firstName} {o.lastName}</TableCell>
                          <TableCell>{o.serviceTitle}</TableCell>
                          <TableCell>{o.deliveryMethod === "overnight_fedex" ? "FedEx Delivery" : o.deliveryMethod === "driver" ? "Driver" : (o.deliveryMethod === "email" ? "Email" : o.deliveryMethod || "—")}</TableCell>
                          <TableCell className="font-mono text-xs">{o.vin}</TableCell>
                          <TableCell>{o.carMakeModel}</TableCell>
                          <TableCell>{o.color}</TableCell>
                          <TableCell>{o.phone}</TableCell>
                          <TableCell className="text-right font-semibold">${o.price.toFixed(2)}</TableCell>
                          <TableCell>
                            {o.telegramSent ? (
                              <Badge variant="secondary" className="bg-success/10 text-success text-xs">Sent</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs">Failed</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
