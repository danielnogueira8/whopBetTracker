"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useWhop } from "~/lib/whop-context";

interface EditBetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bet: any;
}

export function EditBetDialog({ open, onOpenChange, bet }: EditBetDialogProps) {
  const queryClient = useQueryClient();
  const { experience } = useWhop();
  const [result, setResult] = useState<"pending" | "win" | "lose" | "returned">("pending");

  useEffect(() => {
    if (bet) {
      setResult(bet.result);
    }
  }, [bet]);

  const updateBet = useMutation({
    mutationFn: async (betData: any) => {
      if (!experience) throw new Error("Experience not found");
      const response = await fetch(`/api/bets/${bet.id}?experienceId=${experience.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(betData),
      });
      if (!response.ok) throw new Error("Failed to update bet");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-bets"] });
      queryClient.invalidateQueries({ queryKey: ["my-bets"] });
      onOpenChange(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateBet.mutate({ result });
  };

  if (!bet) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="pt-6 pb-4">
          <DialogTitle>Edit Bet Result</DialogTitle>
          <DialogDescription>
            Update the result for your bet: {bet.game} - {bet.outcome}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-result">Result</Label>
              <Select value={result} onValueChange={(value: any) => setResult(value)}>
                <SelectTrigger id="edit-result">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="win">Win</SelectItem>
                  <SelectItem value="lose">Lose</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="pb-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateBet.isPending}>
              {updateBet.isPending ? "Updating..." : "Update Bet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

