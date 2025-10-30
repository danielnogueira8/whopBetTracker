"use client"

import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useWhop } from "~/lib/whop-context"
import { SidebarTrigger } from "~/components/ui/sidebar"
import { Spinner } from "~/components/ui/spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import { Switch } from "~/components/ui/switch"
import { Alert, AlertDescription } from "~/components/ui/alert"
import { Checkbox } from "~/components/ui/checkbox"
import { Lock, BrickWallShield, Info } from "lucide-react"
import { Input } from "~/components/ui/input"
import { toast } from "sonner"

interface Settings {
  experienceId: string
  forumId: string | null
  autoPostEnabled: boolean
  paywallConfig?: {
    enabled: boolean
    productIds: string[]
    rule: 'any' | 'all'
    lockedMessage?: string
  }
}

interface ProductItem {
  id: string
  title: string
  route: string
}

export default function PaywallPage() {
  const { experience, access } = useWhop()
  const queryClient = useQueryClient()
  const isAdmin = access?.accessLevel === "admin"

  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["experience-settings", experience?.id],
    queryFn: async () => {
      const response = await fetch(`/api/settings?experienceId=${experience?.id}`)
      if (!response.ok) throw new Error("Failed to fetch settings")
      const data = await response.json()
      return data.settings as Settings
    },
    enabled: !!experience?.id,
  })

  const { data: productsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["products", experience?.id],
    queryFn: async () => {
      const response = await fetch(`/api/whop/products?experienceId=${experience?.id}`)
      if (!response.ok) throw new Error("Failed to fetch products")
      const data = await response.json()
      return (data.products as ProductItem[]) || []
    },
    enabled: !!experience?.id,
  })

  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [paywallEnabled, setPaywallEnabled] = useState(false)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [lockedMessage, setLockedMessage] = useState("Subscribe to view odds, units, and explanations.")

  useEffect(() => {
    if (settings) {
      const cfg = settings.paywallConfig || { enabled: false, productIds: [], rule: 'any' }
      setPaywallEnabled(cfg.enabled)
      setSelectedProductIds(cfg.productIds || [])
      setLockedMessage(cfg.lockedMessage || "Subscribe to view odds, units, and explanations.")
    }
  }, [settings])

  const updateSettings = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: experience?.id,
          forumId: settings?.forumId || null,
          autoPostEnabled: settings?.autoPostEnabled ?? false,
          paywallConfig: {
            enabled: paywallEnabled,
            productIds: selectedProductIds,
            rule: 'any',
            lockedMessage: lockedMessage || "Subscribe to view odds, units, and explanations.",
          },
        }),
      })
      if (!response.ok) throw new Error("Failed to update settings")
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experience-settings"] })
      setSaveMessage({ type: "success", text: "Paywall settings saved" })
      setTimeout(() => setSaveMessage(null), 3000)
      toast.success("Paywall settings saved successfully!")
    },
    onError: () => {
      setSaveMessage({ type: "error", text: "Failed to save settings" })
      setTimeout(() => setSaveMessage(null), 3000)
      toast.error("Failed to save paywall settings")
    },
  })

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You need to be an admin to access paywall settings.
          </p>
        </div>
      </div>
    )
  }

  if (isLoadingSettings || isLoadingProducts) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-4">
          <Spinner className="size-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-4 p-4 border-b">
        <SidebarTrigger />
        <div className="flex items-center gap-2">
          <BrickWallShield className="h-6 w-6" />
          <h1 className="text-xl font-semibold">Paywall</h1>
        </div>
      </div>
      <div className="max-w-2xl p-6">
        <div className="mb-6">
          <p className="text-muted-foreground">
            Control who can see your Bet Picks content
          </p>
        </div>

      {saveMessage && (
        <Alert className={`mb-4 ${saveMessage.type === "success" ? "border-green-500" : "border-red-500"}`}>
          <AlertDescription>{saveMessage.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Enable Paywall for Bet Picks</CardTitle>
          <CardDescription>
            Non-eligible users will see the games you picked but details on the bet are hidden until they subscribe to any of your allowed products. The rest of the app will be available for everyone independently of having paywall enabled or disabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="paywall-enabled">Enable paywall for your Bet Picks</Label>
              </div>
              <Switch id="paywall-enabled" checked={paywallEnabled} onCheckedChange={setPaywallEnabled} />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>Users inside the selected products will be able to see your Bet Picks.</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Allowed products</Label>
            <div className="grid grid-cols-1 gap-2">
              {(productsData || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No products found for this experience.</p>) : (
                productsData!.map((p) => {
                  const checked = selectedProductIds.includes(p.id)
                  return (
                    <label key={p.id} className="flex items-center gap-3 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(val) => {
                          const isChecked = Boolean(val)
                          setSelectedProductIds((prev) => {
                            if (isChecked) return Array.from(new Set([...prev, p.id]))
                            return prev.filter((id) => id !== p.id)
                          })
                        }}
                      />
                      <span className="font-medium">{p.title}</span>
                      <span className="text-muted-foreground">({p.route})</span>
                    </label>
                  )
                })
              )}
            </div>
            <p className="text-xs text-muted-foreground">Access granted if user has any selected product.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="locked-message">Locked card message</Label>
            <Input
              id="locked-message"
              placeholder="Subscribe to view odds, units, and explanations."
              value={lockedMessage}
              onChange={(e) => setLockedMessage(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span>Locked cards remain visible but hide contents.</span>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => updateSettings.mutate()} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Paywall Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Card */}
      <Card className="border-dashed mt-8">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            This is how non-eligible users will see your Bet Picks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary border-primary">
                    Basketball
                  </span>
                </div>
                <CardTitle className="mt-2 line-clamp-2">Lakers vs Warriors</CardTitle>
                <CardDescription className="mt-1">Locked</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <Lock className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {lockedMessage || "Subscribe to view odds, units, and explanations."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}


