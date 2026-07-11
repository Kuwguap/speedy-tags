import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type ServiceRecord, type OrderRecord, type AdminStats, type TelegramDispatcher, type TelegramWebhookInfo, type Affiliate } from "@/lib/api";
import { deliveryMethodLabel, productChoiceLabel } from "@/lib/checkout-pricing";

const CHECKOUT_STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "lead", label: "Leads (no payment)" },
  { id: "payment_pending", label: "Started payment" },
  { id: "dispute_risk", label: "Paid but unfinished" },
  { id: "paid", label: "Paid (any)" },
  { id: "complete", label: "Complete" },
] as const;
type CheckoutStatusFilter = (typeof CHECKOUT_STATUS_FILTERS)[number]["id"];

function checkoutStatusLabel(status?: string | null): string {
  switch (status) {
    case "lead_started":
      return "Lead — entered delivery info";
    case "payment_pending":
      return "Started Stripe checkout";
    case "paid":
      return "Paid — waiting for tag info";
    case "tag_info_submitted":
      return "Tag info submitted";
    case "complete":
      return "Complete (paid + info + docs)";
    default:
      return status || "—";
  }
}

function checkoutFunnelStage(o: OrderRecord): {
  stage: "lead" | "payment_pending" | "paid_unfinished" | "tag_info" | "complete" | "unknown";
  label: string;
  color: string;
} {
  if (o.checkoutStatus === "complete" || (o.docDriversLicense && o.tagInfoSubmittedAt)) {
    return { stage: "complete", label: "Complete", color: "bg-success/10 text-success" };
  }
  if (o.tagInfoSubmittedAt || o.checkoutStatus === "tag_info_submitted") {
    return {
      stage: "tag_info",
      label: "Info submitted",
      color: "bg-blue-500/10 text-blue-700",
    };
  }
  if (o.paidAt || o.paymentStatus === "paid" || o.checkoutStatus === "paid") {
    return {
      stage: "paid_unfinished",
      label: "Paid — no info",
      color: "bg-destructive/10 text-destructive",
    };
  }
  if (o.checkoutStatus === "payment_pending" || o.paymentPendingAt) {
    return {
      stage: "payment_pending",
      label: "Started payment",
      color: "bg-amber-500/10 text-amber-700",
    };
  }
  if (o.checkoutStatus === "lead_started" || o.leadStartedAt) {
    return { stage: "lead", label: "Lead", color: "bg-muted text-foreground/70" };
  }
  return { stage: "unknown", label: "—", color: "bg-muted text-muted-foreground" };
}
import { useSeo } from "@/hooks/useSeo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Wallet,
  Menu,
  X,
} from "lucide-react";
import AdminLogin from "./AdminLogin";

function formatUsd(value: unknown) {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function OrderDetailBlock({
  order,
  dispatchers,
}: {
  order: OrderRecord;
  dispatchers: TelegramDispatcher[];
}) {
  const pickedDispatcher = dispatchers.find(
    (d) =>
      String(d.groupId).trim() ===
      String(order.telegramAcceptedGroupId || "").trim(),
  );
  const pickedByName =
    (order.telegramAcceptedGroupName && order.telegramAcceptedGroupName.trim()) ||
    (pickedDispatcher?.groupName?.trim()) ||
    (order.telegramAcceptedGroupId ? `Group ${String(order.telegramAcceptedGroupId).slice(-4)}` : "");
  const pickedAt = order.telegramAcceptedAt
    ? new Date(order.telegramAcceptedAt).toLocaleString()
    : "";
  const aiSourceList = Array.isArray(order.docParsedSource)
    ? order.docParsedSource
    : order.docParsedSource
      ? [order.docParsedSource]
      : [];
  const fullName = `${order.firstName || ""} ${order.lastName || ""}`.trim() || "—";
  const vehicleLine = (order.year && order.make && order.model)
    ? `${order.year} ${order.make} ${order.model}`
    : (order.carMakeModel || order.vehicleInfo || "—");
  const deliveryLabel = deliveryMethodLabel(order.deliveryMethod);

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border/40 last:border-0 sm:grid sm:grid-cols-3 sm:gap-2 sm:py-1.5">
      <span className="text-[11px] sm:text-xs uppercase tracking-wide text-muted-foreground sm:col-span-1">{label}</span>
      <span className="text-sm sm:col-span-2 break-words">{value || "—"}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Lead status</div>
        {pickedByName ? (
          <>
            <div className="text-sm font-semibold text-foreground">
              ✅ Picked by <span className="text-success">{pickedByName}</span>
            </div>
            {pickedAt && (
              <div className="text-xs text-muted-foreground">at {pickedAt}</div>
            )}
            {order.telegramAcceptedGroupId && (
              <div className="text-xs font-mono text-muted-foreground">
                Group ID: {order.telegramAcceptedGroupId}
              </div>
            )}
            {order.telegramAcceptedBy && (
              <div className="text-xs font-mono text-muted-foreground">
                Accepting chat: {order.telegramAcceptedBy}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm font-semibold text-amber-600">
            ⏳ Unclaimed — visible to all configured dispatcher groups
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/50 p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Order</div>
        <Field label="Order ID" value={<span className="font-mono text-xs">{order.id}</span>} />
        <Field label="Created" value={new Date(order.createdAt).toLocaleString()} />
        <Field label="Service" value={order.serviceTitle} />
        <Field label="Price" value={`$${formatUsd(order.price)}`} />
        <Field label="Payment" value={order.paymentStatus || "—"} />
        {order.krableadsReferenceId ? (
          <Field
            label="Krableads ref"
            value={<span className="font-mono text-xs font-semibold">{order.krableadsReferenceId}</span>}
          />
        ) : null}
        {order.krableadsIngestError ? (
          <Field
            label="Krableads ingest"
            value={
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 text-xs whitespace-normal">
                {order.krableadsIngestError}
              </Badge>
            }
          />
        ) : null}
        <Field label="Product choice" value={productChoiceLabel(order.productChoice)} />
        {order.referralCode ? (
          <Field
            label="Referral source"
            value={
              <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
                /{order.referralCode}
              </Badge>
            }
          />
        ) : null}
        <Field
          label="Stripe session"
          value={
            order.stripeSessionId ? (
              <span className="font-mono text-xs break-all">{order.stripeSessionId}</span>
            ) : (
              "—"
            )
          }
        />
      </div>

      <div className="rounded-lg border border-border/50 p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Funnel timeline
        </div>
        <Field label="Status" value={checkoutStatusLabel(order.checkoutStatus)} />
        <Field
          label="Lead started"
          value={order.leadStartedAt ? new Date(order.leadStartedAt).toLocaleString() : "—"}
        />
        <Field
          label="Payment started"
          value={
            order.paymentPendingAt ? new Date(order.paymentPendingAt).toLocaleString() : "—"
          }
        />
        <Field
          label="Paid"
          value={order.paidAt ? new Date(order.paidAt).toLocaleString() : "—"}
        />
        <Field
          label="Tag info submitted"
          value={
            order.tagInfoSubmittedAt
              ? new Date(order.tagInfoSubmittedAt).toLocaleString()
              : "—"
          }
        />
        <Field
          label="Documents uploaded"
          value={
            order.documentsUploadedAt
              ? new Date(order.documentsUploadedAt).toLocaleString()
              : "—"
          }
        />
        <Field
          label="Last activity"
          value={
            order.lastActivityAt ? new Date(order.lastActivityAt).toLocaleString() : "—"
          }
        />
        {order.disputeRisk && (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
            Dispute risk: paid but never finished checkout. Reach out to this customer.
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/50 p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Customer</div>
        <Field label="Name" value={fullName} />
        <Field label="Phone" value={order.phone} />
        <Field label="Address" value={order.address} />
      </div>

      <div className="rounded-lg border border-border/50 p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Delivery</div>
        <Field label="Method" value={deliveryLabel} />
        <Field label="Email" value={order.deliveryEmail} />
        <Field label="Phone" value={order.deliveryPhone} />
        <Field label="Slot" value={order.deliverySlot} />
        <Field
          label="Scheduled"
          value={order.deliveryScheduledAt ? new Date(order.deliveryScheduledAt).toLocaleString() : ""}
        />
        <Field label="Delivery address" value={order.deliveryAddress} />
        <Field
          label="Same as registration"
          value={order.deliverySameAsRegistration ? "Yes" : "No"}
        />
      </div>

      <div className="rounded-lg border border-border/50 p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Vehicle</div>
        <Field label="VIN" value={<span className="font-mono">{order.vin}</span>} />
        <Field label="Vehicle" value={vehicleLine} />
        <Field label="Color" value={order.color} />
        <Field label="Insurance" value={order.insuranceCompany} />
        <Field label="Policy #" value={order.policyNumber} />
        <Field label="Notes" value={order.notes} />
      </div>

      <div className="rounded-lg border border-border/50 p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Documents</div>
        {order.docDriversLicense || order.docInsuranceCard || order.docVinPhoto || aiSourceList.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {order.docDriversLicense && (
              <li>
                <a
                  href={order.docDriversLicense}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Driver's License
                </a>
              </li>
            )}
            {order.docInsuranceCard && (
              <li>
                <a
                  href={order.docInsuranceCard}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Insurance Card
                </a>
              </li>
            )}
            {order.docVinPhoto && (
              <li>
                <a
                  href={order.docVinPhoto}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  VIN Photo
                </a>
              </li>
            )}
            {aiSourceList.map((url, i) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  AI source document {aiSourceList.length > 1 ? `${i + 1}/${aiSourceList.length}` : ""}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No documents uploaded.</p>
        )}
      </div>

      <div className="rounded-lg border border-border/50 p-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Telegram delivery</div>
        <Field
          label="Sent"
          value={
            order.telegramSent ? (
              <Badge variant="secondary" className="bg-success/10 text-success">Yes</Badge>
            ) : (
              <Badge variant="secondary" className="bg-destructive/10 text-destructive">No</Badge>
            )
          }
        />
        <Field
          label="Recipients"
          value={
            order.telegramRecipients?.length ? (
              <span className="font-mono text-xs">{order.telegramRecipients.join(", ")}</span>
            ) : (
              "—"
            )
          }
        />
        <Field
          label="Errors"
          value={
            order.telegramErrors?.length
              ? order.telegramErrors.map((e) => `${e.chatId}: ${e.error}`).join("; ")
              : "—"
          }
        />
      </div>
    </div>
  );
}

export default function Admin() {
  useSeo({ title: "Admin | TriStateTags", noindex: true });
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [view, setView] = useState<"services" | "orders" | "analytics" | "settings">("analytics");
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [checkoutStatusFilter, setCheckoutStatusFilter] =
    useState<CheckoutStatusFilter>("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [form, setForm] = useState({ title: "", description: "", price: "", image: "" });
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<{
    tagPrice: number;
    plateOnlyPrice: number;
    insuranceOnlyPrice: number;
    plateAndInsurancePrice: number;
    insuranceMonthlyPrice: number;
    insuranceYearlyPrice: number;
    overnightFedexFee: number;
    driverExtendedFee: number;
    driverLocalStates: string[] | string;
    testMode: boolean;
    backgroundMusicEnabled: boolean;
    telegramDispatchers: TelegramDispatcher[];
    fallbackClaimTimeoutMs: number;
    paymentLinks: { venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string };
    paymentDisplay: { venmo: string; cashApp: string; paypal: string; zelle: string; applePay: string };
  } | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<{ info: TelegramWebhookInfo; expectedUrl: string } | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookCustomUrl, setWebhookCustomUrl] = useState("");
  const [orderDetail, setOrderDetail] = useState<OrderRecord | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [affForm, setAffForm] = useState({ slug: "", label: "", telegramId: "" });
  const [affBusy, setAffBusy] = useState(false);

  const saveAffiliate = async (a: { slug: string; label?: string; telegramId?: string; active?: boolean }) => {
    setAffBusy(true);
    try {
      const res = await api.saveAffiliate(a);
      setAffiliates(res.affiliates);
      setAffForm({ slug: "", label: "", telegramId: "" });
      toast({ title: "Affiliate link saved" });
    } catch (err) {
      toast({ title: "Could not save", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setAffBusy(false);
    }
  };
  const removeAffiliate = async (slug: string) => {
    try {
      const res = await api.deleteAffiliate(slug);
      setAffiliates(res.affiliates);
    } catch (err) {
      toast({ title: "Could not remove", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  async function refreshWebhookInfo() {
    setWebhookLoading(true);
    try {
      const data = await api.getTelegramWebhook();
      setWebhookInfo(data);
    } catch (e) {
      toast({ title: "Webhook info failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setWebhookLoading(false);
    }
  }

  async function registerWebhook(url?: string) {
    setWebhookBusy(true);
    try {
      const r = await api.setTelegramWebhook(url);
      toast({ title: "Webhook registered", description: r.url });
      await refreshWebhookInfo();
    } catch (e) {
      toast({ title: "setWebhook failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setWebhookBusy(false);
    }
  }

  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;

  const reload = async () => {
    const t = localStorage.getItem("admin_token");
    if (!t) return;
    setLoading(true);
    try {
      const [svc, ord, st, sett, affs] = await Promise.all([
        api.getServicesAdmin(),
        api.getOrders(),
        api.getStats(),
        api.getSettings(),
        api.getAffiliates().catch(() => [] as Affiliate[]),
      ]);
      setServices(svc);
      setOrders(ord);
      setStats(st);
      setSettings(sett);
      setAffiliates(affs);
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

  useEffect(() => {
    if (view === "settings" && isAuthenticated && !webhookInfo && !webhookLoading) {
      refreshWebhookInfo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isAuthenticated]);

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
        plateOnlyPrice: settings.plateOnlyPrice,
        insuranceOnlyPrice: settings.insuranceOnlyPrice,
        plateAndInsurancePrice: settings.plateAndInsurancePrice,
        insuranceMonthlyPrice: settings.insuranceMonthlyPrice,
        insuranceYearlyPrice: settings.insuranceYearlyPrice,
        overnightFedexFee: settings.overnightFedexFee ?? 33,
        driverExtendedFee: settings.driverExtendedFee ?? 50,
        driverLocalStates: settings.driverLocalStates,
        testMode: settings.testMode,
        backgroundMusicEnabled: settings.backgroundMusicEnabled,
        telegramDispatchers: settings.telegramDispatchers ?? [],
        fallbackClaimTimeoutMs: settings.fallbackClaimTimeoutMs ?? 300000,
        paymentLinks: settings.paymentLinks ?? { venmo: "", cashApp: "", paypal: "", zelle: "", applePay: "" },
        paymentDisplay: settings.paymentDisplay ?? { venmo: "", cashApp: "", paypal: "", zelle: "", applePay: "" },
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

  const currentNavLabel =
    navItems.find((item) => item.key === view)?.label || "Admin";

  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar text-sidebar-foreground px-3 py-2.5 h-14">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-sidebar-primary">
            <Car className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <span className="font-display text-sm font-bold text-sidebar-primary-foreground truncate">
            {currentNavLabel}
          </span>
        </Link>
        <button
          type="button"
          aria-label="Open admin menu"
          onClick={() => setMobileNavOpen(true)}
          className="cursor-pointer h-10 w-10 inline-flex items-center justify-center rounded-lg border border-sidebar-border/70 bg-sidebar-accent/30 text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer backdrop */}
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm cursor-pointer"
        />
      )}

      {/* Sidebar / mobile drawer */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transform transition-transform duration-200 ease-out md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-5 border-b border-sidebar-border flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2.5 min-w-0"
            onClick={() => setMobileNavOpen(false)}
          >
            <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-sidebar-primary">
              <Car className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold text-sidebar-primary-foreground truncate">
              TriStateTags
            </span>
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
            className="md:hidden cursor-pointer h-9 w-9 inline-flex items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setView(item.key);
                setMobileNavOpen(false);
              }}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-3 md:py-2.5 text-sm font-medium transition-colors cursor-pointer ${
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
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive cursor-pointer"
          >
            <LogOut className="h-4 w-4 mr-2" /> Log out
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <Link to="/" className="gap-2" onClick={() => setMobileNavOpen(false)}>
              <ArrowLeft className="h-4 w-4" /> Back to Site
            </Link>
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 bg-background p-4 sm:p-6 md:p-10 pt-[4.5rem] md:pt-10 overflow-auto">
        {view === "analytics" && (
          <div className="space-y-6 md:space-y-8 max-w-5xl">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Analytics</h1>

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
                      <p className="text-3xl font-display font-bold">${formatUsd(stats.totalPayments)}</p>
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
                      <div className="hidden md:block overflow-x-auto">
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
                                <TableCell>${formatUsd(o.price)}</TableCell>
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
                    {(stats.ordersWithTelegramStatus?.length ?? 0) > 0 && (
                      <ul className="md:hidden divide-y divide-border/40">
                        {stats.ordersWithTelegramStatus?.map((o) => (
                          <li key={o.id} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="font-mono text-[11px] text-muted-foreground">
                                  #{o.id.slice(0, 8)}…
                                </div>
                                <div className="text-sm font-medium truncate">{o.serviceTitle}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {new Date(o.createdAt).toLocaleString()}
                                </div>
                                {o.telegramRecipients?.length ? (
                                  <div className="text-[11px] font-mono text-muted-foreground mt-1 truncate">
                                    {o.telegramRecipients.join(", ")}
                                  </div>
                                ) : null}
                                {o.telegramErrors?.length ? (
                                  <div className="text-[11px] text-destructive mt-1">
                                    {o.telegramErrors.map((e) => `${e.chatId}: ${e.error}`).join("; ")}
                                  </div>
                                ) : null}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-semibold text-sm">${formatUsd(o.price)}</div>
                                {o.telegramSent ? (
                                  <Badge variant="secondary" className="bg-success/10 text-success text-[10px] mt-1">
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Sent
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px] mt-1">
                                    <XCircle className="h-3 w-3 mr-1" /> Not sent
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
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
          <div className="max-w-4xl space-y-6 md:space-y-8">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Manage Services</h1>

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
                <div key={s.id} className="flex items-center justify-between gap-3 p-3 sm:p-4 rounded-lg bg-card border border-border/50 shadow-card">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground truncate">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">${formatUsd(s.price)}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} className="text-destructive hover:text-destructive cursor-pointer shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "settings" && (
          <div className="max-w-2xl space-y-5 md:space-y-6">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Settings</h1>
            <Card className="shadow-card border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><SettingsIcon className="h-4 w-4" /> Checkout & Pricing</CardTitle>
                <p className="text-sm text-muted-foreground">Flat checkout prices and delivery surcharges shown to customers.</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {settings && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <Label>Plate Only ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={settings.plateOnlyPrice ?? settings.tagPrice}
                          onChange={(e) => setSettings((s) => s ? { ...s, plateOnlyPrice: parseFloat(e.target.value) || 0 } : null)}
                        />
                      </div>
                      <div>
                        <Label>Insurance Only ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={settings.insuranceOnlyPrice}
                          onChange={(e) => setSettings((s) => s ? { ...s, insuranceOnlyPrice: parseFloat(e.target.value) || 0 } : null)}
                        />
                      </div>
                      <div>
                        <Label>Plate + Insurance ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={settings.plateAndInsurancePrice}
                          onChange={(e) => setSettings((s) => s ? { ...s, plateAndInsurancePrice: parseFloat(e.target.value) || 0 } : null)}
                        />
                      </div>
                      <div>
                        <Label>Overnight Shipping Fee ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={settings.overnightFedexFee ?? 33}
                          onChange={(e) => setSettings((s) => s ? { ...s, overnightFedexFee: parseFloat(e.target.value) || 0 } : null)}
                        />
                      </div>
                      <div>
                        <Label>Driver Extended Fee ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={settings.driverExtendedFee ?? 50}
                          onChange={(e) => setSettings((s) => s ? { ...s, driverExtendedFee: parseFloat(e.target.value) || 0 } : null)}
                        />
                      </div>
                      <div>
                        <Label>Local driver states (comma-separated)</Label>
                        <Input
                          value={
                            Array.isArray(settings.driverLocalStates)
                              ? settings.driverLocalStates.join(", ")
                              : String(settings.driverLocalStates || "NJ")
                          }
                          onChange={(e) =>
                            setSettings((s) =>
                              s
                                ? {
                                    ...s,
                                    driverLocalStates: e.target.value
                                      .split(",")
                                      .map((x) => x.trim().toUpperCase())
                                      .filter(Boolean),
                                  }
                                : null
                            )
                          }
                          placeholder="NJ"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border/50">
                      <div>
                        <Label className="text-base">Background music</Label>
                        <p className="text-sm text-muted-foreground">
                          Play Tokyo Drift on loop across the public site (not in admin)
                        </p>
                      </div>
                      <Switch
                        checked={settings.backgroundMusicEnabled ?? true}
                        onCheckedChange={(checked) =>
                          setSettings((s) => (s ? { ...s, backgroundMusicEnabled: checked } : null))
                        }
                      />
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
                        value={settings.fallbackClaimTimeoutMs ?? 300000}
                        onChange={(e) =>
                          setSettings((s) =>
                            s
                              ? {
                                  ...s,
                                  fallbackClaimTimeoutMs: parseInt(e.target.value || "0", 10) || 300000,
                                }
                              : null
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Time before leads auto-assign to fallback team (default 300000 ms = 5 minutes).
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
                  <Wallet className="h-4 w-4" /> Payment links (/payment & /payments)
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Links and display text for the payment page. Both /payment and /payments show the same page. Leave link empty to use fallback. Display is shown under each button (e.g. @TriStateTags); leave empty to auto-derive from link.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {["venmo", "cashApp", "paypal", "zelle", "applePay"].map((key) => (
                  <div key={key} className="space-y-2 p-3 rounded-lg border border-border/50 bg-muted/20">
                    <Label className="text-xs capitalize">{key === "cashApp" ? "Cash App" : key === "applePay" ? "Apple Pay" : key} — Link</Label>
                    <Input
                      placeholder={
                        key === "venmo" ? "https://venmo.com/u/TriStateTags" :
                        key === "cashApp" ? "https://cash.app/$tristatetag" :
                        key === "paypal" ? "https://www.paypal.com/paypalme/..." :
                        key === "zelle" ? "https://www.zellepay.com/" :
                        "tel:5513013737"
                      }
                      value={settings?.paymentLinks?.[key as keyof typeof settings.paymentLinks] ?? ""}
                      onChange={(e) =>
                        setSettings((s) =>
                          s
                            ? {
                                ...s,
                                paymentLinks: {
                                  ...(s.paymentLinks ?? { venmo: "", cashApp: "", paypal: "", zelle: "", applePay: "" }),
                                  [key]: e.target.value,
                                },
                              }
                            : null
                        )
                      }
                      className="font-mono text-sm"
                    />
                    <div>
                      <Label className="text-xs text-muted-foreground">Display under button (e.g. @handle, $tag, or email)</Label>
                      <Input
                        placeholder={key === "venmo" ? "@TriStateTags" : key === "cashApp" ? "$tristatetag" : key === "zelle" ? "@TriStateTagsPayment" : key === "applePay" ? "5513013737" : ""}
                        value={settings?.paymentDisplay?.[key as keyof typeof settings.paymentDisplay] ?? ""}
                        onChange={(e) =>
                          setSettings((s) =>
                            s
                              ? {
                                  ...s,
                                  paymentDisplay: {
                                    ...(s.paymentDisplay ?? { venmo: "", cashApp: "", paypal: "", zelle: "", applePay: "" }),
                                    [key]: e.target.value,
                                  },
                                }
                              : null
                          )
                        }
                        className="font-mono text-sm mt-1"
                      />
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Save Settings above to persist. Empty link = fallback; empty display = derived from link (or default for Zelle).
                </p>
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

            <Card className="shadow-card border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Send className="h-4 w-4" /> Affiliate links
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Give each driver/dispatcher a link like <code>tristatetags.com/name</code>. When someone buys through it, the sale is tagged with that name and their Telegram gets pinged (in addition to everyone else). Saves instantly.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {affiliates.map((a) => {
                  const link = `${typeof window !== "undefined" ? window.location.origin : "https://tristatetags.com"}/${a.slug}`;
                  return (
                    <div key={a.slug} className="flex flex-wrap gap-3 items-end p-4 rounded-lg bg-muted/40 border border-border/50">
                      <div className="flex-1 min-w-[180px]">
                        <Label className="text-xs">Link</Label>
                        <div className="flex items-center gap-2">
                          <code className="text-xs break-all">{link}</code>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs shrink-0"
                            onClick={() => {
                              navigator.clipboard?.writeText(link).then(() => toast({ title: "Link copied" })).catch(() => {});
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{a.label}</div>
                      </div>
                      <div className="flex-1 min-w-[150px]">
                        <Label className="text-xs">Their Telegram chat ID</Label>
                        <Input
                          placeholder="123456789"
                          defaultValue={a.telegramId}
                          className="font-mono text-sm"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (a.telegramId || "")) saveAffiliate({ slug: a.slug, label: a.label, telegramId: v, active: a.active });
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => saveAffiliate({ slug: a.slug, label: a.label, telegramId: a.telegramId, active: !a.active })}
                        className="shrink-0"
                      >
                        {a.active ? "Active" : "Off"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAffiliate(a.slug)}
                        className="text-destructive hover:text-destructive shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                <div className="flex flex-wrap gap-3 items-end p-4 rounded-lg border border-dashed border-border/60">
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-xs">Link name (the /slug)</Label>
                    <Input
                      placeholder="pavle"
                      value={affForm.slug}
                      onChange={(e) => setAffForm((f) => ({ ...f, slug: e.target.value }))}
                    />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-xs">Person's name (label)</Label>
                    <Input
                      placeholder="Pavle"
                      value={affForm.label}
                      onChange={(e) => setAffForm((f) => ({ ...f, label: e.target.value }))}
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <Label className="text-xs">Their Telegram chat ID</Label>
                    <Input
                      placeholder="123456789"
                      className="font-mono text-sm"
                      value={affForm.telegramId}
                      onChange={(e) => setAffForm((f) => ({ ...f, telegramId: e.target.value }))}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={affBusy || !affForm.slug.trim()}
                    onClick={() => saveAffiliate({ slug: affForm.slug, label: affForm.label || affForm.slug, telegramId: affForm.telegramId })}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" /> Add link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The person messages your Telegram bot once so it can DM them — paste their numeric chat ID here. Leave it blank to just track the source without pinging anyone.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-card border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Send className="h-4 w-4" /> Telegram Webhook
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Required so Accept/Decline buttons reach the server. If accepts silently do nothing, the webhook is usually the cause.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {webhookInfo ? (
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm space-y-1">
                    <div>
                      <span className="text-muted-foreground">Current URL:</span>{" "}
                      <code className="text-xs break-all">{webhookInfo.info.url || "(not set)"}</code>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expected URL:</span>{" "}
                      <code className="text-xs break-all">{webhookInfo.expectedUrl}</code>
                    </div>
                    {typeof webhookInfo.info.pending_update_count === "number" && (
                      <div>
                        <span className="text-muted-foreground">Pending updates:</span>{" "}
                        {webhookInfo.info.pending_update_count}
                      </div>
                    )}
                    {webhookInfo.info.last_error_message && (
                      <div className="text-destructive">
                        Last error: {webhookInfo.info.last_error_message}
                      </div>
                    )}
                    {webhookInfo.info.url &&
                      webhookInfo.info.url !== webhookInfo.expectedUrl && (
                        <div className="text-amber-600 dark:text-amber-400 text-xs">
                          Current URL doesn't match this server. Click "Register to this server" below.
                        </div>
                      )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {webhookLoading ? "Loading webhook info…" : "Webhook info not loaded."}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={refreshWebhookInfo}
                    disabled={webhookLoading}
                  >
                    {webhookLoading ? "Refreshing…" : "Refresh"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => registerWebhook()}
                    disabled={webhookBusy}
                  >
                    {webhookBusy ? "Registering…" : "Register to this server"}
                  </Button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border/40">
                  <Input
                    placeholder="https://your-api.example.com/api/telegram/webhook"
                    value={webhookCustomUrl}
                    onChange={(e) => setWebhookCustomUrl(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => registerWebhook(webhookCustomUrl.trim())}
                    disabled={webhookBusy || !webhookCustomUrl.trim()}
                  >
                    Register custom URL
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {view === "orders" && (
          <div className="space-y-5 md:space-y-6">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Orders & Leads</h1>
            <p className="text-sm text-muted-foreground -mt-3">
              Every shopper who reaches the delivery step is captured here, even
              if they never finish. Use the &quot;Paid but unfinished&quot; filter to find
              clients who could dispute their charge.
            </p>
            <div className="space-y-2">
              <Input
                placeholder="Search name, email, phone, Stripe ID…"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                inputMode="search"
                className="h-11 sm:h-9"
              />
              <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex items-center gap-2 px-1 min-w-max">
                  {CHECKOUT_STATUS_FILTERS.map((f) => (
                    <Button
                      key={f.id}
                      size="sm"
                      variant={checkoutStatusFilter === f.id ? "default" : "outline"}
                      onClick={() => setCheckoutStatusFilter(f.id)}
                      className="cursor-pointer h-9 px-3 whitespace-nowrap"
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            {orders.length === 0 ? (
              <p className="text-muted-foreground">No orders yet.</p>
            ) : (
              <Card className="shadow-card border-border/50 overflow-hidden">
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                    <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Name / Contact</TableHead>
                        <TableHead>Delivery</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead>Krableads</TableHead>
                        <TableHead>Stripe</TableHead>
                        <TableHead>Picked by</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders
                        .filter((o) => {
                          const stage = checkoutFunnelStage(o).stage;
                          if (checkoutStatusFilter === "all") return true;
                          if (checkoutStatusFilter === "dispute_risk")
                            return stage === "paid_unfinished";
                          if (checkoutStatusFilter === "lead") return stage === "lead";
                          if (checkoutStatusFilter === "payment_pending")
                            return stage === "payment_pending";
                          if (checkoutStatusFilter === "paid")
                            return ["paid_unfinished", "tag_info", "complete"].includes(stage);
                          if (checkoutStatusFilter === "complete")
                            return stage === "complete";
                          return true;
                        })
                        .filter((o) => {
                          const q = orderSearch.trim().toLowerCase();
                          if (!q) return true;
                          const hay = [
                            o.firstName,
                            o.lastName,
                            o.phone,
                            o.deliveryPhone,
                            o.deliveryEmail,
                            o.deliveryAddress,
                            o.address,
                            o.stripeSessionId,
                            o.vin,
                            o.id,
                            o.krableadsReferenceId,
                          ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();
                          return hay.includes(q);
                        })
                        .map((o) => {
                        const dispatcher = (settings?.telegramDispatchers ?? []).find(
                          (d) =>
                            String(d.groupId).trim() ===
                            String(o.telegramAcceptedGroupId || "").trim(),
                        );
                        const pickedByName =
                          (o.telegramAcceptedGroupName && o.telegramAcceptedGroupName.trim()) ||
                          (dispatcher?.groupName?.trim()) ||
                          (o.telegramAcceptedGroupId ? `Group ${String(o.telegramAcceptedGroupId).slice(-4)}` : "");
                        const pickedAt = o.telegramAcceptedAt
                          ? new Date(o.telegramAcceptedAt).toLocaleString()
                          : "";
                        const funnel = checkoutFunnelStage(o);
                        const fullName = `${o.firstName || ""} ${o.lastName || ""}`.trim();
                        const isPlaceholder = !fullName || fullName === "Pending";
                        const contactLine =
                          o.deliveryEmail || o.deliveryPhone || o.phone || "—";
                        return (
                          <TableRow
                            key={o.id}
                            className={`cursor-pointer hover:bg-muted/40 transition-colors ${
                              funnel.stage === "paid_unfinished"
                                ? "bg-destructive/5"
                                : ""
                            }`}
                            onClick={() => setOrderDetail(o)}
                          >
                            <TableCell className="text-xs whitespace-nowrap">
                              {new Date(o.createdAt).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={`${funnel.color} text-xs`}>
                                {funnel.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">
                                {isPlaceholder ? (
                                  <span className="text-muted-foreground">
                                    (no name yet)
                                  </span>
                                ) : (
                                  fullName
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{contactLine}</div>
                              {o.referralCode && (
                                <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] mt-1">
                                  /{o.referralCode}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div>{deliveryMethodLabel(o.deliveryMethod)}</div>
                              {o.deliveryAddress && (
                                <div className="text-muted-foreground truncate max-w-[200px]">
                                  {o.deliveryAddress}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {o.carMakeModel || (
                                <span className="text-muted-foreground">
                                  {o.vin ? o.vin : "—"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              ${formatUsd(o.price)}
                            </TableCell>
                            <TableCell className="font-mono text-[11px]">
                              {o.krableadsIngestError ? (
                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-xs">
                                  Error
                                </Badge>
                              ) : o.krableadsReferenceId ? (
                                <span>{o.krableadsReferenceId}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-[11px]">
                              {o.stripeSessionId ? (
                                <span className="text-muted-foreground">
                                  {o.stripeSessionId.slice(0, 14)}…
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {pickedByName ? (
                                <div className="text-xs">
                                  <Badge variant="secondary" className="bg-success/10 text-success">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    {pickedByName}
                                  </Badge>
                                  {pickedAt && (
                                    <div className="text-muted-foreground mt-1">{pickedAt}</div>
                                  )}
                                </div>
                              ) : funnel.stage === "lead" || funnel.stage === "payment_pending" ? (
                                <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs">
                                  No payment yet
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-xs">
                                  Unclaimed
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile card list */}
                <ul className="md:hidden divide-y divide-border/40">
                  {orders
                    .filter((o) => {
                      const stage = checkoutFunnelStage(o).stage;
                      if (checkoutStatusFilter === "all") return true;
                      if (checkoutStatusFilter === "dispute_risk")
                        return stage === "paid_unfinished";
                      if (checkoutStatusFilter === "lead") return stage === "lead";
                      if (checkoutStatusFilter === "payment_pending")
                        return stage === "payment_pending";
                      if (checkoutStatusFilter === "paid")
                        return ["paid_unfinished", "tag_info", "complete"].includes(stage);
                      if (checkoutStatusFilter === "complete")
                        return stage === "complete";
                      return true;
                    })
                    .filter((o) => {
                      const q = orderSearch.trim().toLowerCase();
                      if (!q) return true;
                      const hay = [
                        o.firstName,
                        o.lastName,
                        o.phone,
                        o.deliveryPhone,
                        o.deliveryEmail,
                        o.deliveryAddress,
                        o.address,
                        o.stripeSessionId,
                        o.vin,
                        o.id,
                        o.krableadsReferenceId,
                      ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                      return hay.includes(q);
                    })
                    .map((o) => {
                      const dispatcher = (settings?.telegramDispatchers ?? []).find(
                        (d) =>
                          String(d.groupId).trim() ===
                          String(o.telegramAcceptedGroupId || "").trim(),
                      );
                      const pickedByName =
                        (o.telegramAcceptedGroupName && o.telegramAcceptedGroupName.trim()) ||
                        dispatcher?.groupName?.trim() ||
                        (o.telegramAcceptedGroupId ? `Group ${String(o.telegramAcceptedGroupId).slice(-4)}` : "");
                      const funnel = checkoutFunnelStage(o);
                      const fullName = `${o.firstName || ""} ${o.lastName || ""}`.trim();
                      const isPlaceholder = !fullName || fullName === "Pending";
                      const contactLine = o.deliveryEmail || o.deliveryPhone || o.phone || "—";
                      return (
                        <li key={o.id}>
                          <button
                            type="button"
                            onClick={() => setOrderDetail(o)}
                            className={`w-full text-left px-4 py-3.5 cursor-pointer hover:bg-muted/40 active:bg-muted/60 transition-colors ${
                              funnel.stage === "paid_unfinished" ? "bg-destructive/5" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="secondary" className={`${funnel.color} text-[11px]`}>
                                    {funnel.label}
                                  </Badge>
                                  <span className="text-[11px] text-muted-foreground">
                                    {new Date(o.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <div className="font-medium text-sm mt-1.5 truncate">
                                  {isPlaceholder ? (
                                    <span className="text-muted-foreground">(no name yet)</span>
                                  ) : (
                                    fullName
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {contactLine}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1 truncate">
                                  {deliveryMethodLabel(o.deliveryMethod)}
                                  {o.carMakeModel ? ` · ${o.carMakeModel}` : ""}
                                </div>
                                {pickedByName ? (
                                  <div className="mt-1.5">
                                    <Badge variant="secondary" className="bg-success/10 text-success text-[11px]">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      {pickedByName}
                                    </Badge>
                                  </div>
                                ) : funnel.stage !== "lead" && funnel.stage !== "payment_pending" ? (
                                  <div className="mt-1.5">
                                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 text-[11px]">
                                      Unclaimed
                                    </Badge>
                                  </div>
                                ) : null}
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-base font-semibold">${formatUsd(o.price)}</div>
                                {o.krableadsReferenceId && !o.krableadsIngestError ? (
                                  <div className="text-[10px] font-mono text-muted-foreground mt-1 truncate max-w-[6.5rem]">
                                    {o.krableadsReferenceId}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </Card>
            )}
          </div>
        )}

        <Dialog open={!!orderDetail} onOpenChange={(open) => !open && setOrderDetail(null)}>
          <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] sm:w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg break-all">
                Lead details — #{orderDetail?.id?.slice(0, 8)}
              </DialogTitle>
            </DialogHeader>
            {orderDetail && (
              <OrderDetailBlock
                order={orderDetail}
                dispatchers={settings?.telegramDispatchers ?? []}
              />
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
