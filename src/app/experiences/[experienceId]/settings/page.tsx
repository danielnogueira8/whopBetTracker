"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useWhop } from "~/lib/whop-context"
import { Settings as SettingsIcon } from "lucide-react"
import { Spinner } from "~/components/ui/spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select"
import { Switch } from "~/components/ui/switch"
import { Alert, AlertDescription } from "~/components/ui/alert"
 

interface Forum {
  id: string
  name: string
}

interface Settings {
  experienceId: string
  forumId: string | null
  autoPostEnabled: boolean
 
}

 

export default function SettingsPage() {
  const { experience, access } = useWhop()
  const queryClient = useQueryClient()
  const isAdmin = access?.accessLevel === "admin"

  // Fetch settings
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

 

  // Fetch forums
  const { data: forumsData, isLoading: isLoadingForums } = useQuery({
    queryKey: ["forums", experience?.id],
    queryFn: async () => {
      const response = await fetch(`/api/forums?experienceId=${experience?.id}`)
      if (!response.ok) throw new Error("Failed to fetch forums")
      const data = await response.json()
      return data.forums as Forum[]
    },
    enabled: !!experience?.id,
  })

  const [selectedForumId, setSelectedForumId] = useState<string>("")
  const [autoPostEnabled, setAutoPostEnabled] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
 

  // Initialize state from fetched settings
  useEffect(() => {
    if (settings) {
      setSelectedForumId(settings.forumId || "")
      setAutoPostEnabled(settings.autoPostEnabled)
      
    }
  }, [settings])

  const updateSettings = useMutation({
    mutationFn: async (settingsData: { forumId: string | null; autoPostEnabled: boolean }) => {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: experience?.id,
          forumId: settingsData.forumId || null,
          autoPostEnabled: settingsData.autoPostEnabled,
          
        }),
      })
      if (!response.ok) throw new Error("Failed to update settings")
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["experience-settings"] })
      setSaveMessage({ type: "success", text: "Settings saved successfully!" })
      setTimeout(() => setSaveMessage(null), 3000)
    },
    onError: () => {
      setSaveMessage({ type: "error", text: "Failed to save settings" })
      setTimeout(() => setSaveMessage(null), 3000)
    },
  })

  const handleSave = () => {
    setIsSaving(true)
    updateSettings.mutate({
      forumId: selectedForumId || null,
      autoPostEnabled,
    })
    setIsSaving(false)
  }

  if (isLoadingSettings || isLoadingForums) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-4">
          <Spinner className="size-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You need to be an admin to access forum integration settings.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Forum Integration</h1>
        <p className="mt-2 text-muted-foreground">
          Configure forum integration and automated posting options
        </p>
      </div>

      {saveMessage && (
        <Alert className={`mb-4 ${saveMessage.type === "success" ? "border-green-500" : "border-red-500"}`}>
          <AlertDescription>{saveMessage.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Forum Integration</CardTitle>
          <CardDescription>
            Automatically post upcoming bets to your selected forum
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="forum-select">Select Forum</Label>
            <Select value={selectedForumId} onValueChange={setSelectedForumId}>
              <SelectTrigger id="forum-select">
                <SelectValue placeholder="Select a forum" />
              </SelectTrigger>
              <SelectContent>
                {forumsData && forumsData.length > 0 ? (
                  forumsData.map((forum) => (
                    <SelectItem key={forum.id} value={forum.id}>
                      {forum.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-forums" disabled>
                    No forums available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Choose which forum to post upcoming bets to
            </p>
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="auto-post">Automatic Posting</Label>
              <p className="text-sm text-muted-foreground">
                Automatically post all new upcoming bets to the selected forum
              </p>
            </div>
            <Switch
              id="auto-post"
              checked={autoPostEnabled}
              onCheckedChange={setAutoPostEnabled}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • Select a forum to enable automated posting
          </p>
          <p>
            • When automatic posting is enabled, all new upcoming bets will be automatically posted to your selected forum
          </p>
          <p>
            • You can always opt out of posting individual bets using the checkbox during bet creation
          </p>
          <p>
            • When editing a bet, you can choose to update its forum post if one exists
          </p>
        </CardContent>
      </Card>

      
    </div>
  )
}

